/* Firebase Cloud Messaging service worker (web push, background). */
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyCsyMkNQaiCRHQgPPba8JpkVYscPtTjoQQ',
  authDomain: 'cnd-homesang.firebaseapp.com',
  projectId: 'cnd-homesang',
  storageBucket: 'cnd-homesang.firebasestorage.app',
  messagingSenderId: '504639839337',
  appId: '1:504639839337:web:10f54518ccbe695c5f16f8',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const n = payload.notification || {};
  const data = payload.data || {};
  self.registration.showNotification(n.title || 'CND-HomeSang', {
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
