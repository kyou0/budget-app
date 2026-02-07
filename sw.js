const CACHE_NAME = 'budget-app-v21';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './favicon.ico',
  './src/schema.js',
  './src/store.js',
  './src/router.js',
  './src/generate.js',
  './src/calc.js',
  './src/utils.js',
  './src/auth/googleAuth.js',
  './src/sync/driveSync.js',
  './src/sync/calendarSync.js',
  './src/ui/dashboard.js',
  './src/ui/analysis.js',
  './src/ui/master.js',
  './src/ui/settings.js',
  './src/ui/tutorial.js',
  './img/favicon.png',
  './img/favicon.ico',
  './sample-data.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
