'use strict';
const $ = s => document.querySelector(s);
const view = $('#view');
const S = { me: null, influencer: null, vapid: null, likes: new Set(JSON.parse(localStorage.getItem('likes') || '[]')) };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const VER = '<svg class="verified" viewBox="0 0 24 24"><path fill="#0095f6" stroke="none" d="m12 1 2.6 2 3.3-.3 1 3.1 2.8 1.8-1 3.1 1 3.1-2.8 1.8-1 3.1-3.3-.3L12 23l-2.6-2-3.3.3-1-3.1-2.8-1.8 1-3.1-1-3.1 2.8-1.8 1-3.1 3.3.3Z"/><path stroke="#fff" stroke-width="2.2" fill="none" d="m7.5 12.2 3 3 6-6.2"/></svg>';
const ICON = {
  heart: '<svg viewBox="0 0 24 24"><path d="M16.8 3.5c-2 0-3.7 1-4.8 2.6A5.7 5.7 0 0 0 7.2 3.5 5.2 5.2 0 0 0 2 8.9c0 6 9 11.6 10 11.6s10-5.6 10-11.6a5.2 5.2 0 0 0-5.2-5.4Z"/></svg>',
  msg: '<svg viewBox="0 0 24 24"><path d="M20.7 16.5A9.5 9.5 0 1 0 17 20.4L21.5 21.5Z"/></svg>',
  share: '<svg viewBox="0 0 24 24"><path d="M22 3 9.2 10.1M22 3l-6.8 18-4.4-8.4L2 8.3Z"/></svg>',
  yt: '<svg viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="4"/><path d="m10 9 5 3-5 3Z" class="fill"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M15 5 8 12l7 7"/></svg>',
};
function ago(t) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'şimdi';
  if (s < 3600) return Math.floor(s / 60) + ' dk önce';
  if (s < 86400) return Math.floor(s / 3600) + ' sa önce';
  if (s < 86400 * 7) return Math.floor(s / 86400) + ' gün önce';
  return new Date(t).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: new Date(t).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}
const fmt = n => n >= 1e6 ? (n / 1e6).toFixed(1).replace('.0', '').replace('.', ',') + ' Mn' : n >= 1e3 ? (n / 1e3).toFixed(1).replace('.0', '').replace('.', ',') + ' B' : String(n || 0);
function toast(m) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 2600); }
async function api(path, opts = {}) {
  const r = await fetch('/api' + path, { method: opts.method || (opts.body ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json' }, body: opts.body ? JSON.stringify(opts.body) : undefined, credentials: 'same-origin' });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(d.error || 'Bir hata oluştu'); e.status = r.status; e.data = d; throw e; }
  return d;
}
function needLogin(msg) { toast(msg || 'Önce giriş yapmalısın'); location.hash = '#/login?next=' + encodeURIComponent(location.hash); }

async function refreshMe() {
  try {
    const d = await api('/me');
    S.me = d.user; S.influencer = d.influencer || null; S.vapid = d.vapidPublicKey;
    $('#notif-dot').hidden = !d.unreadNotif;
    $('#msg-badge').hidden = !d.unreadMsg; $('#msg-badge').textContent = d.unreadMsg || '';
    const a = $('#tab-me .me-avatar');
    if (S.influencer && S.influencer.avatar) a.innerHTML = `<img src="${esc(S.influencer.avatar)}" style="width:100%;height:100%;object-fit:cover">`;
    else a.textContent = S.me ? S.me.name[0].toUpperCase() : '?';
  } catch { }
}

// ---------- components ----------
const avatar = (src, cls = 'av') => `<img class="${cls}" src="${esc(src || '/icons/icon-192.png')}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.src='/icons/icon-192.png'">`;
function postCard(v) {
  const liked = S.likes.has(v.id);
  return `<article class="post" data-id="${esc(v.id)}">
    <div class="post-head">
      <a href="#/u/${esc(v.slug)}" class="av ringed" style="width:38px;height:38px">${avatar(v.avatar, '')}</a>
      <div class="who"><a href="#/u/${esc(v.slug)}"><b>${esc(v.name)}</b>${v.verified ? VER : ''}</a><small>YouTube · ${fmt(v.views)} görüntülenme</small></div>
      <a href="https://www.youtube.com/watch?v=${esc(v.id)}" target="_blank" rel="noopener" aria-label="YouTube'da aç">${ICON.yt}</a>
    </div>
    <div class="media" data-play="${esc(v.id)}">
      <img src="https://i.ytimg.com/vi/${esc(v.id)}/hqdefault.jpg" alt="" loading="lazy">
      <span class="yt-chip">YouTube</span><div class="play"><i></i></div>
    </div>
    <div class="actions">
      <button class="like ${liked ? 'liked' : ''}" data-like="${esc(v.id)}" aria-label="Beğen">${ICON.heart}</button>
      <a href="#/chat/${v.influencer_id}" aria-label="Mesaj gönder">${ICON.msg}</a>
      <button data-share="${esc(v.id)}" data-title="${esc(v.title)}" aria-label="Paylaş">${ICON.share}</button>
      <span class="sp"></span>
    </div>
    <div class="meta"><a href="#/u/${esc(v.slug)}"><b>${esc(v.name)}</b></a> ${esc(v.title)}</div>
    <div class="time">${ago(v.published_at)}</div>
  </article>`;
}
function bindPosts(root) {
  root.querySelectorAll('[data-play]').forEach(m => m.onclick = () => {
    m.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${m.dataset.play}?autoplay=1&playsinline=1&rel=0" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
    m.onclick = null;
  });
  root.querySelectorAll('[data-like]').forEach(b => b.onclick = () => {
    const id = b.dataset.like;
    S.likes.has(id) ? S.likes.delete(id) : S.likes.add(id);
    b.classList.toggle('liked', S.likes.has(id));
    localStorage.setItem('likes', JSON.stringify([...S.likes].slice(-500)));
  });
  root.querySelectorAll('[data-share]').forEach(b => b.onclick = async () => {
    const url = `https://www.youtube.com/watch?v=${b.dataset.share}`;
    if (navigator.share) navigator.share({ title: b.dataset.title, url }).catch(() => { });
    else { await navigator.clipboard?.writeText(url); toast('Bağlantı kopyalandı'); }
  });
}
async function toggleFollow(btn, inf) {
  if (!S.me) return needLogin('Takip etmek için giriş yap');
  btn.disabled = true;
  try {
    const d = await api(`/influencers/${inf.id}/follow`, { method: 'POST' });
    inf.following = d.following; inf.followers = d.influencer.followers;
    toast(d.following ? `${inf.name} takip ediliyor — yeni videolarda bildirim alacaksın 🔔` : 'Takipten çıkıldı');
    if (d.following) maybeAskPush();
    return d;
  } catch (e) { toast(e.message); } finally { btn.disabled = false; }
}

// ---------- push ----------
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
function b64ToU8(b) { const p = '='.repeat((4 - b.length % 4) % 4); const s = atob((b + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...s].map(c => c.charCodeAt(0))); }
async function enablePush() {
  if (!pushSupported()) { toast('Bu tarayıcı bildirimleri desteklemiyor. iPhone\'da önce "Ana Ekrana Ekle" yap.'); return false; }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') { toast('Bildirim izni verilmedi'); return false; }
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(S.vapid) });
    await api('/push/subscribe', { body: { subscription: sub.toJSON() } });
  } catch (e) { toast('Bildirim aboneliği oluşturulamadı: ' + e.message); return false; }
  localStorage.setItem('pushOn', '1');
  toast('Bildirimler açıldı 🔔');
  return true;
}
async function pushState() {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && await reg.pushManager.getSubscription();
  return sub ? 'on' : 'off';
}
async function maybeAskPush() {
  if ((await pushState()) === 'off' && !localStorage.getItem('pushAsked')) {
    localStorage.setItem('pushAsked', '1');
    setTimeout(() => { if (confirm('Takip ettiğin fenomenler video yüklediğinde telefonuna bildirim gelsin mi?')) enablePush(); }, 400);
  }
}

// ---------- pages ----------
const routes = {};
async function pageHome(params) {
  const mode = params.get('mode') || (S.me ? 'following' : 'all');
  view.innerHTML = `<div class="stories" id="stories">${'<div class="story"><div class="ring seen skel"></div></div>'.repeat(6)}</div>
    ${S.me ? `<div class="feed-tabs"><a class="chip ${mode === 'following' ? 'on' : ''}" href="#/?mode=following">Takip ettiklerin</a><a class="chip ${mode === 'all' ? 'on' : ''}" href="#/?mode=all">Herkes</a></div>`
      : `<div class="hero"><h3>Tüm fenomenler tek yerde ✨</h3><p>Sevdiğin fenomenleri takip et, YouTube'a video yüklediklerinde anında bildirim al ve onlara doğrudan mesaj gönder.</p><a class="btn" href="#/signup">Hemen katıl</a></div>`}
    <div id="feed">${'<div class="post"><div class="post-head"><div class="av skel"></div><div class="who"><div class="skel" style="height:12px;width:40%;border-radius:4px"></div></div></div><div class="media skel"></div></div>'.repeat(2)}</div>
    <div id="more"></div>`;
  const [inf, feed] = await Promise.all([api('/influencers'), api('/feed?limit=12&mode=' + mode)]);
  const day = Date.now() - 86400000 * 2;
  $('#stories').innerHTML = inf.influencers.map(i => `<a class="story" href="#/u/${esc(i.slug)}"><div class="ring ${i.latest_at > day ? '' : 'seen'}">${avatar(i.avatar, '')}</div><span>${esc(i.slug)}</span></a>`).join('');
  const feedEl = $('#feed');
  let list = feed.videos;
  feedEl.innerHTML = (feed.fallback ? `<div class="card" style="text-align:center"><b>Henüz kimseyi takip etmiyorsun</b><p class="muted">Herkesin son videolarını gösteriyorum. Keşfet'ten fenomen takip et, akışın kişiselleşsin.</p><a class="btn" href="#/explore">Fenomen keşfet</a></div>` : '')
    + (list.length ? list.map(postCard).join('') : '<div class="empty"><div class="big-ic">📭</div><h3>Henüz video yok</h3>Videolar birkaç dakika içinde yüklenecek.</div>');
  bindPosts(feedEl);
  const more = $('#more');
  const io = new IntersectionObserver(async ([e]) => {
    if (!e.isIntersecting || !list.length || more.dataset.busy) return;
    more.dataset.busy = 1;
    const d = await api(`/feed?limit=12&mode=${feed.mode}&before=${list[list.length - 1].published_at}`);
    if (!d.videos.length) { io.disconnect(); more.innerHTML = '<p class="muted" style="text-align:center;padding:20px">Hepsi bu kadar ✨</p>'; return; }
    list = d.videos;
    const tmp = document.createElement('div'); tmp.innerHTML = d.videos.map(postCard).join('');
    bindPosts(tmp); feedEl.append(...tmp.children); delete more.dataset.busy;
  });
  more.style.height = '40px'; io.observe(more);
}
async function pageExplore(params) {
  const q = params.get('q') || '';
  view.innerHTML = `<div class="search"><input id="q" type="search" placeholder="Fenomen ara (isim, kategori, @kanal)" value="${esc(q)}" autocomplete="off"></div><div id="res"></div>`;
  const run = async () => {
    const qq = $('#q').value.trim();
    const [d, f] = await Promise.all([api('/influencers?q=' + encodeURIComponent(qq)), qq ? null : api('/feed?mode=all&limit=30')]);
    $('#res').innerHTML = `<div class="section-title">${qq ? 'Sonuçlar' : 'Önerilen fenomenler'}</div><div class="inf-list">` + (d.influencers.map(i => `
      <div class="row"><a href="#/u/${esc(i.slug)}">${avatar(i.avatar)}</a>
        <a class="info" href="#/u/${esc(i.slug)}"><b>${esc(i.name)}</b>${i.verified ? VER : ''}<small>${esc(i.category || '')}${i.category ? ' · ' : ''}${fmt(i.followers)} takipçi</small></a>
        <button class="btn ${i.following ? 'secondary' : ''}" data-f="${i.id}">${i.following ? 'Takiptesin' : 'Takip et'}</button></div>`).join('')
      || `<div class="empty"><div class="big-ic">🔍</div><h3>Sonuç yok</h3>Aradığın fenomen burada değil mi? <a href="#/join" style="color:var(--blue)">Profilini oluştur</a></div>`) + '</div>'
      + (f ? `<div class="section-title">Son videolar</div><div class="grid">${f.videos.map(v => `<a href="#/v/${esc(v.id)}"><img src="${esc(v.thumb)}" loading="lazy" alt=""><span class="views">▶ ${fmt(v.views)}</span></a>`).join('')}</div>` : '');
    $('#res').querySelectorAll('[data-f]').forEach(b => b.onclick = async () => {
      const inf = d.influencers.find(x => x.id == b.dataset.f);
      const r = await toggleFollow(b, inf);
      if (r) { b.textContent = r.following ? 'Takiptesin' : 'Takip et'; b.classList.toggle('secondary', r.following); }
    });
  };
  let t; $('#q').oninput = () => { clearTimeout(t); t = setTimeout(run, 250); };
  await run();
}
async function pageProfile(slug) {
  const d = await api('/influencers/' + encodeURIComponent(slug));
  const i = d.influencer;
  const socials = [
    i.yt_channel_id && `<a class="soc yt" target="_blank" rel="noopener" href="https://www.youtube.com/${i.yt_handle ? esc(i.yt_handle) : 'channel/' + esc(i.yt_channel_id)}"><i></i>${esc(i.yt_handle || 'YouTube')}</a>`,
    i.instagram && `<a class="soc ig" target="_blank" rel="noopener" href="https://instagram.com/${esc(i.instagram)}"><i></i>@${esc(i.instagram)}</a>`,
    i.tiktok && `<a class="soc tt" target="_blank" rel="noopener" href="https://www.tiktok.com/@${esc(i.tiktok)}"><i></i>@${esc(i.tiktok)}</a>`,
  ].filter(Boolean).join('');
  view.innerHTML = `<div class="prof">
    <div class="prof-top"><div class="big">${avatar(i.avatar, '')}</div>
      <div class="stats"><div><b>${i.videos}</b><span>video</span></div><div><b id="fc">${fmt(i.followers)}</b><span>takipçi</span></div><div><b>${i.claimed ? '✓' : '—'}</b><span>${i.claimed ? 'aktif' : 'sahipsiz'}</span></div></div></div>
    <h2>${esc(i.name)}${i.verified ? VER : ''}</h2>
    <div class="cat">${esc(i.category || 'İçerik üreticisi')}</div>
    <div class="bio">${esc(i.bio)}</div>
    <div class="socials">${socials}</div>
    <div class="prof-btns">${d.influencer.is_owner ? `<a class="btn secondary" href="#/edit">Profili düzenle</a><a class="btn secondary" href="#/inbox">Gelen mesajlar</a>`
      : `<button class="btn ${i.following ? 'secondary' : ''}" id="fbtn">${i.following ? 'Takiptesin 🔔' : 'Takip et'}</button><a class="btn secondary" href="#/chat/${i.id}">Mesaj gönder</a>`}</div>
    ${!i.claimed && !(S.me && S.me.influencer_id) ? `<p class="muted" style="font-size:12px;margin:10px 0 0">Bu profil sana mı ait? <a href="#/claim/${i.id}" style="color:var(--blue);font-weight:600">Profili sahiplen</a></p>` : ''}
  </div>
  <div class="grid-tabs"><span>▦ VİDEOLAR</span></div>
  <div class="grid">${d.videos.map(v => `<a href="#/v/${esc(v.id)}"><img src="${esc(v.thumb)}" loading="lazy" alt=""><span class="views">▶ ${fmt(v.views)}</span></a>`).join('') || '<p class="muted" style="grid-column:1/-1;text-align:center;padding:30px">Henüz video yok</p>'}</div>`;
  const fb = $('#fbtn');
  if (fb) fb.onclick = async () => { const r = await toggleFollow(fb, i); if (r) { fb.textContent = r.following ? 'Takiptesin 🔔' : 'Takip et'; fb.classList.toggle('secondary', r.following); $('#fc').textContent = fmt(r.influencer.followers); } };
}
async function pageVideo(id) {
  const { video: v } = await api('/videos/' + encodeURIComponent(id));
  v.influencer_id = v.inf_id;
  view.innerHTML = postCard(v) + `<div class="card"><b>Açıklama</b><p class="muted" style="white-space:pre-line">${esc(v.description || '—')}</p>
    <a class="btn block" style="background:#ff0000" target="_blank" rel="noopener" href="https://www.youtube.com/watch?v=${esc(v.id)}">YouTube'da izle</a></div>`;
  bindPosts(view);
  view.querySelector('[data-play]').click();
}
async function pageNotifications() {
  if (!S.me) return needLogin('Bildirimleri görmek için giriş yap');
  const [d, ps] = await Promise.all([api('/notifications'), pushState()]);
  const banner = ps === 'on' ? `<div class="push-card"><span class="bell">✅</span><div><b>Anlık bildirimler açık</b><br><span class="muted">Bu cihaz yeni videolarda bildirim alacak.</span></div><button class="btn secondary" id="ptest">Test</button></div>`
    : ps === 'unsupported' ? `<div class="push-card"><span class="bell">📱</span><div><b>Anlık bildirim için uygulamayı yükle</b><br><span class="muted">iPhone'da Paylaş → "Ana Ekrana Ekle", sonra buradan bildirimleri aç.</span></div></div>`
      : ps === 'denied' ? `<div class="push-card"><span class="bell">🔕</span><div><b>Bildirim izni engellenmiş</b><br><span class="muted">Tarayıcı ayarlarından bu site için bildirimlere izin ver.</span></div></div>`
        : `<div class="push-card"><span class="bell">🔔</span><div><b>Yeni videoları kaçırma</b><br><span class="muted">Takip ettiğin fenomenler YouTube'a video yükleyince telefonuna bildirim gelsin.</span></div><button class="btn" id="pon">Aç</button></div>`;
  const icon = { video: '🎬', message: '💬', follow: '👤', system: '🔔' };
  view.innerHTML = `<div class="section-title">Bildirimler</div>${banner}` + (d.notifications.map(n => `
    <a class="notif ${n.is_read ? '' : 'unread'}" href="${esc((n.link || '/').replace(/^\//, ''))}">
      ${n.avatar ? avatar(n.avatar, 'av') : `<span class="av" style="display:flex;align-items:center;justify-content:center;font-size:18px">${icon[n.type] || '🔔'}</span>`}
      <div class="txt">${esc(n.text)} <small>${ago(n.created_at)}</small></div>
      ${n.thumb ? `<img class="thumb" src="${esc(n.thumb)}" alt="">` : ''}</a>`).join('')
    || '<div class="empty"><div class="big-ic">🔔</div><h3>Henüz bildirim yok</h3>Takip ettiğin fenomenler yeni video yüklediğinde burada göreceksin.</div>');
  $('#pon') && ($('#pon').onclick = async () => { if (await enablePush()) pageNotifications(); });
  $('#ptest') && ($('#ptest').onclick = async () => { const r = await api('/push/test', { method: 'POST' }); toast(`Test bildirimi ${r.devices} cihaza gönderildi`); });
  $('#notif-dot').hidden = true;
}
async function pageInbox() {
  if (!S.me) return needLogin('Mesajlar için giriş yap');
  const d = await api('/inbox');
  const row = (href, img, name, last, mine, t, unread) => `<a class="row" href="${href}">${img}<div class="info"><b>${esc(name)}</b><small style="${unread ? 'color:var(--fg);font-weight:600' : ''}">${mine ? 'Sen: ' : ''}${esc(last)} · ${ago(t)}</small></div>${unread ? '<span class="badge" style="position:static">' + unread + '</span>' : ''}</a>`;
  view.innerHTML = `<div class="section-title">${esc(S.me.name)}</div>`
    + (S.influencer ? `<div class="section-title" style="font-size:14px">Hayranlarından gelen mesajlar <span class="muted">${esc(S.influencer.name)} olarak</span></div><div class="inf-list">${d.asInfluencer.map(c => row(`#/chat/${S.influencer.id}/${c.user_id}`, `<span class="av" style="width:52px;height:52px;display:flex;align-items:center;justify-content:center;background:var(--grad);color:#fff;font-weight:700;font-size:20px">${esc(c.name[0].toUpperCase())}</span>`, c.name, c.last_body, c.last_sender === 'influencer', c.created_at, c.unread)).join('') || '<p class="muted" style="padding:0 14px">Henüz mesaj yok.</p>'}</div><div class="section-title" style="font-size:14px">Gönderdiğin mesajlar</div>` : '')
    + `<div class="inf-list">${d.asUser.map(c => row(`#/chat/${c.influencer_id}`, avatar(c.avatar), c.name, c.last_body, c.last_sender === 'user', c.created_at, c.unread)).join('')
      || '<div class="empty"><div class="big-ic">💬</div><h3>Mesajların</h3>Bir fenomenin profiline gidip "Mesaj gönder"e dokun.<br><br><a class="btn" href="#/explore">Fenomen bul</a></div>'}</div>`;
}
async function pageChat(infId, userId) {
  if (!S.me) return needLogin('Mesaj göndermek için giriş yap');
  const q = userId ? `?user=${userId}` : '';
  const load = () => api(`/chat/${infId}${q}`);
  const d = await load();
  const title = d.side === 'influencer' ? d.other.name : d.influencer.name;
  const img = d.side === 'influencer' ? `<span class="av" style="display:flex;align-items:center;justify-content:center;background:var(--grad);color:#fff;font-weight:700">${esc(d.other.name[0].toUpperCase())}</span>` : avatar(d.influencer.avatar);
  view.innerHTML = `<div class="chat"><div class="chat-head"><a href="#/inbox">${ICON.back}</a>${img}<div style="flex:1"><b>${esc(title)}</b>${d.side === 'user' && d.influencer.verified ? VER : ''}<br>
    <small class="muted">${d.side === 'influencer' ? 'Hayranın' : d.influencer.claimed ? 'Genellikle birkaç saat içinde yanıt verir' : 'Profil henüz sahiplenilmedi — mesajın, fenomen katıldığında iletilecek'}</small></div>
    ${d.side === 'user' ? `<a href="#/u/${esc(d.influencer.slug)}" class="btn secondary" style="padding:6px 10px">Profil</a>` : ''}</div>
    <div class="msgs" id="msgs"></div>
    <form class="composer" id="cf"><input id="mi" placeholder="Mesaj yaz..." autocomplete="off" maxlength="2000"><button type="submit">Gönder</button></form></div>`;
  const mine = d.side;
  const render = msgs => {
    let last = 0;
    $('#msgs').innerHTML = msgs.length ? msgs.map(m => { const gap = m.created_at - last > 3600e3; last = m.created_at; return (gap ? `<div class="bubble-time">${new Date(m.created_at).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>` : '') + `<div class="bubble ${m.sender === mine ? 'me' : 'them'}">${esc(m.body)}</div>`; }).join('')
      : `<div class="empty">${avatar(d.side === 'user' ? d.influencer.avatar : '', 'av')}<h3>${esc(title)}</h3>Sohbeti başlatmak için bir mesaj gönder 👋</div>`;
    const el = $('#msgs'); el.scrollTop = el.scrollHeight;
    const e = el.querySelector('.empty .av'); if (e) { e.style.cssText = 'width:80px;height:80px;margin:0 auto'; }
  };
  render(d.messages);
  $('#cf').onsubmit = async e => {
    e.preventDefault(); const body = $('#mi').value.trim(); if (!body) return;
    $('#mi').value = '';
    try { await api(`/chat/${infId}${q}`, { body: { body } }); render((await load()).messages); } catch (err) { toast(err.message); }
  };
  clearInterval(S.chatTimer);
  S.chatTimer = setInterval(async () => { if (!location.hash.startsWith('#/chat/')) return clearInterval(S.chatTimer); const n = await load(); if (n.messages.length !== $('#msgs').querySelectorAll('.bubble').length) render(n.messages); }, 4000);
}
function pageAuth(kind, params) {
  if (S.me) { location.hash = '#/'; return; }
  const signup = kind === 'signup';
  view.innerHTML = `<div class="auth"><span class="logo">Fenomenler</span><p class="lead">${signup ? 'Sevdiğin fenomenleri takip et, yeni videolardan anında haberdar ol.' : 'Tekrar hoş geldin 👋'}</p>
    <form id="af">${signup ? '<input name="name" placeholder="Adın" required maxlength="60">' : ''}
      <input name="email" type="email" placeholder="E-posta" required autocomplete="email">
      <input name="password" type="password" placeholder="Şifre" required minlength="6" autocomplete="${signup ? 'new-password' : 'current-password'}">
      ${signup ? `<label class="role"><input type="radio" name="role" value="user" checked> <span><b>Takipçiyim</b><br><small class="muted">Fenomenleri takip edip bildirim almak istiyorum</small></span></label>
      <label class="role"><input type="radio" name="role" value="influencer"> <span><b>Fenomenim</b><br><small class="muted">Profilimi oluşturup hayranlarımla iletişim kurmak istiyorum</small></span></label>` : ''}
      <button class="btn block" type="submit">${signup ? 'Kaydol' : 'Giriş yap'}</button><div class="err" id="err"></div></form>
    <div class="switch">${signup ? 'Hesabın var mı? <a href="#/login">Giriş yap</a>' : 'Hesabın yok mu? <a href="#/signup">Kaydol</a>'}</div></div>`;
  $('#af').onsubmit = async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    try {
      const d = await api('/auth/' + kind, { body: f });
      await refreshMe();
      toast(`Hoş geldin ${d.user.name}!`);
      const next = params.get('next');
      location.hash = signup && f.role === 'influencer' ? '#/join' : (next || '#/');
    } catch (err) { $('#err').textContent = err.message; }
  };
}
async function pageMe() {
  if (!S.me) return pageAuth('login', new URLSearchParams());
  if (S.influencer) return pageProfile(S.influencer.slug);
  const [d, ps] = await Promise.all([api('/influencers'), pushState()]);
  const following = d.influencers.filter(i => i.following);
  view.innerHTML = `<div class="prof"><div class="prof-top"><div class="big"><span class="me-avatar" style="width:100%;height:100%;font-size:34px;border:3px solid #fff">${esc(S.me.name[0].toUpperCase())}</span></div>
    <div class="stats"><div><b>${following.length}</b><span>takip</span></div><div><b>${ps === 'on' ? '🔔' : '🔕'}</b><span>bildirim</span></div></div></div>
    <h2>${esc(S.me.name)}</h2><div class="cat">${esc(S.me.email)}</div>
    <div class="prof-btns" style="margin-top:12px"><a class="btn secondary" href="#/notifications">Bildirim ayarları</a><button class="btn secondary" id="lo">Çıkış yap</button></div></div>
    <div class="section-title">Takip ettiklerin</div><div class="inf-list">${following.map(i => `<a class="row" href="#/u/${esc(i.slug)}">${avatar(i.avatar)}<div class="info"><b>${esc(i.name)}</b><small>${i.latest_at ? 'Son video ' + ago(i.latest_at) : ''}</small></div></a>`).join('') || '<p class="muted" style="padding:0 14px">Henüz kimseyi takip etmiyorsun.</p>'}</div>
    <div class="hero"><h3>Sen de bir fenomen misin?</h3><p>Profilini oluştur ya da mevcut profilini sahiplen; hayranlarının mesajlarını yanıtla.</p><a class="btn" href="#/join">Fenomen profili oluştur</a></div>`;
  $('#lo').onclick = async () => { await api('/auth/logout', { method: 'POST' }); await refreshMe(); location.hash = '#/'; };
}
function pageJoin() {
  if (!S.me) return needLogin('Fenomen profili için önce hesap oluştur');
  if (S.influencer) { location.hash = '#/u/' + S.influencer.slug; return; }
  view.innerHTML = `<div class="card"><h3 style="margin-top:0">Fenomen profili oluştur ✨</h3>
    <p class="muted">YouTube kanalını gir — isim, profil fotoğrafı ve videoların otomatik gelir. Takipçilerin yeni videolarında bildirim alır.</p>
    <form id="jf"><input name="youtube" placeholder="YouTube kanalı (@kullaniciadi veya kanal linki)">
    <input name="name" placeholder="Görünen ad (boş bırakırsan kanaldan alınır)" maxlength="60">
    <input name="category" placeholder="Kategori (ör. Oyun, Güzellik, Bilim)" maxlength="40">
    <textarea name="bio" rows="3" placeholder="Biyografi" maxlength="500"></textarea>
    <input name="instagram" placeholder="Instagram kullanıcı adı"><input name="tiktok" placeholder="TikTok kullanıcı adı">
    <button class="btn block" type="submit">Profili oluştur</button><div class="err" id="err"></div></form></div>
    <div class="card"><b>Profilin zaten listede mi?</b><p class="muted">Keşfet'te profilini bul ve "Profili sahiplen"e dokun. YouTube kanal açıklamana kısa bir kod ekleyerek sahipliğini doğrularsın.</p><a class="btn secondary block" href="#/explore">Profilimi bul</a></div>`;
  $('#jf').onsubmit = async e => {
    e.preventDefault(); const btn = e.target.querySelector('button'); btn.disabled = true; btn.textContent = 'Kanal kontrol ediliyor...';
    try {
      const d = await api('/influencers', { body: Object.fromEntries(new FormData(e.target)) });
      await refreshMe(); toast('Profilin hazır 🎉'); location.hash = '#/u/' + d.influencer.slug;
    } catch (err) {
      $('#err').innerHTML = esc(err.message) + (err.data && err.data.id ? ` — <a href="#/claim/${err.data.id}" style="color:var(--blue)">sahiplen</a>` : '');
      btn.disabled = false; btn.textContent = 'Profili oluştur';
    }
  };
}
async function pageClaim(id) {
  if (!S.me) return needLogin('Sahiplenmek için giriş yap');
  let d;
  try { d = await api(`/influencers/${id}/claim`, { method: 'POST' }); } catch (e) { view.innerHTML = `<div class="empty"><h3>${esc(e.message)}</h3></div>`; return; }
  view.innerHTML = `<div class="card"><h3 style="margin-top:0">Profilini doğrula ✅</h3><p>${esc(d.instructions)}</p><div class="code">${esc(d.code)}</div>
    <button class="btn block" id="vb">Doğrula</button><div class="err" id="err"></div></div>`;
  $('#vb').onclick = async () => {
    try { const r = await api(`/influencers/${id}/verify`, { body: { token: d.token } }); await refreshMe(); toast('Profil artık senin 🎉'); location.hash = '#/u/' + r.slug; }
    catch (e) { $('#err').textContent = e.message; }
  };
}
function pageEdit() {
  const i = S.influencer; if (!i) { location.hash = '#/me'; return; }
  view.innerHTML = `<div class="card"><h3 style="margin-top:0">Profili düzenle</h3><form id="ef">
    <input name="name" value="${esc(i.name)}" placeholder="Ad"><input name="avatar" value="${esc(i.avatar)}" placeholder="Profil fotoğrafı URL">
    <input name="category" value="${esc(i.category)}" placeholder="Kategori"><textarea name="bio" rows="4" placeholder="Biyografi">${esc(i.bio)}</textarea>
    <input name="instagram" value="${esc(i.instagram || '')}" placeholder="Instagram"><input name="tiktok" value="${esc(i.tiktok || '')}" placeholder="TikTok">
    <button class="btn block">Kaydet</button></form><button class="btn secondary block" style="margin-top:8px" id="lo">Çıkış yap</button></div>`;
  $('#ef').onsubmit = async e => { e.preventDefault(); await api('/influencers/' + i.id, { method: 'PUT', body: Object.fromEntries(new FormData(e.target)) }); await refreshMe(); toast('Kaydedildi'); location.hash = '#/u/' + i.slug; };
  $('#lo').onclick = async () => { await api('/auth/logout', { method: 'POST' }); await refreshMe(); location.hash = '#/'; };
}

async function router() {
  const [pathPart, qs] = (location.hash.slice(1) || '/').split('?');
  const params = new URLSearchParams(qs || '');
  const seg = pathPart.split('/').filter(Boolean);
  const tab = { '': 'home', explore: 'explore', join: 'join', notifications: 'notifications', me: 'me' }[seg[0] || ''];
  document.querySelectorAll('#tabbar a').forEach(a => a.classList.toggle('active', a.dataset.tab === tab));
  window.scrollTo(0, 0);
  try {
    switch (seg[0]) {
      case undefined: await pageHome(params); break;
      case 'explore': await pageExplore(params); break;
      case 'u': await pageProfile(seg[1]); break;
      case 'v': await pageVideo(seg[1]); break;
      case 'notifications': await pageNotifications(); break;
      case 'inbox': await pageInbox(); break;
      case 'chat': await pageChat(seg[1], seg[2]); break;
      case 'login': case 'signup': pageAuth(seg[0], params); break;
      case 'me': await pageMe(); break;
      case 'join': pageJoin(); break;
      case 'claim': await pageClaim(seg[1]); break;
      case 'edit': pageEdit(); break;
      default: view.innerHTML = '<div class="empty"><h3>Sayfa bulunamadı</h3></div>';
    }
  } catch (e) { view.innerHTML = `<div class="empty"><div class="big-ic">⚠️</div><h3>${esc(e.message)}</h3><a class="btn" href="#/">Ana sayfa</a></div>`; }
}
window.addEventListener('hashchange', router);
(async () => {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => { });
  await refreshMe();
  router();
  setInterval(refreshMe, 60000);
})();
