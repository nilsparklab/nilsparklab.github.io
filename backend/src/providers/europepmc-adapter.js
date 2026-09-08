const EPMC_SEARCH_URL = "https://www.ebi.ac.uk/europepmc/webservices/rest/search";
const MAX_QUERY_LENGTH = 160;
const MAX_RESULTS = 10;
const MAX_RESPONSE_BYTES = 512 * 1024;
const USER_AGENT = "NIL-SparkLab/81 (educational app)";
let epmcInFlight = false;

function authorsOf(item) {
  const list = item && item.authorList && item.authorList.author;
  if (Array.isArray(list)) {
    return list.slice(0, 5).map((a) => {
      if (!a || typeof a !== "object") return "";
      return [typeof a.fullName === "string" ? a.fullName.trim() : "", typeof a.firstName === "string" ? a.firstName.trim() : "", typeof a.lastName === "string" ? a.lastName.trim() : ""].filter(Boolean)[0] || "";
    }).filter(Boolean);
  }
  if (typeof item?.authorString === "string") return item.authorString.split(",").map((a) => a.trim()).filter(Boolean).slice(0, 5);
  return [];
}

function articleUrl(item) {
  const source = typeof item?.source === "string" ? item.source.trim() : "";
  const id = typeof item?.id === "string" ? item.id.trim() : "";
  const pmcid = typeof item?.pmcid === "string" ? item.pmcid.trim() : "";
  if (source && id && /^[A-Za-z0-9._-]{1,24}$/.test(source) && /^[A-Za-z0-9._-]{1,120}$/.test(id)) return `https://europepmc.org/article/${source}/${encodeURIComponent(id)}`;
  if (pmcid && /^PMC[0-9]+$/i.test(pmcid)) return `https://europepmc.org/article/PMC/${encodeURIComponent(pmcid)}`;
  return null;
}

export async function searchEuropePMC(query, options = {}) {
  if (typeof query !== "string") return { ok: false, error: "INVALID_QUERY", message: "Literature query must be text." };
  const normalized = query.trim();
  if (!normalized) return { ok: false, error: "INVALID_QUERY", message: "Literature query is required." };
  if (normalized.length > MAX_QUERY_LENGTH) return { ok: false, error: "QUERY_TOO_LONG", message: "Literature query is too long." };
  if (epmcInFlight) return { ok: false, error: "UPSTREAM_BUSY", status: 429, message: "Literature search is busy. Please retry shortly." };
  epmcInFlight = true;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const url = new URL(EPMC_SEARCH_URL);
    const limit = Number.isInteger(options.limit) ? Math.max(1, Math.min(MAX_RESULTS, options.limit)) : 5;
    url.searchParams.set("query", normalized);
    url.searchParams.set("format", "json");
    url.searchParams.set("resultType", "lite");
    url.searchParams.set("pageSize", String(limit));
    const response = await fetch(url, { method: "GET", headers: { Accept: "application/json", "User-Agent": USER_AGENT }, signal: controller.signal });
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength && contentLength > MAX_RESPONSE_BYTES) return { ok: false, error: "UPSTREAM_RESPONSE_TOO_LARGE", message: "Europe PMC response was too large." };
    if (!response.ok) return { ok: false, error: "UPSTREAM_HTTP_ERROR", status: response.status, message: "Literature search is temporarily unavailable." };
    const raw = await response.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_RESPONSE_BYTES) return { ok: false, error: "UPSTREAM_RESPONSE_TOO_LARGE", message: "Europe PMC response was too large." };
    let data;
    try { data = JSON.parse(raw); } catch (_) { return { ok: false, error: "UPSTREAM_INVALID_JSON", message: "Europe PMC returned invalid literature data." }; }
    const items = data && data.resultList && Array.isArray(data.resultList.result) ? data.resultList.result : [];
    const results = items.map((item) => ({
      title: typeof item?.title === "string" ? item.title.trim() : "",
      authors: authorsOf(item),
      year: Number.isInteger(Number(item?.pubYear)) ? Number(item.pubYear) : null,
      journal: typeof item?.journalTitle === "string" ? item.journalTitle.trim() : "",
      doi: typeof item?.doi === "string" ? item.doi.trim() : "",
      pmid: typeof item?.pmid === "string" ? item.pmid.trim() : "",
      source: typeof item?.source === "string" ? item.source.trim() : "",
      url: articleUrl(item)
    })).filter((item) => item.title || item.doi || item.pmid).slice(0, MAX_RESULTS);
    return { ok: true, provider: "europepmc", results };
  } catch (error) {
    if (error?.name === "AbortError") return { ok: false, error: "UPSTREAM_TIMEOUT", message: "Europe PMC literature search timed out." };
    return { ok: false, error: "UPSTREAM_NETWORK_ERROR", message: "Europe PMC literature search could not be reached." };
  } finally {
    clearTimeout(timer);
    epmcInFlight = false;
  }
}
