// GymApp service worker: keeps a copy of the app so it opens offline.
// It tries the network first, so while you are editing the code you always see your latest changes.
// Bump the version number if you ever need to force a clean cache.
const CACHE = "gymapp-v2.29.2";
const FILES = ["./", "index.html", "style.css", "app.js", "manifest.json",
               "icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png",
               "favicon.svg", "favicon-32.png", "logo-mark.svg", "logo-full.svg"];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(FILES); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k !== CACHE; })
                               .map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET" || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(
    // "no-cache" = always check with the server first, so new versions show up straight away
    fetch(e.request, { cache: "no-cache" })
      .then(function (res) {
        const copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        return res;
      })
      .catch(function () {
        return caches.match(e.request).then(function (r) { return r || caches.match("index.html"); });
      })
  );
});
