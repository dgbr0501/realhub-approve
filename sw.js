// RealHub Approve — shows the notification, and opens the app on tap.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { title: 'RealHub', body: e.data ? e.data.text() : '' }; }
  e.waitUntil((async () => {
    await self.registration.showNotification(d.title || 'RealHub', {
      body: d.body || '', tag: d.id || d.type || 'realhub', data: d, icon: './icon-192.png', badge: './icon-192.png', requireInteraction: d.type === 'approve',
    });
    for (const c of await self.clients.matchAll({ type: 'window' })) c.postMessage({ type: 'refresh' });
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const id = e.notification.data?.id;
  const url = new URL(id ? `./?r=${encodeURIComponent(id)}` : './', self.registration.scope).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) { if ('focus' in w) { await w.navigate?.(url).catch(() => {}); return w.focus(); } }
    return self.clients.openWindow(url);
  })());
});
