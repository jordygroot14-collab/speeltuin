// Kill-switch service worker.
// Doel: eventuele oude gecachete versies van de app opruimen en daarna
// zelf niets meer cachen, zodat je altijd de laatste versie krijgt.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// Geen fetch-handler: alle verzoeken gaan gewoon rechtstreeks naar het netwerk,
// dus geen kans meer dat een oude versie uit de cache wordt geserveerd.
