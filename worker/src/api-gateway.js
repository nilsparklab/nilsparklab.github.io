// Compatibility helper retained for deployments that import this module directly.
// The primary Worker entry point is worker/src/index.js, which contains the
// validated Wikimedia/Crossref routes and CORS/rate-limit enforcement.
export async function handleGatewayRequest(request) {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "METHOD_NOT_ALLOWED" }), {
      status: 405,
      headers: { "content-type": "application/json" }
    });
  }
  return new Response(JSON.stringify({
    ok: false,
    error: "ROUTE_MOVED",
    message: "Use the Worker fetch handler for /api/gateway."
  }), {
    status: 404,
    headers: { "content-type": "application/json" }
  });
}
