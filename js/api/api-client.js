/* NIL SparkLab API Client — single public gateway entry point. */
(function () {
  'use strict';

  const cfg = window.NIL_API_CONFIG;
  if (!cfg) throw new Error('NIL_API_CONFIG must load before api-client.js');

  function assertPath(path) {
    if (!cfg.allowedPaths.includes(path)) {
      throw new NILApiError('PATH_BLOCKED', 'Blocked API path.', { retryable: false });
    }
  }

  function byteLength(value) {
    return new TextEncoder().encode(value).byteLength;
  }

  class NILApiError extends Error {
    constructor(code, message, options) {
      super(message);
      this.name = 'NILApiError';
      this.code = code;
      this.status = (options && options.status) || 0;
      this.requestId = (options && options.requestId) || null;
      this.retryable = Boolean(options && options.retryable);
    }
  }

  function safeApiError(error) {
    if (error instanceof NILApiError) return error;
    if (error && error.name === 'AbortError') {
      return new NILApiError('TIMEOUT', 'The API request timed out.', { retryable: true });
    }
    if (error instanceof TypeError) {
      return new NILApiError('NETWORK_ERROR', 'The API could not be reached.', { retryable: true });
    }
    const wrapped = new NILApiError(
      (error && error.code) || 'API_ERROR',
      (error && error.message) || 'The API request failed safely.',
      {
        status: error && error.status,
        requestId: error && error.requestId,
        retryable: Boolean(error && error.retryable)
      }
    );
    return wrapped;
  }

  async function request(path, options) {
    options = options || {};
    assertPath(path);
    if (!cfg.baseUrl) {
      throw new NILApiError('API_NOT_CONFIGURED', 'NIL API gateway is not configured yet.', { retryable: false });
    }

    const method = (options.method || 'POST').toUpperCase();

    let body;
    const headers = new Headers({ 'Accept': 'application/json' });
    if (options.body !== undefined) {
      body = JSON.stringify(options.body);
      if (byteLength(body) > cfg.maxRequestBytes) throw new NILApiError('REQUEST_TOO_LARGE', 'API request is too large.', { retryable: false });
      headers.set('Content-Type', 'application/json');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);

    try {
      const response = await fetch(cfg.baseUrl + path, {
        method,
        mode: 'cors',
        credentials: 'omit',
        redirect: 'error',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        headers,
        body,
        signal: controller.signal
      });

      const contentLength = Number(response.headers.get('content-length') || 0);
      if (contentLength && contentLength > cfg.maxResponseBytes) throw new Error('API response is too large.');
      const text = await response.text();
      if (byteLength(text) > cfg.maxResponseBytes) throw new Error('API response is too large.');

      let data = null;
      if (text) {
        try { data = JSON.parse(text); }
        catch (_) { throw new Error('Gateway returned invalid JSON.'); }
      }
      if (!response.ok) {
        const message = (data && data.error && typeof data.error === 'object' && data.error.message) || (data && typeof data.error === 'string' && data.error) || 'API request failed.';
        const err = new Error(message);
        err.status = response.status;
        err.code = (data && data.error && typeof data.error === 'object' && data.error.code) || (data && typeof data.error === 'string' && data.error) || undefined;
        err.requestId = data && typeof data.requestId === 'string' ? data.requestId : null;
        throw err;
      }
      return data;
    } catch (error) {
      throw safeApiError(error);
    } finally {
      clearTimeout(timer);
    }
  }

  window.NIL_API = Object.freeze({
    request,
    gateway: (operation, payload = {}) => request('/api/gateway', { method: 'POST', body: { operation, ...payload } }),
    wikiSearch: (query, limit = 5, language = 'en') => request('/api/gateway', { method: 'POST', body: { operation: 'wiki-search', query, limit, language } }),
    researchSearch: (query, limit = 5) => request('/api/gateway', { method: 'POST', body: { operation: 'research-search', query, limit } }),
    literatureSearch: (query, limit = 5) => request('/api/gateway', { method: 'POST', body: { operation: 'literature-search', query, limit } }),
    bookSearch: (query, limit = 5, language = 'en') => request('/api/gateway', { method: 'POST', body: { operation: 'book-search', query, limit, language } }),
    aiChat: (message, history = []) => request('/api/gateway', { method: 'POST', body: { operation: 'ai-chat', message, history } }),
    health: () => request('/api/gateway', { method: 'POST', body: { operation: 'health' } }),
    status: () => request('/api/v1/status', { method: 'GET' })
  });
})();
