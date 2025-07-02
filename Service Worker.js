const CACHE_NAME = 'budget-app-v1.0';
const urlsToCache = [
  '/budget-app/',
  '/budget-app/index.html',
  '/budget-app/master.html',
  '/budget-app/settings.html',
  '/budget-app/manifest.json',
  'https://accounts.google.com/gsi/client',
  'https://apis.google.com/js/api.js'
];

// インストール時にキャッシュを作成
self.addEventListener('install', event => {
  console.log('Service Worker: Install');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: キャッシュを作成中');
        return cache.addAll(urlsToCache);
      })
      .catch(err => {
        console.error('Service Worker: キャッシュ作成エラー', err);
      })
  );
});

// アクティベート時に古いキャッシュを削除
self.addEventListener('activate', event => {
  console.log('Service Worker: Activate');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: 古いキャッシュを削除', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// リクエスト時にキャッシュを確認
self.addEventListener('fetch', event => {
  // Google APIリクエストはキャッシュしない
  if (event.request.url.includes('googleapis.com') || 
      event.request.url.includes('accounts.google.com')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // キャッシュにあればそれを返す
        if (response) {
          console.log('Service Worker: キャッシュからレスポンス', event.request.url);
          return response;
        }

        // なければネットワークから取得
        return fetch(event.request)
          .then(response => {
            // 有効なレスポンスかチェック
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // レスポンスをクローンしてキャッシュに保存
            const responseToCache = response.clone();
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });

            return response;
          })
          .catch(err => {
            console.error('Service Worker: ネットワークエラー', err);
            
            // オフライン時の基本レスポンス
            if (event.request.destination === 'document') {
              return caches.match('/budget-app/index.html');
            }
          });
      })
  );
});

// プッシュ通知対応（将来の機能）
self.addEventListener('push', event => {
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body || '家計簿の更新があります',
      icon: '/budget-app/icon-192.png',
      badge: '/budget-app/icon-192.png',
      vibrate: [100, 50, 100],
      data: {
        dateOfArrival: Date.now(),
        primaryKey: data.primaryKey || 1
      },
      actions: [
        {
          action: 'explore',
          title: '確認する',
          icon: '/budget-app/icon-192.png'
        },
        {
          action: 'close', 
          title: '閉じる'
        }
      ]
    };

    event.waitUntil(
      self.registration.showNotification(data.title || '家計簿アプリ', options)
    );
  }
});

// 通知クリック処理
self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (event.action === 'explore') {
    event.waitUntil(
      clients.openWindow('/budget-app/')
    );
  }
});