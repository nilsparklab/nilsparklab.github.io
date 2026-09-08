export function json(payload, status = 200, extra = new Headers()) {
  const headers = new Headers(extra);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  return new Response(JSON.stringify(payload), { status, headers });
}
export function error(status, code, message, extra = new Headers()) {
  return json({ ok: false, error: { code, message } }, status, extra);
}
