'use strict';
const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const webpush = require('web-push');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const POLL_MINUTES = Number(process.env.POLL_MINUTES || 5);
fs.mkdirSync(DATA_DIR, { recursive: true });

// ---------- VAPID ----------
let vapid = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
if (!vapid.publicKey || !vapid.privateKey) {
  const f = path.join(DATA_DIR, 'vapid.json');
  if (fs.existsSync(f)) vapid = JSON.parse(fs.readFileSync(f, 'utf8'));
  else { vapid = webpush.generateVAPIDKeys(); fs.writeFileSync(f, JSON.stringify(vapid)); }
}
webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@fenomenler.app', vapid.publicKey, vapid.privateKey);
const ADMIN_KEY = process.env.ADMIN_KEY || (() => {
  const f = path.join(DATA_DIR, 'admin.key');
  if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(16).toString('hex'));
  return fs.readFileSync(f, 'utf8').trim();
})();

// ---------- DB ----------
const db = new Database(path.join(DATA_DIR, 'fenomen.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, pass_hash TEXT NOT NULL, name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user', influencer_id INTEGER, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS influencers (id INTEGER PRIMARY KEY, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL, bio TEXT DEFAULT '', avatar TEXT DEFAULT '',
  category TEXT DEFAULT '', yt_channel_id TEXT, yt_handle TEXT, instagram TEXT, tiktok TEXT, owner_user_id INTEGER, verified INTEGER DEFAULT 0,
  claim_code TEXT, last_checked INTEGER, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS videos (id TEXT PRIMARY KEY, influencer_id INTEGER NOT NULL REFERENCES influencers(id) ON DELETE CASCADE, title TEXT, description TEXT,
  thumb TEXT, views INTEGER DEFAULT 0, published_at INTEGER, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_videos_inf ON videos(influencer_id, published_at DESC);
CREATE TABLE IF NOT EXISTS follows (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, influencer_id INTEGER NOT NULL REFERENCES influencers(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL, PRIMARY KEY (user_id, influencer_id));
CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, influencer_id INTEGER, video_id TEXT,
  type TEXT NOT NULL, text TEXT NOT NULL, link TEXT, is_read INTEGER DEFAULT 0, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS push_subs (endpoint TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, sub TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, influencer_id INTEGER NOT NULL REFERENCES influencers(id) ON DELETE CASCADE,
  sender TEXT NOT NULL, body TEXT NOT NULL, is_read INTEGER DEFAULT 0, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_msg ON messages(influencer_id, user_id, created_at);
`);

const now = () => Date.now();
function seed() {
  const ins = db.prepare(`INSERT OR IGNORE INTO influencers (slug,name,bio,avatar,category,yt_channel_id,yt_handle,instagram,tiktok,verified,created_at)
    VALUES (@slug,@name,@bio,@avatar,@category,@yt_channel_id,@yt_handle,@instagram,@tiktok,1,@created_at)`);
  for (const s of require('./seed-data')) ins.run({ ...s, created_at: now() });
}
seed();

// ---------- YouTube ----------
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
const decode = (s = '') => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
function tag(xml, name) { const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`)); return m ? decode(m[1].trim()) : ''; }
function attr(xml, name, a) { const m = xml.match(new RegExp(`<${name}[^>]*\\s${a}="([^"]*)"`)); return m ? decode(m[1]) : ''; }

async function fetchFeed(channelId) {
  const r = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`RSS ${r.status}`);
  const xml = await r.text();
  return xml.split('<entry>').slice(1).map(e => ({
    id: tag(e, 'yt:videoId'), title: tag(e, 'title'), description: tag(e, 'media:description').slice(0, 600),
    thumb: attr(e, 'media:thumbnail', 'url'), views: Number(attr(e, 'media:statistics', 'views') || 0),
    published_at: Date.parse(tag(e, 'published')) || now(),
  })).filter(v => v.id);
}

// @handle, kanal URL'si veya UC... ID'sinden kanal bilgisi çöz
async function resolveChannel(input) {
  input = String(input || '').trim();
  if (!input) throw new Error('Kanal bilgisi boş');
  let m = input.match(/(UC[A-Za-z0-9_-]{22})/);
  let url;
  if (m) url = `https://www.youtube.com/channel/${m[1]}`;
  else {
    m = input.match(/@([A-Za-z0-9._\-\u00C0-\u024F]+)/) || input.match(/^([A-Za-z0-9._\-\u00C0-\u024F]+)$/);
    if (!m) throw new Error('Geçersiz YouTube kanalı');
    url = `https://www.youtube.com/@${encodeURIComponent(m[1])}`;
  }
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'tr-TR,tr;q=0.9', Cookie: 'CONSENT=YES+1; SOCS=CAI' } });
  if (!r.ok) throw new Error('YouTube kanalı bulunamadı');
  const html = await r.text();
  const id = (html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})"/) || [])[1]
    || (html.match(/"externalId":"(UC[A-Za-z0-9_-]{22})"/) || [])[1];
  if (!id) throw new Error('Kanal ID çözülemedi');
  const meta = p => decode((html.match(new RegExp(`<meta property="og:${p}" content="([^"]*)"`)) || [])[1] || '');
  const handle = (html.match(/"canonicalBaseUrl":"\/(@[^"]+)"/) || [])[1] || (input.startsWith('@') ? input : '');
  return { id, name: meta('title'), avatar: meta('image').replace(/=s\d+-/, '=s300-'), description: meta('description'), handle, html };
}

const stmt = {
  videoExists: db.prepare('SELECT 1 FROM videos WHERE id=?'),
  insVideo: db.prepare(`INSERT INTO videos (id,influencer_id,title,description,thumb,views,published_at,created_at) VALUES (@id,@influencer_id,@title,@description,@thumb,@views,@published_at,@created_at)
    ON CONFLICT(id) DO UPDATE SET title=excluded.title, views=excluded.views, thumb=excluded.thumb`),
  followers: db.prepare('SELECT user_id FROM follows WHERE influencer_id=?'),
  insNotif: db.prepare('INSERT INTO notifications (user_id,influencer_id,video_id,type,text,link,created_at) VALUES (?,?,?,?,?,?,?)'),
  subsFor: db.prepare('SELECT * FROM push_subs WHERE user_id=?'),
  delSub: db.prepare('DELETE FROM push_subs WHERE endpoint=?'),
};

async function pushTo(userId, payload) {
  const subs = stmt.subsFor.all(userId);
  await Promise.all(subs.map(async s => {
    try { await webpush.sendNotification(JSON.parse(s.sub), JSON.stringify(payload), { TTL: 3600 }); }
    catch (e) { if (e.statusCode === 404 || e.statusCode === 410) stmt.delSub.run(s.endpoint); else console.warn('push hata', e.statusCode || e.message); }
  }));
  return subs.length;
}

async function notifyUser(userId, { influencer, video, type, text, link, title }) {
  stmt.insNotif.run(userId, influencer ? influencer.id : null, video ? video.id : null, type, text, link, now());
  return pushTo(userId, { title: title || 'Fenomenler', body: text, url: link || '/', icon: influencer ? influencer.avatar : '/icons/icon-192.png',
    image: video ? video.thumb : undefined, tag: video ? `v-${video.id}` : undefined });
}

async function pollInfluencer(inf) {
  if (!inf.yt_channel_id) return { inf: inf.slug, skipped: true };
  const entries = await fetchFeed(inf.yt_channel_id);
  const baseline = !inf.last_checked; // ilk taramada bildirim gönderme
  const fresh = [];
  db.transaction(() => {
    for (const v of entries) {
      const isNew = !stmt.videoExists.get(v.id);
      stmt.insVideo.run({ ...v, influencer_id: inf.id, created_at: now() });
      if (isNew) fresh.push(v);
    }
    db.prepare('UPDATE influencers SET last_checked=? WHERE id=?').run(now(), inf.id);
  })();
  let notified = 0;
  if (!baseline && fresh.length) {
    const followers = stmt.followers.all(inf.id);
    for (const v of fresh.sort((a, b) => a.published_at - b.published_at).slice(-3)) {
      for (const f of followers) {
        await notifyUser(f.user_id, { influencer: inf, video: v, type: 'video', title: `${inf.name} yeni video yükledi 🎬`,
          text: `${inf.name} yeni video yükledi: ${v.title}`, link: `/#/v/${v.id}` });
        notified++;
      }
    }
  }
  return { inf: inf.slug, entries: entries.length, fresh: fresh.length, baseline, notified };
}

let polling = false;
async function pollAll() {
  if (polling) return [];
  polling = true;
  const out = [];
  try {
    for (const inf of db.prepare('SELECT * FROM influencers WHERE yt_channel_id IS NOT NULL').all()) {
      try { out.push(await pollInfluencer(inf)); } catch (e) { out.push({ inf: inf.slug, error: e.message }); }
    }
  } finally { polling = false; }
  const sum = out.reduce((a, r) => a + (r.notified || 0), 0);
  console.log(`[poll ${new Date().toISOString()}] ${out.length} kanal tarandı, ${sum} bildirim`);
  return out;
}

// ---------- App ----------
const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

app.use((req, res, next) => {
  const t = req.cookies.sid;
  if (t) {
    const row = db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=?').get(t);
    if (row) req.user = row;
  }
  next();
});
const auth = (req, res, next) => req.user ? next() : res.status(401).json({ error: 'Giriş yapmalısın' });
const pubUser = u => u && ({ id: u.id, email: u.email, name: u.name, role: u.role, influencer_id: u.influencer_id });
function startSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token,user_id,created_at) VALUES (?,?,?)').run(token, userId, now());
  res.cookie('sid', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 1000 * 60 * 60 * 24 * 90 });
}
const slugify = s => String(s).toLowerCase().replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '').slice(0, 30) || 'fenomen';
const clean = (s, n = 500) => String(s || '').trim().slice(0, n);
const handleOnly = s => clean(s, 60).replace(/^https?:\/\/(www\.)?(instagram|tiktok)\.com\/@?/i, '').replace(/^@/, '').replace(/\/.*$/, '');

// Auth
app.post('/api/auth/signup', (req, res) => {
  const email = clean(req.body.email, 120).toLowerCase(), name = clean(req.body.name, 60), password = String(req.body.password || '');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Geçerli bir e-posta gir' });
  if (password.length < 6) return res.status(400).json({ error: 'Şifre en az 6 karakter olmalı' });
  if (!name) return res.status(400).json({ error: 'Adını gir' });
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) return res.status(409).json({ error: 'Bu e-posta zaten kayıtlı' });
  const role = req.body.role === 'influencer' ? 'influencer' : 'user';
  const info = db.prepare('INSERT INTO users (email,pass_hash,name,role,created_at) VALUES (?,?,?,?,?)').run(email, bcrypt.hashSync(password, 10), name, role, now());
  startSession(res, info.lastInsertRowid);
  res.json({ user: pubUser(db.prepare('SELECT * FROM users WHERE id=?').get(info.lastInsertRowid)) });
});
app.post('/api/auth/login', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(clean(req.body.email, 120).toLowerCase());
  if (!u || !bcrypt.compareSync(String(req.body.password || ''), u.pass_hash)) return res.status(401).json({ error: 'E-posta veya şifre hatalı' });
  startSession(res, u.id);
  res.json({ user: pubUser(u) });
});
app.post('/api/auth/logout', (req, res) => {
  if (req.cookies.sid) db.prepare('DELETE FROM sessions WHERE token=?').run(req.cookies.sid);
  res.clearCookie('sid'); res.json({ ok: true });
});
app.get('/api/me', (req, res) => {
  if (!req.user) return res.json({ user: null, vapidPublicKey: vapid.publicKey });
  const unreadNotif = db.prepare('SELECT COUNT(*) c FROM notifications WHERE user_id=? AND is_read=0').get(req.user.id).c;
  let unreadMsg = db.prepare("SELECT COUNT(*) c FROM messages WHERE user_id=? AND sender='influencer' AND is_read=0").get(req.user.id).c;
  if (req.user.influencer_id) unreadMsg += db.prepare("SELECT COUNT(*) c FROM messages WHERE influencer_id=? AND sender='user' AND is_read=0").get(req.user.influencer_id).c;
  const influencer = req.user.influencer_id ? db.prepare('SELECT * FROM influencers WHERE id=?').get(req.user.influencer_id) : null;
  res.json({ user: pubUser(req.user), influencer: influencer && infOut(influencer), unreadNotif, unreadMsg, vapidPublicKey: vapid.publicKey });
});

// Influencers
function infOut(i, userId) {
  const followers = db.prepare('SELECT COUNT(*) c FROM follows WHERE influencer_id=?').get(i.id).c;
  const videos = db.prepare('SELECT COUNT(*) c FROM videos WHERE influencer_id=?').get(i.id).c;
  const following = userId ? !!db.prepare('SELECT 1 FROM follows WHERE user_id=? AND influencer_id=?').get(userId, i.id) : false;
  const latest = db.prepare('SELECT published_at FROM videos WHERE influencer_id=? ORDER BY published_at DESC LIMIT 1').get(i.id);
  return { id: i.id, slug: i.slug, name: i.name, bio: i.bio, avatar: i.avatar, category: i.category, yt_channel_id: i.yt_channel_id, yt_handle: i.yt_handle,
    instagram: i.instagram, tiktok: i.tiktok, verified: !!i.verified, claimed: !!i.owner_user_id, followers, videos, following,
    latest_at: latest ? latest.published_at : null };
}
app.get('/api/influencers', (req, res) => {
  const q = `%${clean(req.query.q, 60)}%`;
  const rows = db.prepare(`SELECT * FROM influencers WHERE name LIKE ? OR slug LIKE ? OR category LIKE ? OR IFNULL(yt_handle,'') LIKE ?`).all(q, q, q, q);
  const list = rows.map(i => infOut(i, req.user && req.user.id)).sort((a, b) => (b.following - a.following) || ((b.latest_at || 0) - (a.latest_at || 0)));
  res.json({ influencers: list });
});
app.get('/api/influencers/:slug', (req, res) => {
  const i = db.prepare('SELECT * FROM influencers WHERE slug=? OR id=?').get(req.params.slug, req.params.slug);
  if (!i) return res.status(404).json({ error: 'Fenomen bulunamadı' });
  const videos = db.prepare('SELECT * FROM videos WHERE influencer_id=? ORDER BY published_at DESC LIMIT 60').all(i.id);
  const out = infOut(i, req.user && req.user.id);
  out.is_owner = !!(req.user && i.owner_user_id === req.user.id);
  res.json({ influencer: out, videos });
});
app.post('/api/influencers/:id/follow', auth, (req, res) => {
  const i = db.prepare('SELECT * FROM influencers WHERE id=?').get(req.params.id);
  if (!i) return res.status(404).json({ error: 'Fenomen bulunamadı' });
  const exists = db.prepare('SELECT 1 FROM follows WHERE user_id=? AND influencer_id=?').get(req.user.id, i.id);
  if (exists) db.prepare('DELETE FROM follows WHERE user_id=? AND influencer_id=?').run(req.user.id, i.id);
  else {
    db.prepare('INSERT INTO follows (user_id,influencer_id,created_at) VALUES (?,?,?)').run(req.user.id, i.id, now());
    if (i.owner_user_id && i.owner_user_id !== req.user.id)
      notifyUser(i.owner_user_id, { type: 'follow', text: `${req.user.name} seni takip etmeye başladı`, link: `/#/u/${i.slug}` }).catch(() => {});
  }
  res.json({ following: !exists, influencer: infOut(i, req.user.id) });
});

// Influencer onboarding: create or claim
app.post('/api/influencers', auth, async (req, res) => {
  if (req.user.influencer_id) return res.status(400).json({ error: 'Zaten bir fenomen profilin var' });
  try {
    let ch = null;
    if (req.body.youtube) {
      ch = await resolveChannel(req.body.youtube);
      const existing = db.prepare('SELECT * FROM influencers WHERE yt_channel_id=?').get(ch.id);
      if (existing) return res.status(409).json({ error: 'Bu kanal zaten kayıtlı — profili sahiplenebilirsin', slug: existing.slug, id: existing.id });
    }
    const name = clean(req.body.name, 60) || (ch && ch.name);
    if (!name) return res.status(400).json({ error: 'İsim gerekli' });
    let slug = slugify(req.body.slug || name), base = slug, n = 1;
    while (db.prepare('SELECT 1 FROM influencers WHERE slug=?').get(slug)) slug = base + (++n);
    const info = db.prepare(`INSERT INTO influencers (slug,name,bio,avatar,category,yt_channel_id,yt_handle,instagram,tiktok,owner_user_id,claim_code,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(slug, name, clean(req.body.bio) || (ch ? ch.description.slice(0, 300) : ''),
      clean(req.body.avatar, 400) || (ch ? ch.avatar : ''), clean(req.body.category, 40), ch ? ch.id : null, ch ? ch.handle : null,
      handleOnly(req.body.instagram) || null, handleOnly(req.body.tiktok) || null, req.user.id, 'FNM-' + crypto.randomBytes(3).toString('hex').toUpperCase(), now());
    db.prepare("UPDATE users SET role='influencer', influencer_id=? WHERE id=?").run(info.lastInsertRowid, req.user.id);
    const inf = db.prepare('SELECT * FROM influencers WHERE id=?').get(info.lastInsertRowid);
    pollInfluencer(inf).catch(() => {});
    res.json({ influencer: infOut(inf, req.user.id) });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/influencers/:id/claim', auth, (req, res) => {
  if (req.user.influencer_id) return res.status(400).json({ error: 'Zaten bir fenomen profilin var' });
  const i = db.prepare('SELECT * FROM influencers WHERE id=?').get(req.params.id);
  if (!i) return res.status(404).json({ error: 'Fenomen bulunamadı' });
  if (i.owner_user_id) return res.status(409).json({ error: 'Bu profil zaten sahiplenilmiş' });
  const code = 'FNM-' + crypto.randomBytes(3).toString('hex').toUpperCase();
  res.json({ code, instructions: `Kanalının YouTube "Hakkında" açıklamasına ${code} kodunu ekle, sonra "Doğrula"ya bas. Doğrulama sonrası kodu silebilirsin.`,
    token: Buffer.from(JSON.stringify({ i: i.id, u: req.user.id, c: code, s: crypto.createHmac('sha256', ADMIN_KEY).update(`${i.id}:${req.user.id}:${code}`).digest('hex') })).toString('base64url') });
});
app.post('/api/influencers/:id/verify', auth, async (req, res) => {
  try {
    const t = JSON.parse(Buffer.from(String(req.body.token || ''), 'base64url').toString());
    const ok = t.u === req.user.id && String(t.i) === String(req.params.id) &&
      t.s === crypto.createHmac('sha256', ADMIN_KEY).update(`${t.i}:${t.u}:${t.c}`).digest('hex');
    if (!ok) return res.status(400).json({ error: 'Geçersiz doğrulama isteği' });
    const i = db.prepare('SELECT * FROM influencers WHERE id=?').get(t.i);
    if (!i || i.owner_user_id) return res.status(409).json({ error: 'Profil sahiplenilemez' });
    const r = await fetch(`https://www.youtube.com/channel/${i.yt_channel_id}/about`, { headers: { 'User-Agent': UA, Cookie: 'CONSENT=YES+1; SOCS=CAI' } });
    const html = await r.text();
    if (!html.includes(t.c)) return res.status(400).json({ error: `Kod (${t.c}) kanal açıklamasında bulunamadı. Ekledikten birkaç dakika sonra tekrar dene.` });
    db.prepare('UPDATE influencers SET owner_user_id=?, verified=1 WHERE id=?').run(req.user.id, i.id);
    db.prepare("UPDATE users SET role='influencer', influencer_id=? WHERE id=?").run(i.id, req.user.id);
    res.json({ ok: true, slug: i.slug });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.put('/api/influencers/:id', auth, (req, res) => {
  const i = db.prepare('SELECT * FROM influencers WHERE id=?').get(req.params.id);
  if (!i || i.owner_user_id !== req.user.id) return res.status(403).json({ error: 'Yetkin yok' });
  db.prepare('UPDATE influencers SET name=?, bio=?, avatar=?, category=?, instagram=?, tiktok=? WHERE id=?').run(
    clean(req.body.name, 60) || i.name, clean(req.body.bio), clean(req.body.avatar, 400) || i.avatar, clean(req.body.category, 40),
    handleOnly(req.body.instagram) || null, handleOnly(req.body.tiktok) || null, i.id);
  res.json({ influencer: infOut(db.prepare('SELECT * FROM influencers WHERE id=?').get(i.id), req.user.id) });
});

// Feed
app.get('/api/feed', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 50), before = Number(req.query.before) || 9e15;
  const mode = req.user && req.query.mode !== 'all' ? 'following' : 'all';
  let rows = [];
  const sel = `SELECT v.*, i.slug, i.name, i.avatar, i.verified FROM videos v JOIN influencers i ON i.id=v.influencer_id`;
  if (mode === 'following') rows = db.prepare(`${sel} JOIN follows f ON f.influencer_id=i.id AND f.user_id=? WHERE v.published_at<? ORDER BY v.published_at DESC LIMIT ?`).all(req.user.id, before, limit);
  if (!rows.length && before === 9e15 && mode === 'following') return res.json({ videos: db.prepare(`${sel} ORDER BY v.published_at DESC LIMIT ?`).all(limit), mode: 'all', fallback: true });
  if (mode === 'all') rows = db.prepare(`${sel} WHERE v.published_at<? ORDER BY v.published_at DESC LIMIT ?`).all(before, limit);
  res.json({ videos: rows, mode });
});
app.get('/api/videos/:id', (req, res) => {
  const v = db.prepare('SELECT v.*, i.slug, i.name, i.avatar, i.verified, i.id inf_id FROM videos v JOIN influencers i ON i.id=v.influencer_id WHERE v.id=?').get(req.params.id);
  if (!v) return res.status(404).json({ error: 'Video bulunamadı' });
  res.json({ video: v });
});

// Notifications
app.get('/api/notifications', auth, (req, res) => {
  const rows = db.prepare(`SELECT n.*, i.avatar, i.slug, i.name inf_name, v.thumb FROM notifications n LEFT JOIN influencers i ON i.id=n.influencer_id
    LEFT JOIN videos v ON v.id=n.video_id WHERE n.user_id=? ORDER BY n.created_at DESC LIMIT 100`).all(req.user.id);
  db.prepare('UPDATE notifications SET is_read=1 WHERE user_id=?').run(req.user.id);
  res.json({ notifications: rows });
});
app.post('/api/push/subscribe', auth, (req, res) => {
  const sub = req.body.subscription;
  if (!sub || !sub.endpoint) return res.status(400).json({ error: 'Geçersiz abonelik' });
  db.prepare('INSERT OR REPLACE INTO push_subs (endpoint,user_id,sub,created_at) VALUES (?,?,?,?)').run(sub.endpoint, req.user.id, JSON.stringify(sub), now());
  res.json({ ok: true });
});
app.post('/api/push/unsubscribe', auth, (req, res) => { if (req.body.endpoint) stmt.delSub.run(req.body.endpoint); res.json({ ok: true }); });
app.post('/api/push/test', auth, async (req, res) => {
  const n = await notifyUser(req.user.id, { type: 'system', title: 'Fenomenler 🔔', text: 'Bildirimler çalışıyor! Takip ettiğin fenomenler video yükleyince haber vereceğim.', link: '/#/notifications' });
  res.json({ ok: true, devices: n });
});

// Messages
app.get('/api/inbox', auth, (req, res) => {
  const asUser = db.prepare(`SELECT m.influencer_id, i.name, i.avatar, i.slug, i.verified, m.body last_body, m.sender last_sender, m.created_at,
      (SELECT COUNT(*) FROM messages x WHERE x.user_id=m.user_id AND x.influencer_id=m.influencer_id AND x.sender='influencer' AND x.is_read=0) unread
    FROM messages m JOIN influencers i ON i.id=m.influencer_id WHERE m.id IN (SELECT MAX(id) FROM messages WHERE user_id=? GROUP BY influencer_id) ORDER BY m.created_at DESC`).all(req.user.id);
  let asInfluencer = [];
  if (req.user.influencer_id) asInfluencer = db.prepare(`SELECT m.user_id, u.name, m.body last_body, m.sender last_sender, m.created_at,
      (SELECT COUNT(*) FROM messages x WHERE x.user_id=m.user_id AND x.influencer_id=m.influencer_id AND x.sender='user' AND x.is_read=0) unread
    FROM messages m JOIN users u ON u.id=m.user_id WHERE m.id IN (SELECT MAX(id) FROM messages WHERE influencer_id=? GROUP BY user_id) ORDER BY m.created_at DESC`).all(req.user.influencer_id);
  res.json({ asUser, asInfluencer });
});
// Kullanıcı tarafı: /api/chat/:influencerId ; Fenomen tarafı: /api/chat/:influencerId?user=ID
function chatCtx(req) {
  const inf = db.prepare('SELECT * FROM influencers WHERE id=?').get(req.params.influencerId);
  if (!inf) return { err: [404, 'Fenomen bulunamadı'] };
  if (req.query.user && req.user.influencer_id === inf.id) {
    const other = db.prepare('SELECT id,name FROM users WHERE id=?').get(req.query.user);
    if (!other) return { err: [404, 'Kullanıcı bulunamadı'] };
    return { inf, userId: other.id, other, side: 'influencer' };
  }
  return { inf, userId: req.user.id, side: 'user' };
}
app.get('/api/chat/:influencerId', auth, (req, res) => {
  const c = chatCtx(req); if (c.err) return res.status(c.err[0]).json({ error: c.err[1] });
  const msgs = db.prepare('SELECT id,sender,body,created_at FROM messages WHERE influencer_id=? AND user_id=? ORDER BY id ASC LIMIT 500').all(c.inf.id, c.userId);
  db.prepare('UPDATE messages SET is_read=1 WHERE influencer_id=? AND user_id=? AND sender=?').run(c.inf.id, c.userId, c.side === 'user' ? 'influencer' : 'user');
  res.json({ side: c.side, influencer: infOut(c.inf), other: c.other || null, messages: msgs });
});
app.post('/api/chat/:influencerId', auth, (req, res) => {
  const c = chatCtx(req); if (c.err) return res.status(c.err[0]).json({ error: c.err[1] });
  const body = clean(req.body.body, 2000);
  if (!body) return res.status(400).json({ error: 'Mesaj boş olamaz' });
  if (c.side === 'user' && req.user.influencer_id === c.inf.id) return res.status(400).json({ error: 'Kendine mesaj gönderemezsin' });
  const info = db.prepare('INSERT INTO messages (user_id,influencer_id,sender,body,created_at) VALUES (?,?,?,?,?)').run(c.userId, c.inf.id, c.side, body, now());
  if (c.side === 'user' && c.inf.owner_user_id)
    notifyUser(c.inf.owner_user_id, { type: 'message', title: `💬 ${req.user.name}`, text: `${req.user.name}: ${body.slice(0, 120)}`, link: `/#/chat/${c.inf.id}/${req.user.id}` }).catch(() => {});
  if (c.side === 'influencer')
    notifyUser(c.userId, { influencer: c.inf, type: 'message', title: `💬 ${c.inf.name}`, text: `${c.inf.name}: ${body.slice(0, 120)}`, link: `/#/chat/${c.inf.id}` }).catch(() => {});
  res.json({ message: db.prepare('SELECT id,sender,body,created_at FROM messages WHERE id=?').get(info.lastInsertRowid) });
});

// Admin: manuel tarama
app.post('/api/admin/poll', async (req, res) => {
  if ((req.query.key || req.get('x-admin-key')) !== ADMIN_KEY) return res.status(403).json({ error: 'forbidden' });
  res.json({ results: await pollAll() });
});
app.get('/healthz', (req, res) => res.json({ ok: true }));

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'], setHeaders: (res, p) => { if (p.endsWith('sw.js')) res.setHeader('Cache-Control', 'no-cache'); } }));
app.get(/^\/(?!api).*/, (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log(`Fenomenler http://localhost:${PORT} — YouTube her ${POLL_MINUTES} dk'da bir taranıyor`);
  pollAll();
  setInterval(pollAll, POLL_MINUTES * 60 * 1000);
});
module.exports = { app, pollAll, db };
