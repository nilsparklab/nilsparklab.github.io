export async function parseJson(request, maxBytes) {
  const length = Number(request.headers.get('content-length') || 0);
  if (length && length > maxBytes) { const e = new Error('Request is too large.'); e.status = 413; e.code = 'PAYLOAD_TOO_LARGE'; throw e; }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) { const e = new Error('Request is too large.'); e.status = 413; e.code = 'PAYLOAD_TOO_LARGE'; throw e; }
  try { return JSON.parse(text || '{}'); }
  catch (_) { const e = new Error('Invalid JSON.'); e.status = 400; e.code = 'INVALID_JSON'; throw e; }
}
export function validateQuery(value) {
  if (typeof value !== 'string') { const e = new Error('Query must be text.'); e.status = 400; e.code = 'INVALID_INPUT'; throw e; }
  const clean = value.trim();
  if (!clean || clean.length > 200 || /[\u0000-\u001F\u007F]/.test(clean)) { const e = new Error('Invalid query.'); e.status = 400; e.code = 'INVALID_INPUT'; throw e; }
  return clean;
}
