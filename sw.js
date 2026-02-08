// Rally Photo — Service Worker (offline cache)
// Update this date string whenever you deploy changes: YYYY-MM-DD-N
const CACHE_VERSION = "2026-02-08-3";
const CACHE_NAME = "rally-photo-" + CACHE_VERSION;
const ASSETS = [
  "./index.html",
  "./css/style.css",
  "./js/rallies.js",
  "./rallies/normandie.js",
  "./rallies/lyon.js",
  "./js/app.js",
  "./js/game.js",
  "./js/photostore.js",
  "./js/map.js",
  "./js/photos.js",
  "./js/compress-worker.js",
  "./manifest.json",
];

// Offline fallback page (embedded to avoid extra file)
const OFFLINE_PAGE = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>R(ali) Photo — Hors ligne</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:"Open Sans",Arial,sans-serif;background:#1e3a5f;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;padding:1.5rem}
.card{background:#fff;color:#1a1a1a;border-radius:14px;padding:2rem 1.5rem;max-width:380px;box-shadow:0 4px 20px rgba(0,0,0,0.3)}
h1{font-family:Georgia,serif;color:#1e3a5f;font-size:1.5rem;margin-bottom:0.5rem}
p{font-size:0.9rem;color:#555;line-height:1.5;margin-bottom:1rem}
button{background:#d97706;color:#fff;border:none;border-radius:10px;padding:0.7rem 1.5rem;font-size:1rem;font-weight:700;cursor:pointer}
button:hover{background:#b45309}
</style>
</head>
<body>
<div class="card">
<h1>R(ali) Photo</h1>
<p>Vous etes hors ligne et cette page n'est pas encore en cache. Reconnectez-vous pour charger l'application, puis elle fonctionnera hors ligne.</p>
<button onclick="location.reload()">Reessayer</button>
</div>
</body>
</html>`;

// Install: cache core assets
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean old caches & notify clients
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => {
      // Notify all clients that a new version is active
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: "SW_UPDATED" });
        });
      });
    })
  );
  self.clients.claim();
});

// Fetch: cache-first for app assets, network-first for external (map tiles, fonts)
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // For app assets: network first with cache fallback (stale-while-revalidate)
  if (url.origin === location.origin) {
    e.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(e.request).then((cached) => {
          const fetchPromise = fetch(e.request).then((response) => {
            if (response.ok) {
              cache.put(e.request, response.clone());
            }
            return response;
          }).catch(() => cached);
          return cached || fetchPromise;
        })
      ).then((response) => {
        // If no response at all (not in cache and network failed), show offline page for navigation requests
        if (!response && e.request.mode === "navigate") {
          return new Response(OFFLINE_PAGE, { headers: { "Content-Type": "text/html; charset=utf-8" } });
        }
        return response;
      })
    );
    return;
  }

  // For external resources (map tiles, fonts): network first, cache fallback
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
