const CACHE = 'fenomen-v1';
const ASSETS = ['/', '/style.css', '/app.js', '/manifest.webmanifest', '/icons/icon-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(ca => ca.put(e.request, c)); return r; }).catch(() => caches.match(e.request).then(r => r || caches.match('/'))));
});
self.addEventListener('push', e => {
  let d = {}; try { d = e.data.json(); } catch { d = { title: 'Fenomenler', body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Fenomenler', {
    body: d.body, icon: d.icon || '/icons/icon-192.png', badge: '/icons/badge.png', image: d.image, tag: d.tag, data: { url: d.url || '/' }, vibrate: [100, 50, 100],
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data && e.notification.data.url || '/';
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => {
    for (const w of ws) { if ('focus' in w) { w.navigate(url); return w.focus(); } }
    return clients.openWindow(url);
  }));
});
