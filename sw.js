// sw.js — 서비스워커. 앱 셸을 캐시해 오프라인 플레이를 지원한다.
// 멀티플레이용 Firebase SDK는 CDN(교차 출처)에서 받으므로 캐시하지 않으며 온라인에서만 동작한다.

const CACHE = 'favorite-frenzy-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './favicon.svg',
  './icons/icon.svg',
  './icons/icon-maskable.svg',
  './icons/apple-touch-icon.svg',
  './js/main.js',
  './js/rng.js',
  './js/cards.js',
  './js/art.js',
  './js/engine.js',
  './js/ai.js',
  './js/ui.js',
  './js/controller.js',
  './js/replay.js',
  './js/storage.js',
  './js/firebase.js',
  './js/firebase-config.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // 교차 출처(예: Firebase CDN, Firestore)는 네트워크로 직접 처리
  if (url.origin !== location.origin) return;
  if (e.request.method !== 'GET') return;

  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
          return res;
        })
        .catch(() => {
          // 네비게이션 실패 시 앱 셸 반환
          if (e.request.mode === 'navigate') return caches.match('./index.html');
        });
    })
  );
});
