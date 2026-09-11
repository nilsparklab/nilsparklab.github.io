import { corsHeaders, assertOrigin } from './security/cors.js';
import { json, error } from './security/http.js';
import { parseJson, validateQuery } from './security/validate.js';
import { allowRequest } from './security/rate-limit.js';
import { generateGemini } from './providers/gemini.js';

const MAX_BODY_BYTES = 8 * 1024;
const MAX_UPSTREAM_RESPONSE_BYTES = 512 * 1024;
const WIKIMEDIA_USER_AGENT = 'NIL-SparkLab/81 (educational app)';
const CROSSREF_USER_AGENT = 'NIL-SparkLab/81 (educational app)';
const EPMC_USER_AGENT = 'NIL-SparkLab/81 (educational app)';
const OPENLIBRARY_USER_AGENT = 'NIL-SparkLab/81 (educational app)';
let crossrefInFlight = false;
let europepmcInFlight = false;
let openLibraryInFlight = false;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');

    if (request.method === 'OPTIONS') {
      try { assertOrigin(origin, env.ALLOWED_ORIGIN); }
      catch (_) { return error(403, 'ORIGIN_NOT_ALLOWED', 'Origin is not allowed.'); }
      return new Response(null, { status: 204, headers: corsHeaders(origin, env.ALLOWED_ORIGIN) });
    }

    if (!allowRequest(request)) return error(429, 'RATE_LIMITED', 'Too many requests.', corsHeaders(origin, env.ALLOWED_ORIGIN));

    try {
      const path = url.pathname;
      assertOrigin(origin, env.ALLOWED_ORIGIN, request.method === 'GET' && path === '/api/v1/health');
      if (request.method === 'GET' && path === '/api/v1/health') {
        return json({ ok: true, service: 'nil-sparklab-api', version: 'v1' }, 200, corsHeaders(origin, env.ALLOWED_ORIGIN));
      }
      // Keep the Worker gateway aligned with the public frontend/backend contract.
      // /status is intentionally API-free and only reports gateway readiness.
      if (request.method === 'GET' && path === '/api/v1/status') {
        return json({ ok: true, apiConnected: true, providers: { wikimedia: true, crossref: true, europepmc: true, openlibrary: true }, message: 'Wikimedia web search, Crossref research search, Europe PMC literature search, and Open Library book search are configured.' }, 200, corsHeaders(origin, env.ALLOWED_ORIGIN));
      }
      if (path === '/api/gateway') {
        if (request.method !== 'POST') return error(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.', corsHeaders(origin, env.ALLOWED_ORIGIN));
        const body = await parseJson(request, MAX_BODY_BYTES);
        if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.operation !== 'string') {
          return error(400, 'INVALID_REQUEST', 'A valid operation is required.', corsHeaders(origin, env.ALLOWED_ORIGIN));
        }
        if (body.operation === 'health') {
          return json({ ok: true, service: 'api-gateway', status: 'ready' }, 200, corsHeaders(origin, env.ALLOWED_ORIGIN));
        }
        if (body.operation === 'provider-status') {
          return json({ ok: true, service: 'api-gateway', status: 'ready', providers: { wikimedia: true, crossref: true, europepmc: true, openlibrary: true } }, 200, corsHeaders(origin, env.ALLOWED_ORIGIN));
        }
        if (body.operation === 'ai-chat') {
          const result = await generateGemini(body, env);
          const status = result.ok ? 200 : (result.error === 'PROVIDER_NOT_CONFIGURED' ? 503 : result.error === 'UPSTREAM_BUSY' ? 429 : result.error === 'UPSTREAM_TIMEOUT' ? 504 : result.error === 'UPSTREAM_NETWORK_ERROR' || result.error === 'UPSTREAM_HTTP_ERROR' || result.error === 'UPSTREAM_INVALID_JSON' ? 502 : 400);
          return json(result, status, corsHeaders(origin, env.ALLOWED_ORIGIN));
        }
        if (body.operation === 'wiki-search') {
          if (typeof body.query !== 'string' || !body.query.trim() || body.query.trim().length > 160) {
            return error(400, 'INVALID_QUERY', 'Search query is required and must be 160 characters or fewer.', corsHeaders(origin, env.ALLOWED_ORIGIN));
          }
          const language = body.language === 'hi' ? 'hi' : 'en';
          if (body.language !== undefined && body.language !== 'en' && body.language !== 'hi') {
            return error(400, 'UNSUPPORTED_LANGUAGE', 'Only English or Hindi Wikipedia search is supported.', corsHeaders(origin, env.ALLOWED_ORIGIN));
          }
          const limit = Number.isInteger(body.limit) ? Math.max(1, Math.min(10, body.limit)) : 5;
          const upstream = new URL((language === 'hi' ? 'https://hi' : 'https://en') + '.wikipedia.org/w/rest.php/v1/search/page');
          upstream.searchParams.set('q', body.query.trim());
          upstream.searchParams.set('limit', String(limit));
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 8000);
          try {
            const upstreamResponse = await fetch(upstream.toString(), {
              headers: {
                'Accept': 'application/json',
                'User-Agent': WIKIMEDIA_USER_AGENT
              },
              signal: controller.signal
            });
            const contentLength = Number(upstreamResponse.headers.get('content-length') || 0);
            if (contentLength && contentLength > MAX_UPSTREAM_RESPONSE_BYTES) {
              return error(502, 'UPSTREAM_RESPONSE_TOO_LARGE', 'Wikipedia search response was too large.', corsHeaders(origin, env.ALLOWED_ORIGIN));
            }
            if (!upstreamResponse.ok) {
              return error(502, 'UPSTREAM_HTTP_ERROR', 'Wikipedia search is temporarily unavailable.', corsHeaders(origin, env.ALLOWED_ORIGIN));
            }
            const raw = await upstreamResponse.text();
            if (new TextEncoder().encode(raw).byteLength > MAX_UPSTREAM_RESPONSE_BYTES) {
              return error(502, 'UPSTREAM_RESPONSE_TOO_LARGE', 'Wikipedia search response was too large.', corsHeaders(origin, env.ALLOWED_ORIGIN));
            }
            let data;
            try { data = JSON.parse(raw); } catch (_) {
              return error(502, 'UPSTREAM_INVALID_JSON', 'Wikipedia returned invalid search data.', corsHeaders(origin, env.ALLOWED_ORIGIN));
            }
            const results = Array.isArray(data.pages) ? data.pages.map(page => ({
              id: page.id ?? null,
              title: typeof page.title === 'string' ? page.title : '',
              description: typeof page.description === 'string' ? page.description : '',
              excerpt: typeof page.excerpt === 'string' ? page.excerpt : '',
              key: typeof page.key === 'string' ? page.key : null,
              url: typeof page.key === 'string' && page.key ? ((language === 'hi' ? 'https://hi' : 'https://en') + '.wikipedia.org/wiki/' + encodeURIComponent(page.key.replace(/ /g, '_'))) : null
            })) : [];
            return json({ ok: true, provider: 'wikimedia', results }, 200, corsHeaders(origin, env.ALLOWED_ORIGIN));
          } catch (upstreamError) {
            if (upstreamError?.name === 'AbortError') {
              return error(504, 'UPSTREAM_TIMEOUT', 'Wikipedia search timed out.', corsHeaders(origin, env.ALLOWED_ORIGIN));
            }
            return error(502, 'UPSTREAM_NETWORK_ERROR', 'Wikipedia search could not be reached.', corsHeaders(origin, env.ALLOWED_ORIGIN));
          } finally {
            clearTimeout(timer);
          }
        }
        if (body.operation === 'research-search') {
          if (typeof body.query !== 'string' || !body.query.trim() || body.query.trim().length > 160) {
            return error(400, 'INVALID_QUERY', 'Research query is required and must be 160 characters or fewer.', corsHeaders(origin, env.ALLOWED_ORIGIN));
          }
          if (crossrefInFlight) {
            return error(429, 'UPSTREAM_BUSY', 'Crossref research search is busy. Please retry shortly.', corsHeaders(origin, env.ALLOWED_ORIGIN));
          }
          crossrefInFlight = true;
          const limit = Number.isInteger(body.limit) ? Math.max(1, Math.min(10, body.limit)) : 5;
          const upstream = new URL('https://api.crossref.org/v1/works');
          upstream.searchParams.set('query', body.query.trim());
          upstream.searchParams.set('rows', String(limit));
          upstream.searchParams.set('select', 'DOI,title,author,published,type,URL,publisher,container-title');
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 8000);
          try {
            const upstreamResponse = await fetch(upstream.toString(), {
              headers: {
                'Accept': 'application/json',
                'User-Agent': CROSSREF_USER_AGENT
              },
              signal: controller.signal
            });
            const contentLength = Number(upstreamResponse.headers.get('content-length') || 0);
            if (contentLength && contentLength > MAX_UPSTREAM_RESPONSE_BYTES) {
              return error(502, 'UPSTREAM_RESPONSE_TOO_LARGE', 'Crossref response was too large.', corsHeaders(origin, env.ALLOWED_ORIGIN));
            }
            if (!upstreamResponse.ok) {
              return error(502, 'UPSTREAM_HTTP_ERROR', 'Crossref research search is temporarily unavailable.', corsHeaders(origin, env.ALLOWED_ORIGIN));
            }
            const raw = await upstreamResponse.text();
            if (new TextEncoder().encode(raw).byteLength > MAX_UPSTREAM_RESPONSE_BYTES) {
              return error(502, 'UPSTREAM_RESPONSE_TOO_LARGE', 'Crossref response was too large.', corsHeaders(origin, env.ALLOWED_ORIGIN));
            }
            let data;
            try { data = JSON.parse(raw); } catch (_) {
              return error(502, 'UPSTREAM_INVALID_JSON', 'Crossref returned invalid research data.', corsHeaders(origin, env.ALLOWED_ORIGIN));
            }
            const items = data && data.message && Array.isArray(data.message.items) ? data.message.items : [];
            const results = items.map(item => {
              const title = Array.isArray(item?.title) && typeof item.title[0] === 'string' ? item.title[0].trim() : '';
              const doi = typeof item?.DOI === 'string' ? item.DOI.trim() : '';
              const authors = Array.isArray(item?.author) ? item.author.slice(0, 5).map(a => {
                if (!a || typeof a !== 'object') return '';
                return [typeof a.given === 'string' ? a.given.trim() : '', typeof a.family === 'string' ? a.family.trim() : ''].filter(Boolean).join(' ');
              }).filter(Boolean) : [];
              const parts = item?.published?.['date-parts'];
              const year = Array.isArray(parts) && Array.isArray(parts[0]) && Number.isInteger(parts[0][0]) ? parts[0][0] : null;
              const journal = Array.isArray(item?.['container-title']) && typeof item['container-title'][0] === 'string' ? item['container-title'][0].trim() : '';
              const doiClean = doi.replace(/^https?:\/\/doi\.org\//i, '');
              const url = doiClean && doiClean.length <= 300 && !/[\u0000-\u001F\u007F\s]/.test(doiClean)
                ? 'https://doi.org/' + encodeURIComponent(doiClean)
                : null;
              return {
                doi: doi || null,
                title,
                authors,
                year,
                type: typeof item?.type === 'string' ? item.type : '',
                publisher: typeof item?.publisher === 'string' ? item.publisher.trim() : '',
                journal,
                url
              };
            }).filter(item => item.title || item.doi).slice(0, 10);
            return json({ ok: true, provider: 'crossref', results }, 200, corsHeaders(origin, env.ALLOWED_ORIGIN));
          } catch (upstreamError) {
            if (upstreamError?.name === 'AbortError') {
              return error(504, 'UPSTREAM_TIMEOUT', 'Crossref research search timed out.', corsHeaders(origin, env.ALLOWED_ORIGIN));
            }
            return error(502, 'UPSTREAM_NETWORK_ERROR', 'Crossref research search could not be reached.', corsHeaders(origin, env.ALLOWED_ORIGIN));
          } finally {
            clearTimeout(timer);
            crossrefInFlight = false;
          }
        }
        if (body.operation === 'literature-search') {
          if (typeof body.query !== 'string' || !body.query.trim() || body.query.trim().length > 160) {
            return error(400, 'INVALID_QUERY', 'Literature query is required and must be 160 characters or fewer.', corsHeaders(origin, env.ALLOWED_ORIGIN));
          }
          if (europepmcInFlight) return error(429, 'UPSTREAM_BUSY', 'Europe PMC literature search is busy. Please retry shortly.', corsHeaders(origin, env.ALLOWED_ORIGIN));
          europepmcInFlight = true;
          const limit = Number.isInteger(body.limit) ? Math.max(1, Math.min(10, body.limit)) : 5;
          const upstream = new URL('https://www.ebi.ac.uk/europepmc/webservices/rest/search');
          upstream.searchParams.set('query', body.query.trim());
          upstream.searchParams.set('format', 'json');
          upstream.searchParams.set('resultType', 'lite');
          upstream.searchParams.set('pageSize', String(limit));
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 8000);
          try {
            const upstreamResponse = await fetch(upstream.toString(), { headers: { 'Accept': 'application/json', 'User-Agent': EPMC_USER_AGENT }, signal: controller.signal });
            const contentLength = Number(upstreamResponse.headers.get('content-length') || 0);
            if (contentLength && contentLength > MAX_UPSTREAM_RESPONSE_BYTES) return error(502, 'UPSTREAM_RESPONSE_TOO_LARGE', 'Europe PMC response was too large.', corsHeaders(origin, env.ALLOWED_ORIGIN));
            if (!upstreamResponse.ok) return error(502, 'UPSTREAM_HTTP_ERROR', 'Literature search is temporarily unavailable.', corsHeaders(origin, env.ALLOWED_ORIGIN));
            const raw = await upstreamResponse.text();
            if (new TextEncoder().encode(raw).byteLength > MAX_UPSTREAM_RESPONSE_BYTES) return error(502, 'UPSTREAM_RESPONSE_TOO_LARGE', 'Europe PMC response was too large.', corsHeaders(origin, env.ALLOWED_ORIGIN));
            let data; try { data = JSON.parse(raw); } catch (_) { return error(502, 'UPSTREAM_INVALID_JSON', 'Europe PMC returned invalid literature data.', corsHeaders(origin, env.ALLOWED_ORIGIN)); }
            const items = data && data.resultList && Array.isArray(data.resultList.result) ? data.resultList.result : [];
            const results = items.map(item => {
              const source = typeof item?.source === 'string' ? item.source.trim() : '';
              const id = typeof item?.id === 'string' ? item.id.trim() : '';
              const pmcid = typeof item?.pmcid === 'string' ? item.pmcid.trim() : '';
              let url = null;
              if (source && id && /^[A-Za-z0-9._-]{1,24}$/.test(source) && /^[A-Za-z0-9._-]{1,120}$/.test(id)) url = 'https://europepmc.org/article/' + source + '/' + encodeURIComponent(id);
              else if (pmcid && /^PMC[0-9]+$/i.test(pmcid)) url = 'https://europepmc.org/article/PMC/' + encodeURIComponent(pmcid);
              return {
                title: typeof item?.title === 'string' ? item.title.trim() : '',
                authors: Array.isArray(item?.authorString) ? item.authorString.slice(0,5) : (typeof item?.authorString === 'string' ? item.authorString.split(',').map(a=>a.trim()).filter(Boolean).slice(0,5) : []),
                year: Number.isInteger(Number(item?.pubYear)) ? Number(item.pubYear) : null,
                journal: typeof item?.journalTitle === 'string' ? item.journalTitle.trim() : '',
                doi: typeof item?.doi === 'string' ? item.doi.trim() : '',
                pmid: typeof item?.pmid === 'string' ? item.pmid.trim() : '',
                source,
                url
              };
            }).filter(item => item.title || item.doi || item.pmid).slice(0, 10);
            return json({ ok: true, provider: 'europepmc', results }, 200, corsHeaders(origin, env.ALLOWED_ORIGIN));
          } catch (upstreamError) {
            if (upstreamError?.name === 'AbortError') return error(504, 'UPSTREAM_TIMEOUT', 'Europe PMC literature search timed out.', corsHeaders(origin, env.ALLOWED_ORIGIN));
            return error(502, 'UPSTREAM_NETWORK_ERROR', 'Europe PMC literature search could not be reached.', corsHeaders(origin, env.ALLOWED_ORIGIN));
          } finally { clearTimeout(timer); europepmcInFlight = false; }
        }
        if (body.operation === 'book-search') {
          if (typeof body.query !== 'string' || !body.query.trim() || body.query.trim().length > 160) {
            return error(400, 'INVALID_QUERY', 'Book query is required and must be 160 characters or fewer.', corsHeaders(origin, env.ALLOWED_ORIGIN));
          }
          if (body.language !== undefined && body.language !== 'en' && body.language !== 'hi') {
            return error(400, 'UNSUPPORTED_LANGUAGE', 'Only English or Hindi book search is supported.', corsHeaders(origin, env.ALLOWED_ORIGIN));
          }
          if (openLibraryInFlight) return error(429, 'UPSTREAM_BUSY', 'Open Library book search is busy. Please retry shortly.', corsHeaders(origin, env.ALLOWED_ORIGIN));
          openLibraryInFlight = true;
          const language = body.language === 'hi' ? 'hi' : 'en';
          const limit = Number.isInteger(body.limit) ? Math.max(1, Math.min(10, body.limit)) : 5;
          const upstream = new URL('https://openlibrary.org/search.json');
          upstream.searchParams.set('q', body.query.trim());
          upstream.searchParams.set('limit', String(limit));
          upstream.searchParams.set('fields', 'key,title,author_name,first_publish_year,publisher');
          upstream.searchParams.set('lang', language);
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 8000);
          try {
            const upstreamResponse = await fetch(upstream.toString(), { headers: { 'Accept': 'application/json', 'User-Agent': OPENLIBRARY_USER_AGENT }, signal: controller.signal });
            const contentLength = Number(upstreamResponse.headers.get('content-length') || 0);
            if (contentLength && contentLength > MAX_UPSTREAM_RESPONSE_BYTES) return error(502, 'UPSTREAM_RESPONSE_TOO_LARGE', 'Open Library response was too large.', corsHeaders(origin, env.ALLOWED_ORIGIN));
            if (!upstreamResponse.ok) return error(502, 'UPSTREAM_HTTP_ERROR', 'Book search is temporarily unavailable.', corsHeaders(origin, env.ALLOWED_ORIGIN));
            const raw = await upstreamResponse.text();
            if (new TextEncoder().encode(raw).byteLength > MAX_UPSTREAM_RESPONSE_BYTES) return error(502, 'UPSTREAM_RESPONSE_TOO_LARGE', 'Open Library response was too large.', corsHeaders(origin, env.ALLOWED_ORIGIN));
            let data; try { data = JSON.parse(raw); } catch (_) { return error(502, 'UPSTREAM_INVALID_JSON', 'Open Library returned invalid book data.', corsHeaders(origin, env.ALLOWED_ORIGIN)); }
            const docs = data && Array.isArray(data.docs) ? data.docs : [];
            const results = docs.map(item => {
              const key = typeof item?.key === 'string' ? item.key.trim() : '';
              const safeUrl = /^\/works\/OL[0-9]+W$/.test(key) ? 'https://openlibrary.org' + key : null;
              return {
                title: typeof item?.title === 'string' ? item.title.trim() : '',
                authors: Array.isArray(item?.author_name) ? item.author_name.filter(a => typeof a === 'string').map(a => a.trim()).filter(Boolean).slice(0, 5) : [],
                year: Number.isInteger(Number(item?.first_publish_year)) ? Number(item.first_publish_year) : null,
                publisher: Array.isArray(item?.publisher) ? item.publisher.filter(a => typeof a === 'string').map(a => a.trim()).filter(Boolean).slice(0, 3) : [],
                key,
                url: safeUrl
              };
            }).filter(item => item.title || item.key).slice(0, limit);
            return json({ ok: true, provider: 'openlibrary', results }, 200, corsHeaders(origin, env.ALLOWED_ORIGIN));
          } catch (upstreamError) {
            if (upstreamError?.name === 'AbortError') return error(504, 'UPSTREAM_TIMEOUT', 'Open Library book search timed out.', corsHeaders(origin, env.ALLOWED_ORIGIN));
            return error(502, 'UPSTREAM_NETWORK_ERROR', 'Open Library could not be reached.', corsHeaders(origin, env.ALLOWED_ORIGIN));
          } finally { clearTimeout(timer); openLibraryInFlight = false; }
        }
        return error(400, 'OPERATION_NOT_ALLOWED', 'Operation is not allowed.', corsHeaders(origin, env.ALLOWED_ORIGIN));
      }
      if (request.method !== 'POST') return error(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.', corsHeaders(origin, env.ALLOWED_ORIGIN));
      if (!['/api/v1/study', '/api/v1/books', '/api/v1/dictionary', '/api/v1/search'].includes(path)) {
        return error(404, 'NOT_FOUND', 'Endpoint not found.', corsHeaders(origin, env.ALLOWED_ORIGIN));
      }
      const body = await parseJson(request, MAX_BODY_BYTES);
      const field = path === '/api/v1/dictionary' ? 'term' : 'query';
      const value = validateQuery(body[field]);

      // Intentionally no arbitrary URL proxying. Add one trusted upstream per route here.
      // Secrets must be stored with: wrangler secret put <NAME>
      return error(503, 'SERVICE_NOT_CONFIGURED', 'Service is not configured yet.', corsHeaders(origin, env.ALLOWED_ORIGIN));
    } catch (e) {
      const status = e.status || 400;
      return error(status, e.code || 'BAD_REQUEST', status >= 500 ? 'Internal server error.' : e.message, corsHeaders(origin, env.ALLOWED_ORIGIN));
    }
  }
};
