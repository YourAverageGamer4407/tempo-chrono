/* CHRONO v4 — service worker.
   Strategy: NETWORK-FIRST with a cache fallback.
   - A redeploy of the URL is picked up on the next load (the new shell is
     fetched first, the cache is only used when the network is unavailable), so
     section F's "the app syncs over the URL" is literally true.
   - Offline (airplane mode) still opens the calendar, because every shell file
     is cached.
   - The cache version string is bumped on every release so a stale shell can
     never survive a deploy.
*/
const CACHE_VERSION = 'chrono-v4-2026-11-13-1';
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png'
];

self.addEventListener('install', function(event){
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function(cache){
      // addAll fails the whole install if one file 404s; add each individually
      // and tolerate a missing optional asset instead.
      return Promise.all(SHELL.map(function(url){
        return cache.add(new Request(url, { cache: 'reload' })).catch(function(){ return null; });
      }));
    }).then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(event){
  event.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.map(function(k){
        return k === CACHE_VERSION ? null : caches.delete(k);
      }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(event){
  const req = event.request;
  if (req.method !== 'GET') return;                       // never cache a write
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;        // the shell only

  event.respondWith(
    fetch(req).then(function(res){
      // Fresh from the network: refresh the cached copy for offline use.
      if (res && res.status === 200 && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then(function(cache){ cache.put(req, copy); }).catch(function(){});
      }
      return res;
    }).catch(function(){
      // Offline: serve the cached shell; for a navigation fall back to index.html.
      return caches.match(req).then(function(hit){
        if (hit) return hit;
        if (req.mode === 'navigate') return caches.match('./index.html');
        return new Response('', { status: 504, statusText: 'offline' });
      });
    })
  );
});

self.addEventListener('message', function(event){
  if (event.data === 'skipWaiting') self.skipWaiting();
});
