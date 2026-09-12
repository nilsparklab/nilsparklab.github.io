function normalizeOrigin(value) {
  return (value || '').trim();
}
export function assertOrigin(origin, allowedOrigin, allowNoOrigin = false) {
  if (!origin) {
    if (allowNoOrigin) return true;
    throw Object.assign(new Error('Origin is not allowed.'), { status: 403, code: 'ORIGIN_NOT_ALLOWED' });
  }
  const allowed = normalizeOrigin(allowedOrigin);
  if (!allowed || origin !== allowed) {
    throw Object.assign(new Error('Origin is not allowed.'), { status: 403, code: 'ORIGIN_NOT_ALLOWED' });
  }
  return true;
}
export function corsHeaders(origin, allowedOrigin) {
  const headers = {
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '600'
  };
  if (origin && normalizeOrigin(allowedOrigin) && origin === allowedOrigin) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}
