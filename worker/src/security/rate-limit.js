const WINDOW_MS = 60_000;
const LIMIT = 60;
const buckets = new Map();

function clientKey(request) {
  return request.headers.get("CF-Connecting-IP")
    || request.headers.get("X-Forwarded-For")
    || "unknown";
}

export function allowRequest(request) {
  const key = clientKey(request);
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
