// NIL SparkLab — Service Worker
// v11.1
//
// Purpose: make the app shell (this file, index.html, icons, manifest, and
// same-origin /js/ modules) available offline after the first successful
// visit. This file did not previously exist, which meant
// navigator.serviceWorker.register('sw.js') in index.html always failed
// (404) — the app was never actually installable/offline-capable despite
// manifest.json being correctly configured.
//
// Design goals:
// - Never cache anything sensitive, dynamic, or cross-origin.
// - Never break the app if a cached asset is stale or a fetch fails.
// - Keep this file dependency-free and easy to audit.

"use strict";

const CACHE_VERSION = "nil-sparklab-v11.2";
const STATIC_CACHE = `${CACHE_VERSION}-static`;

// Only same-origin, static, non-sensitive assets. Third-party scripts
// (e.g. unpkg.com) are intentionally NOT precached or intercepted here —
// they're left to the network/browser HTTP cache.
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./favicon.ico",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon-180.png",
  "./icons/favicon-32x32.png",
  "./icons/favicon-16x16.png",
  "./js/core/dialog.js",
  "./js/config/app-config.js",
  "./js/ucdm/ucdm.js",
  "./js/simulation/ucdm-simulation-adapter.js",
  "./js/simulation/simulation-runtime-guard.js",
  "./js/compat/runtime-integrity.js",
  "./js/compat/v1pro5-diagnostics.js",
  "./js/compat/bottom-blank-lock.js",
  "./js/compat/bottom-render-guard.js",
  "./js/compat/exact-builder-handoff.js",
  "./js/compat/builder-handoff-verify.js",
  "./js/api/api-config.js",
  "./js/api/api-response.js",
  "./js/api/api-client.js",
  // v11.2 — Smart Assistant modules were being loaded by index.html but were
  // missing from this precache list, so a fresh install could lose Assistant
  // functionality (Fault Finder, Practical/Viva, Agentic Task Mode,
  // citations, tool routing) the first time it was used offline.
  "./js/assistant/assistant-context.js",
  "./js/assistant/assistant-fault-copilot.js",
  "./js/assistant/assistant-practical-viva.js",
  "./js/assistant/assistant-agentic.js",
  "./js/assistant/assistant-tool-router.js",
  "./js/assistant/assistant-citations.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch(() => {
        // A single missing/renamed asset shouldn't block installation of
        // the service worker itself.
      })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("nil-sparklab-") && key !== STATIC_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Only handle simple same-origin GET requests. Everything else
  // (POST, cross-origin, chrome-extension:, etc.) is left to the network
  // untouched — no interception, no caching.
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch (_) {
    return;
  }
  if (url.origin !== self.location.origin) return;

  // HTML: network-first, so users always get the latest app shell when
  // online, with the cached copy only as an offline fallback.
  const isHTML =
    request.mode === "navigate" ||
    (request.headers.get("accept") || "").includes("text/html");

  if (isHTML) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("./index.html")))
    );
    return;
  }

  // Static assets: cache-first, falling back to network, then updating the
  // cache in the background so future offline visits stay reasonably fresh.
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
