const CACHE_NAME = 'budget-app-v2';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './src/schema.js',
  './src/store.js',
  './src/router.js',
  './src/generate.js',
  './src/calc.js',
  './src/auth/googleAuth.js',
  './src/sync/driveSync.js',
  './src/sync/calendarSync.js',
  './src/ui/dashboard.js',
  './src/ui/analysis.js',
  './src/ui/master.js',
  './src/ui/settings.js',
  './img/favicon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
