(function () {
  'use strict';

  const MAX_SOURCES = 8;
  const MAX_TEXT = 220;

  function clean(value, max = MAX_TEXT) {
    const s = typeof value === 'string' ? value.trim() : '';
    return s.length > max ? s.slice(0, max) : s;
  }

  function safeUrl(value) {
    if (typeof value !== 'string') return null;
    try {
      const u = new URL(value);
      const allowed = new Set([
        'wikipedia.org',
        'en.wikipedia.org',
        'hi.wikipedia.org',
        'crossref.org',
        'api.crossref.org',
        'europepmc.org',
        'pubmed.ncbi.nlm.nih.gov',
        'openlibrary.org'
      ]);
      const host = u.hostname.toLowerCase();
      const ok = [...allowed].some(domain => host === domain || host.endsWith('.' + domain));
      if (u.protocol !== 'https:' || !ok) return null;
      return u.toString();
    } catch (_) {
      return null;
    }
  }

  function normalize(raw) {
    const list = Array.isArray(raw) ? raw : [];
    const seen = new Set();
    const out = [];
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      const url = safeUrl(item.url || item.link || item.href);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      out.push({
        title: clean(item.title || item.name || 'Source'),
        provider: clean(item.provider || item.source || 'Verified source', 80),
        url
      });
      if (out.length >= MAX_SOURCES) break;
    }
    return out;
  }

  function fromProviderResults(provider, results) {
    const list = Array.isArray(results) ? results : [];
    return normalize(list.map(item => ({
      title: item && (item.title || item.name),
      provider,
      url: item && (item.url || item.link || item.href)
    })));
  }

  function render(sources) {
    const list = normalize(sources);
    if (!list.length) return '';
    const items = list.map((source, index) => {
      const title = String(source.title || 'Source').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
      const provider = String(source.provider || 'Source').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
      const url = String(source.url).replace(/"/g, '&quot;');
      return `<li><a href="${url}" target="_blank" rel="noopener noreferrer" data-citation-index="${index + 1}">${title}</a><span class="nil-citation-provider">${provider}</span></li>`;
    }).join('');
    return `<div class="nil-assistant-citations" aria-label="Sources"><strong>Sources</strong><ol>${items}</ol></div>`;
  }

  window.NIL_ASSISTANT_CITATIONS = Object.freeze({
    normalize,
    fromProviderResults,
    render
  });
})();
