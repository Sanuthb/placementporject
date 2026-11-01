// Minimal service worker: makes the app installable. It deliberately caches nothing, because every
// API response holds personal data and must always come fresh from the server.
self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()))
self.addEventListener("fetch", () => {})
