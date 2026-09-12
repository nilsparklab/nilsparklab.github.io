const WINDOW_MS = 60_000;
const LIMIT = 60;
const buckets = new Map();

export function clientKey(request) {
  return request.headers.get("CF-Connecting-IP")
    || request.headers.get("X-Forwarded-For")
    || "unknown";
}

export async function allowRequest(request, env) {
  const key = clientKey(request);

  // Prefer Cloudflare's account-level Rate Limiting binding: it's a shared
  // service, not per-isolate memory, so it actually holds across the many
  // globally distributed Worker instances (fixes the bypass where an
  // attacker gets routed to different instances, each with its own count).
  if (env?.GENERAL_RATE_LIMITER) {
    const { success } = await env.GENERAL_RATE_LIMITER.limit({ key });
    return success;
  }

  // Fallback: per-instance in-memory limiter. Only used if the binding
  // isn't configured yet (e.g. namespace not provisioned in the Cloudflare
  // dashboard). Does not protect against cross-instance bypass.
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || now - bucket.start >= WINDOW_MS) {
    bucket = { start: now, count: 0 };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  if (buckets.size > 10_000) buckets.delete(buckets.keys().next().value);
  return bucket.count <= LIMIT;
}
