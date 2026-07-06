/* eslint-disable no-restricted-globals */
// Service Worker for offline functionality
const CACHE_NAME = 'vstudy-cache-v2';
const RUNTIME_CACHE = 'vstudy-runtime-v2';
const API_CACHE = 'vstudy-api-v2';

// Assets to cache on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/logo192.png',
  '/logo512.png',
  '/favicon.ico'
];

// API endpoints that should be cached
const CACHEABLE_API_PATTERNS = [
  /\/api\/notes/,
  /\/api\/groups/,
  /\/api\/messages/,
  /\/api\/files/,
  /\/api\/users\/profile/
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Caching static assets');
        return cache.addAll(STATIC_ASSETS.map(url => new Request(url, { cache: 'reload' })))
          .catch(err => {
            console.warn('[Service Worker] Failed to cache some assets:', err);
            // Continue even if some assets fail to cache
          });
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME && name !== RUNTIME_CACHE && name !== API_CACHE)
            .map((name) => {
              console.log('[Service Worker] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch event - implement caching strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip chrome extensions and other protocols
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // Locale/translation files — always network-first, never serve stale
  if (url.pathname.startsWith('/locales/')) {
    event.respondWith(networkFirstStrategy(request));
    return;
  }

  // API requests - Network First with Cache Fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstStrategy(request));
    return;
  }

  // Static assets - Cache First with Network Fallback
  event.respondWith(cacheFirstStrategy(request));
});

// Cache First Strategy - for static assets
async function cacheFirstStrategy(request) {
  try {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.error('[Service Worker] Cache first strategy failed:', error);
    // Return offline page or cached response
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    // Return a basic offline response
    return new Response('Offline - Content not available', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: new Headers({
        'Content-Type': 'text/plain'
      })
    });
  }
}

// Network First Strategy - for API requests
async function networkFirstStrategy(request) {
  try {
    const networkResponse = await fetch(request);
    
    // Cache successful GET responses
    if (networkResponse && networkResponse.status === 200) {
      const url = new URL(request.url);
      const shouldCache = CACHEABLE_API_PATTERNS.some(pattern => pattern.test(url.pathname));
      
      if (shouldCache) {
        const cache = await caches.open(API_CACHE);
        cache.put(request, networkResponse.clone());
      }
    }
    
    return networkResponse;
  } catch (error) {
    console.log('[Service Worker] Network request failed, trying cache:', request.url);
    
    // Try to return cached response
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      // Add custom header to indicate this is from cache
      const headers = new Headers(cachedResponse.headers);
      headers.append('X-From-Cache', 'true');
      
      return new Response(cachedResponse.body, {
        status: cachedResponse.status,
        statusText: cachedResponse.statusText,
        headers: headers
      });
    }
    
    // Return error response
    return new Response(JSON.stringify({
      error: 'Offline',
      message: 'No network connection and no cached data available'
    }), {
      status: 503,
      statusText: 'Service Unavailable',
      headers: new Headers({
        'Content-Type': 'application/json'
      })
    });
  }
}

// Background sync event - sync offline actions when connection is restored
self.addEventListener('sync', (event) => {
  console.log('[Service Worker] Background sync triggered:', event.tag);
  
  if (event.tag === 'sync-offline-actions') {
    event.waitUntil(syncOfflineActions());
  }
});

// Sync offline actions with the server
async function syncOfflineActions() {
  try {
    // Notify all clients that sync is starting
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'SYNC_STARTED'
      });
    });

    // The actual sync logic will be handled by the client-side code
    // This just notifies the clients to start syncing
    
    console.log('[Service Worker] Sync completed successfully');
    
    // Notify clients that sync is complete
    clients.forEach(client => {
      client.postMessage({
        type: 'SYNC_COMPLETED'
      });
    });
  } catch (error) {
    console.error('[Service Worker] Sync failed:', error);
    
    // Notify clients that sync failed
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'SYNC_FAILED',
        error: error.message
      });
    });
    
    throw error;
  }
}

// Message event - handle messages from clients
self.addEventListener('message', (event) => {
  console.log('[Service Worker] Message received:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => caches.delete(cacheName))
        );
      })
    );
  }
});
