import { corsHeaders, assertOrigin } from './security/cors.js';
import { json, error } from './security/http.js';
import { parseJson, validateQuery } from './security/validate.js';
import { allowRequest } from './security/rate-limit.js';
import { allowAiRequest } from './security/ai-rate-limit.js';
import { generateGemini } from './providers/gemini.js';

const MAX_BODY_BYTES = 40 * 1024; // matches js/api/api-config.js maxRequestBytes — keep these two in sync
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

    if (!(await allowRequest(request, env))) return error(429, 'RATE_LIMITED', 'Too many requests.', corsHeaders(origin, env.ALLOWED_ORIGIN));

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
          if (!(await allowAiRequest(request, env))) {
            return error(429, 'AI_RATE_LIMITED', 'Too many AI requests. Please slow down and try again shortly.', corsHeaders(origin, env.ALLOWED_ORIGIN));
          }
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
        if (body.operation === 'sync-push' || body.operation === 'sync-pull') {
          if (typeof body.code !== 'string' || !/^[A-Za-z0-9]{8,16}$/.test(body.code)) {
            return error(400, 'INVALID_SYNC_CODE', 'Sync code must be 8-16 letters/numbers.', corsHeaders(origin, env.ALLOWED_ORIGIN));
          }
          if (!env.PROGRESS_SYNC) {
            return error(503, 'SYNC_NOT_CONFIGURED', 'Progress sync storage is not configured on this deployment.', corsHeaders(origin, env.ALLOWED_ORIGIN));
          }
          const kvKey = 'sync:' + body.code;
          if (body.operation === 'sync-push') {
            if (typeof body.data !== 'string' || body.data.length === 0) {
              return error(400, 'INVALID_SYNC_DATA', 'Sync data must be a non-empty JSON string.', corsHeaders(origin, env.ALLOWED_ORIGIN));
            }
            if (new TextEncoder().encode(body.data).byteLength > 32 * 1024) {
              return error(400, 'SYNC_DATA_TOO_LARGE', 'Sync data must be 32KB or smaller.', corsHeaders(origin, env.ALLOWED_ORIGIN));
            }
            try { JSON.parse(body.data); } catch (_) {
              return error(400, 'INVALID_SYNC_DATA', 'Sync data must be valid JSON.', corsHeaders(origin, env.ALLOWED_ORIGIN));
            }
            const updatedAt = new Date().toISOString();
            // 90-day TTL: an unused sync code quietly expires instead of
            // occupying KV storage forever.
            await env.PROGRESS_SYNC.put(kvKey, JSON.stringify({ data: body.data, updatedAt }), { expirationTtl: 7_776_000 });
            return json({ ok: true, updatedAt }, 200, corsHeaders(origin, env.ALLOWED_ORIGIN));
          }
          // sync-pull
          const stored = await env.PROGRESS_SYNC.get(kvKey);
          if (!stored) {
            return error(404, 'SYNC_CODE_NOT_FOUND', 'No synced data found for that code yet.', corsHeaders(origin, env.ALLOWED_ORIGIN));
          }
          let parsed;
          try { parsed = JSON.parse(stored); } catch (_) {
            return error(502, 'SYNC_DATA_CORRUPT', 'Stored sync data was corrupt.', corsHeaders(origin, env.ALLOWED_ORIGIN));
          }
          return json({ ok: true, data: parsed.data, updatedAt: parsed.updatedAt }, 200, corsHeaders(origin, env.ALLOWED_ORIGIN));
        }
        if (body.operation === 'class-push' || body.operation === 'class-pull') {
          if (typeof body.room !== 'string' || !/^[A-Za-z0-9]{3,12}$/.test(body.room)) {
            return error(400, 'INVALID_ROOM_CODE', 'Room code must be 3-12 letters/numbers.', corsHeaders(origin, env.ALLOWED_ORIGIN));
          }
          if (!env.CLASSROOM_LIVE) {
            return error(503, 'CLASSROOM_NOT_CONFIGURED', 'Live classroom storage is not configured on this deployment.', corsHeaders(origin, env.ALLOWED_ORIGIN));
          }
          const room = body.room.toUpperCase();
          if (body.operation === 'class-push') {
            if (typeof body.studentId !== 'string' || !/^[A-Za-z0-9]{8,24}$/.test(body.studentId)) {
              return error(400, 'INVALID_STUDENT_ID', 'Student id looks invalid.', corsHeaders(origin, env.ALLOWED_ORIGIN));
            }
            const studentName = String(body.studentName || 'Student').slice(0, 40);
            if (typeof body.status !== 'string' || body.status.length === 0) {
              return error(400, 'INVALID_STATUS', 'Status must be a non-empty JSON string.', corsHeaders(origin, env.ALLOWED_ORIGIN));
            }
            if (new TextEncoder().encode(body.status).byteLength > 4 * 1024) {
              return error(400, 'STATUS_TOO_LARGE', 'Status must be 4KB or smaller.', corsHeaders(origin, env.ALLOWED_ORIGIN));
            }
            try { JSON.parse(body.status); } catch (_) {
              return error(400, 'INVALID_STATUS', 'Status must be valid JSON.', corsHeaders(origin, env.ALLOWED_ORIGIN));
            }
            const updatedAt = new Date().toISOString();
            // 6-hour TTL — a classroom session's worth of time, then the
            // roster quietly clears itself instead of accumulating forever.
            await env.CLASSROOM_LIVE.put('class:' + room + ':' + body.studentId,
              JSON.stringify({ studentName, status: body.status, updatedAt }), { expirationTtl: 21_600 });
            return json({ ok: true, updatedAt }, 200, corsHeaders(origin, env.ALLOWED_ORIGIN));
          }
          // class-pull — list every student currently in this room
          const listResult = await env.CLASSROOM_LIVE.list({ prefix: 'class:' + room + ':', limit: 60 });
          const students = [];
          for (const key of listResult.keys) {
            const raw = await env.CLASSROOM_LIVE.get(key.name);
            if (!raw) continue;
            try {
              const parsed = JSON.parse(raw);
              students.push({ studentId: key.name.split(':')[2], studentName: parsed.studentName, status: parsed.status, updatedAt: parsed.updatedAt });
            } catch (_) { /* skip a corrupt entry rather than fail the whole roster */ }
          }
          return json({ ok: true, room, students }, 200, corsHeaders(origin, env.ALLOWED_ORIGIN));
        }
        if (body.operation === 'gallery-publish' || body.operation === 'gallery-list') {
          if (!env.CIRCUIT_GALLERY) {
            return error(503, 'GALLERY_NOT_CONFIGURED', 'Circuit gallery storage is not configured on this deployment.', corsHeaders(origin, env.ALLOWED_ORIGIN));
          }
          if (body.operation === 'gallery-publish') {
            const title = String(body.title || '').trim().slice(0, 60);
            if (!title) {
              return error(400, 'INVALID_TITLE', 'Give the circuit a title.', corsHeaders(origin, env.ALLOWED_ORIGIN));
            }
            const authorName = String(body.authorName || 'Anonymous').trim().slice(0, 40) || 'Anonymous';
            if (typeof body.code !== 'string' || !/^[A-Za-z0-9_-]{1,8000}$/.test(body.code)) {
              return error(400, 'INVALID_CODE', 'Circuit code is missing or looks invalid.', corsHeaders(origin, env.ALLOWED_ORIGIN));
            }
            const id = crypto.randomUUID();
            const createdAt = new Date().toISOString();
            // Invert the timestamp into the key so a plain lexicographic
            // KV list() naturally comes back newest-first, with no
            // separate index to maintain.
            const sortKey = String(Number.MAX_SAFE_INTEGER - Date.now()).padStart(16, '0');
            await env.CIRCUIT_GALLERY.put('circuit:' + sortKey + ':' + id,
              JSON.stringify({ id, title, authorName, code: body.code, createdAt }));
            return json({ ok: true, id, createdAt }, 200, corsHeaders(origin, env.ALLOWED_ORIGIN));
          }
          // gallery-list
          const listResult = await env.CIRCUIT_GALLERY.list({ prefix: 'circuit:', limit: 50 });
          const circuits = [];
          for (const key of listResult.keys) {
            const raw = await env.CIRCUIT_GALLERY.get(key.name);
            if (!raw) continue;
            try { circuits.push(JSON.parse(raw)); } catch (_) { /* skip a corrupt entry rather than fail the whole list */ }
          }
          return json({ ok: true, circuits }, 200, corsHeaders(origin, env.ALLOWED_ORIGIN));
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
