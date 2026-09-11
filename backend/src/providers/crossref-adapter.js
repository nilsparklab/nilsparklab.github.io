const CROSSREF_SEARCH_URL = "https://api.crossref.org/v1/works";
const MAX_QUERY_LENGTH = 160;
const MAX_RESULTS = 10;
const MAX_RESPONSE_BYTES = 512 * 1024;
const USER_AGENT = "NIL-SparkLab/81 (educational app)";
let crossrefInFlight = false;

function normalizeAuthors(authors) {
  if (!Array.isArray(authors)) return [];
  return authors.slice(0, 5).map((a) => {
    if (!a || typeof a !== "object") return "";
    const given = typeof a.given === "string" ? a.given.trim() : "";
    const family = typeof a.family === "string" ? a.family.trim() : "";
    return [given, family].filter(Boolean).join(" ");
  }).filter(Boolean);
}

function publishedYear(item) {
  const parts = item && item.published && item.published["date-parts"];
  const year = Array.isArray(parts) && Array.isArray(parts[0]) ? parts[0][0] : null;
  return Number.isInteger(year) && year >= 0 ? year : null;
}

function doiUrl(doi) {
  if (typeof doi !== "string") return null;
  const clean = doi.trim().replace(/^https?:\/\/doi\.org\//i, "");
  if (!clean || clean.length > 300 || /[\u0000-\u001F\u007F\s]/.test(clean)) return null;
  return `https://doi.org/${encodeURIComponent(clean)}`;
}

export async function searchCrossref(query, options = {}) {
  if (typeof query !== "string") {
    return { ok: false, error: "INVALID_QUERY", message: "Research query must be text." };
  }
  const normalized = query.trim();
  if (!normalized) {
    return { ok: false, error: "INVALID_QUERY", message: "Research query is required." };
  }
  if (normalized.length > MAX_QUERY_LENGTH) {
    return { ok: false, error: "QUERY_TOO_LONG", message: "Research query is too long." };
  }

  if (crossrefInFlight) {
    return { ok: false, error: "UPSTREAM_BUSY", status: 429, message: "Crossref research search is busy. Please retry shortly." };
  }
  crossrefInFlight = true;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const url = new URL(CROSSREF_SEARCH_URL);
    const limit = Number.isInteger(options.limit)
      ? Math.max(1, Math.min(MAX_RESULTS, options.limit))
      : 5;
    url.searchParams.set("query", normalized);
    url.searchParams.set("rows", String(limit));
    url.searchParams.set("select", "DOI,title,author,published,type,URL,publisher,container-title");

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT
      },
      signal: controller.signal
    });

    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength && contentLength > MAX_RESPONSE_BYTES) {
      return { ok: false, error: "UPSTREAM_RESPONSE_TOO_LARGE", message: "Crossref response was too large." };
    }

    if (!response.ok) {
      return {
        ok: false,
        error: "UPSTREAM_HTTP_ERROR",
        status: response.status,
        message: "Research search is temporarily unavailable."
      };
    }

    const raw = await response.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_RESPONSE_BYTES) {
      return { ok: false, error: "UPSTREAM_RESPONSE_TOO_LARGE", message: "Crossref response was too large." };
    }

    let data;
    try { data = JSON.parse(raw); }
    catch (_) { return { ok: false, error: "UPSTREAM_INVALID_JSON", message: "Crossref returned invalid research data." }; }

    const items = data && data.message && Array.isArray(data.message.items) ? data.message.items : [];
    const results = items.map((item) => {
      const title = Array.isArray(item?.title) && typeof item.title[0] === "string" ? item.title[0].trim() : "";
      const doi = typeof item?.DOI === "string" ? item.DOI.trim() : "";
      const container = Array.isArray(item?.["container-title"]) && typeof item["container-title"][0] === "string" ? item["container-title"][0].trim() : "";
      return {
        doi: doi || null,
        title,
        authors: normalizeAuthors(item?.author),
        year: publishedYear(item),
        type: typeof item?.type === "string" ? item.type : "",
        publisher: typeof item?.publisher === "string" ? item.publisher.trim() : "",
        journal: container,
        url: doiUrl(doi)
      };
    }).filter((item) => item.title || item.doi).slice(0, MAX_RESULTS);

    return { ok: true, provider: "crossref", results };
  } catch (error) {
    if (error?.name === "AbortError") {
      return { ok: false, error: "UPSTREAM_TIMEOUT", message: "Crossref research search timed out." };
    }
    return { ok: false, error: "UPSTREAM_NETWORK_ERROR", message: "Crossref research search could not be reached." };
  } finally {
    clearTimeout(timer);
    crossrefInFlight = false;
  }
}
