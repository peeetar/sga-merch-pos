// Keeps the till (/pos) loading with no signal. The till page and its assets
// are served from cache and refreshed in the background; /api/* always goes to
// the network, because the tablet's IndexedDB outbox, not this cache, is what
// holds sales. The rest of the hub is left alone: it needs the server anyway,
// and a cached copy would only show stale numbers.
const CACHE = "sga-hub-pos-v1";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/pos"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const isTill = (path) => path === "/pos" || path.startsWith("/pos/");
const isAsset = (path) => path.startsWith("/_next/static/") || path.startsWith("/fonts/") || path === "/icon.svg" || path === "/manifest.webmanifest";

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  const navigate = e.request.mode === "navigate";
  if (navigate ? !isTill(url.pathname) : !isAsset(url.pathname)) return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const key = navigate ? "/pos" : e.request;
      const hit = await cache.match(key);
      const fresh = fetch(e.request)
        .then((res) => {
          // A signed-out till page redirects; never cache that as the till.
          if (res.ok && !res.redirected) cache.put(key, res.clone());
          return res;
        })
        .catch(() => hit);
      return hit || fresh;
    }),
  );
});
