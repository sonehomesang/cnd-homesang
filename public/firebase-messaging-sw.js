/* Firebase Cloud Messaging service worker (web push, background). */
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyDMizPAqFff5eVjCGFLEFZ0p7mPWUq5oSQ',
  authDomain: 'homesang-v2-prod.firebaseapp.com',
  projectId: 'homesang-v2-prod',
  storageBucket: 'homesang-v2-prod.firebasestorage.app',
  messagingSenderId: '1003163681364',
  appId: '1:1003163681364:web:4c5da8132726664a2563c1',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const n = payload.notification || {};
  const data = payload.data || {};
  self.registration.showNotification(n.title || 'HomeSang', {
    body: n.body || '',
    icon: '/favicon.png',
    data: { link: (data.link || (payload.fcmOptions && payload.fcmOptions.link)) || '/' },
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ('focus' in w) { w.navigate(link); return w.focus(); }
      }
      if (clients.openWindow) return clients.openWindow(link);
    }),
  );
});
