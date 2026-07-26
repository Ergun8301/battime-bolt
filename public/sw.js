// Service worker BEMEXO — uniquement les notifications push.
// Volontairement SANS mise en cache / stratégie offline : l'app gère déjà son
// propre hors-ligne (localStorage `battime_offline_`), et un cache de service
// worker mal réglé casserait ce mécanisme ou servirait du HTML périmé après un
// déploiement Netlify. Ce fichier ne fait donc QUE recevoir et afficher les push.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  const title = data.title || 'BEMEXO';
  const options = {
    body: data.body || '',
    icon: '/icon-192.svg',
    badge: '/icon-192.svg',
    tag: data.tag || 'bemexo',
    data: { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Au clic : on refocalise un onglet BEMEXO déjà ouvert plutôt que d'en empiler
// un nouveau (sinon le salarié se retrouve avec 5 onglets au bout d'une semaine).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.includes(new URL(target, self.location.origin).pathname) && 'focus' in c) return c.focus();
      }
      if (list.length && 'navigate' in list[0]) return list[0].navigate(target).then((c) => c && c.focus());
      return self.clients.openWindow(target);
    }),
  );
});
