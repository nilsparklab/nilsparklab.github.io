export const API_GATEWAY_CONFIG = Object.freeze({
  maxBodyBytes: 16 * 1024,
  timeoutMs: 15000,
  allowedOperations: ["health", "provider-status", "wiki-search", "research-search", "literature-search", "book-search", "ai-chat"],
  providerMode: "wikimedia-crossref-europepmc-openlibrary-enabled"
});
