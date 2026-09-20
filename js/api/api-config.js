/* NIL SparkLab API configuration — public values only. NEVER put secrets here. */
(function () {
  'use strict';
  const rawBase = window.NIL_SPARKLAB_API_BASE || '';
  const allowedPaths = Object.freeze([
    '/api/gateway',
    '/api/v1/health',
    '/api/v1/status',
  ]);
  function normalizeBase(value) {
    if (!value) return '';
    const url = new URL(value, window.location.origin);
    if (url.protocol !== 'https:' && url.origin !== window.location.origin) throw new Error('NIL API base must use HTTPS.');
    return url.origin + url.pathname.replace(/\/$/, '');
  }
  window.NIL_API_CONFIG = Object.freeze({
    baseUrl: normalizeBase(rawBase),
    timeoutMs: 8000,
    // Was 8KB — too small once sync-push started sending up to ~32KB of
    // progress data (every such request was being rejected client-side
    // before it even reached the network). Raised to give sync headroom
    // plus room for the AI chat's circuit-context payload.
    maxRequestBytes: 40 * 1024,
    maxResponseBytes: 512 * 1024,
    allowedPaths,
    aiEnabled: true
  });
})();
