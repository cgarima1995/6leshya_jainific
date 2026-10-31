/**
 * 6 Leshya VR - Offline Service Worker
 * Provides resilient offline caching and HTTP 206 Partial Content synthesis for video playback.
 */

const CACHE_NAME = 'leshya-vr-cache-v6';

const CORE_ASSETS = [
  './',
  './index.html',
  './images.html',
  './aframe.min.js',
  './webxr-polyfill.min.js',
  './offline-engine.js',
  './dot-logo.png',
  './jainific-logo.png',
  './manifest.json',
  './audioIntro1.mp4',
  './audioIntro2.mp4',
  './soothingMusic.mp4'
];

// Install: Cache all core application shell files immediately
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching core application shell...');
      return cache.addAll(CORE_ASSETS).catch((err) => {
        console.warn('[SW] Core caching partial warning:', err);
      });
    })
  );
});

// Activate: Clean up older cache versions and claim all clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Removing legacy cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Intercept all asset requests
self.addEventListener('fetch', (event) => {
  const request = event.request;
  
  // Only handle GET requests
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Synthesize Range requests (essential for HTML5 video playback in iOS Safari and Android Chrome offline)
  if (request.headers.has('range')) {
    event.respondWith(handleRangeRequest(request));
    return;
  }

  // Network-first strategy for HTML navigation requests to guarantee latest script updates
  const isHtml = request.mode === 'navigate' ||
                 url.pathname.endsWith('.html') ||
                 url.pathname === '/' ||
                 url.pathname.endsWith('/');

  if (isHtml) {
    event.respondWith(
      fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return networkResponse;
      }).catch(() => {
        return caches.match(request).then((cached) => {
          if (cached) return cached;
          return caches.match('./images.html').then((imgCached) => imgCached || caches.match('./index.html'));
        });
      })
    );
    return;
  }

  // Standard cache-first strategy for static resources
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, clone);
          });
        }
        return networkResponse;
      });
    })
  );
});

/**
 * Synthesizes HTTP 206 Partial Content responses from cached video responses
 * allowing video seeking and playback without an active server connection.
 */
async function handleRangeRequest(request) {
  const cache = await caches.open(CACHE_NAME);
  let response = await cache.match(request);

  if (!response) {
    try {
      return await fetch(request);
    } catch (e) {
      // If network is down, try matching URL without query string
      const url = new URL(request.url);
      response = await cache.match(url.pathname);
    }
  }

  if (!response) {
    return new Response('Asset not found in offline cache', { status: 404 });
  }

  const rangeHeader = request.headers.get('range');
  if (!rangeHeader || !rangeHeader.startsWith('bytes=')) {
    return response;
  }

  const arrayBuffer = await response.arrayBuffer();
  const totalLength = arrayBuffer.byteLength;
  const parts = rangeHeader.replace(/bytes=/, '').split('-');
  let start = 0;
  let end = totalLength - 1;
  if (!parts[0] && parts[1]) {
    start = Math.max(0, totalLength - parseInt(parts[1], 10));
    end = totalLength - 1;
  } else {
    start = parseInt(parts[0], 10) || 0;
    end = parts[1] ? parseInt(parts[1], 10) : totalLength - 1;
  }

  if (start >= totalLength || end >= totalLength) {
    return new Response('', {
      status: 416,
      headers: {
        'Content-Range': `bytes */${totalLength}`
      }
    });
  }

  const slicedBuffer = arrayBuffer.slice(start, end + 1);
  const contentType = response.headers.get('Content-Type') || (request.url.endsWith('.mp4') ? 'video/mp4' : 'application/octet-stream');

  return new Response(slicedBuffer, {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'Content-Type': contentType,
      'Content-Range': `bytes ${start}-${end}/${totalLength}`,
      'Content-Length': slicedBuffer.byteLength,
      'Accept-Ranges': 'bytes'
    }
  });
}
