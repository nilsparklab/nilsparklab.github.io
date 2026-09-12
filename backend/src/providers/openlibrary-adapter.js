const OPENLIBRARY_SEARCH_URL = "https://openlibrary.org/search.json";
const MAX_QUERY_LENGTH = 160;
const MAX_RESULTS = 10;
const MAX_RESPONSE_BYTES = 512 * 1024;
const USER_AGENT = "NIL-SparkLab/81 (educational app)";
let openLibraryInFlight = false;

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function workUrl(key) {
  const normalized = cleanString(key);
  if (!/^\/works\/OL[0-9]+W$/.test(normalized)) return null;
  return `https://openlibrary.org${normalized}`;
}

export async function searchOpenLibrary(query, options = {}) {
  if (typeof query !== "string") return { ok: false, error: "INVALID_QUERY", message: "Book query must be text." };
  const normalized = query.trim();
  if (!normalized) return { ok: false, error: "INVALID_QUERY", message: "Book query is required." };
  if (normalized.length > MAX_QUERY_LENGTH) return { ok: false, error: "QUERY_TOO_LONG", message: "Book query is too long." };
  if (openLibraryInFlight) return { ok: false, error: "UPSTREAM_BUSY", status: 429, message: "Book search is busy. Please retry shortly." };

  openLibraryInFlight = true;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const url = new URL(OPENLIBRARY_SEARCH_URL);
    const limit = Number.isInteger(options.limit) ? Math.max(1, Math.min(MAX_RESULTS, options.limit)) : 5;
    url.searchParams.set("q", normalized);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("fields", "key,title,author_name,first_publish_year,publisher");
    if (options.language === "en" || options.language === "hi") url.searchParams.set("lang", options.language);

    const response = await fetch(url, { method: "GET", headers: { Accept: "application/json", "User-Agent": USER_AGENT }, signal: controller.signal });
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength && contentLength > MAX_RESPONSE_BYTES) return { ok: false, error: "UPSTREAM_RESPONSE_TOO_LARGE", message: "Open Library response was too large." };
    if (!response.ok) return { ok: false, error: "UPSTREAM_HTTP_ERROR", status: response.status, message: "Book search is temporarily unavailable." };
    const raw = await response.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_RESPONSE_BYTES) return { ok: false, error: "UPSTREAM_RESPONSE_TOO_LARGE", message: "Open Library response was too large." };
    let data;
    try { data = JSON.parse(raw); } catch (_) { return { ok: false, error: "UPSTREAM_INVALID_JSON", message: "Open Library returned invalid book data." }; }
    const docs = Array.isArray(data?.docs) ? data.docs : [];
    const results = docs.map((item) => ({
      title: cleanString(item?.title),
      authors: Array.isArray(item?.author_name) ? item.author_name.map(cleanString).filter(Boolean).slice(0, 5) : [],
      year: Number.isInteger(Number(item?.first_publish_year)) ? Number(item.first_publish_year) : null,
      publisher: Array.isArray(item?.publisher) ? item.publisher.map(cleanString).filter(Boolean).slice(0, 3) : [],
      key: cleanString(item?.key),
      url: workUrl(item?.key)
    })).filter((item) => item.title || item.key).slice(0, limit);
    return { ok: true, provider: "openlibrary", results };
  } catch (error) {
    if (error?.name === "AbortError") return { ok: false, error: "UPSTREAM_TIMEOUT", message: "Open Library book search timed out." };
    return { ok: false, error: "UPSTREAM_NETWORK_ERROR", message: "Open Library could not be reached." };
  } finally {
    clearTimeout(timer);
    openLibraryInFlight = false;
  }
}
