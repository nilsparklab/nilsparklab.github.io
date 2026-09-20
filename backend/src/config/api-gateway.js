export const API_GATEWAY_CONFIG = Object.freeze({
  maxBodyBytes: 40 * 1024, // matches js/api/api-config.js maxRequestBytes and worker/src/index.js MAX_BODY_BYTES
  timeoutMs: 15000,
  allowedOperations: ["health", "provider-status", "wiki-search", "research-search", "literature-search", "book-search", "ai-chat", "sync-push", "sync-pull", "class-push", "class-pull", "gallery-publish", "gallery-list"],
  providerMode: "wikimedia-crossref-europepmc-openlibrary-enabled"
});
