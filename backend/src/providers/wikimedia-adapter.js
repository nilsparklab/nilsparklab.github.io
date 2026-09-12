const WIKIMEDIA_SEARCH_BASES = Object.freeze({
  en: "https://en.wikipedia.org/w/rest.php/v1/search/page",
  hi: "https://hi.wikipedia.org/w/rest.php/v1/search/page"
});
const WIKIMEDIA_ARTICLE_BASES = Object.freeze({
  en: "https://en.wikipedia.org/wiki/",
  hi: "https://hi.wikipedia.org/wiki/"
});
const MAX_QUERY_LENGTH = 160;
const MAX_RESULTS = 10;
const MAX_RESPONSE_BYTES = 512 * 1024;
const USER_AGENT = "NIL-SparkLab/81 (educational app)";

export async function searchWikipedia(query, options = {}) {
  if (typeof query !== "string") {
    return { ok: false, error: "INVALID_QUERY", message: "Search query must be text." };
  }
  const normalized = query.trim();
  if (!normalized) {
    return { ok: false, error: "INVALID_QUERY", message: "Search query is required." };
  }
  if (normalized.length > MAX_QUERY_LENGTH) {
    return { ok: false, error: "QUERY_TOO_LONG", message: "Search query is too long." };
  }

  const language = options.language === "hi" ? "hi" : "en";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const url = new URL(WIKIMEDIA_SEARCH_BASES[language]);
    const limit = Number.isInteger(options.limit)
      ? Math.max(1, Math.min(MAX_RESULTS, options.limit))
      : 5;
    url.searchParams.set("q", normalized);
    url.searchParams.set("limit", String(limit));

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "User-Agent": USER_AGENT
      },
      signal: controller.signal
    });

    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength && contentLength > MAX_RESPONSE_BYTES) {
      return { ok: false, error: "UPSTREAM_RESPONSE_TOO_LARGE", message: "Wikipedia search response was too large." };
    }

    if (!response.ok) {
      return {
        ok: false,
        error: "UPSTREAM_HTTP_ERROR",
        status: response.status,
        message: "Wikipedia search is temporarily unavailable."
      };
    }

    const raw = await response.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_RESPONSE_BYTES) {
      return { ok: false, error: "UPSTREAM_RESPONSE_TOO_LARGE", message: "Wikipedia search response was too large." };
    }
    let data;
    try { data = JSON.parse(raw); } catch (_) {
      return { ok: false, error: "UPSTREAM_INVALID_JSON", message: "Wikipedia returned invalid search data." };
    }
    const pages = Array.isArray(data.pages) ? data.pages : [];

    return {
      ok: true,
      provider: "wikimedia",
      results: pages.map(page => ({
        id: page.id ?? null,
        title: typeof page.title === "string" ? page.title : "",
        description: typeof page.description === "string" ? page.description : "",
        excerpt: typeof page.excerpt === "string" ? page.excerpt : "",
        key: typeof page.key === "string" ? page.key : null,
        url: typeof page.key === "string" && page.key
          ? WIKIMEDIA_ARTICLE_BASES[language] + encodeURIComponent(page.key.replace(/ /g, "_"))
          : null
      }))
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      return { ok: false, error: "UPSTREAM_TIMEOUT", message: "Wikipedia search timed out." };
    }
    return { ok: false, error: "UPSTREAM_NETWORK_ERROR", message: "Wikipedia search could not be reached." };
  } finally {
    clearTimeout(timer);
  }
}
