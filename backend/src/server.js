import http from "node:http";
import { env } from "./config/env.js";
import { json, requestId } from "./utils/http.js";
import { readJsonBody } from "./utils/body.js";
import { applySecurityHeaders } from "./security/headers.js";
import { applyCors } from "./security/cors.js";
import { allowRequest } from "./security/rate-limit.js";
import { route } from "./routes/index.js";
import { toErrorResponse } from "./security/errors.js";
import { handleGatewayOperation } from "./gateway/gateway-service.js";

const MAX_URL = 2048;

function gatewayErrorStatus(code) {
  if (code === "PROVIDER_NOT_CONFIGURED") return 503;
  if (code === "UPSTREAM_TIMEOUT") return 504;
  if (code === "UPSTREAM_HTTP_ERROR" || code === "UPSTREAM_NETWORK_ERROR") return 502;
  if (code === "UPSTREAM_RESPONSE_TOO_LARGE" || code === "UPSTREAM_INVALID_JSON") return 502;
  if (code === "UPSTREAM_BUSY") return 429;
  return 400;
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const id = requestId();
    res.setHeader("X-Request-Id", id);
    applySecurityHeaders(res, env.NODE_ENV === "production");

    if ((req.url || "").length > MAX_URL) {
      return json(res, 414, { ok: false, error: "URL_TOO_LONG", requestId: id });
    }
    if (!applyCors(req, res)) {
      return json(res, 403, { ok: false, error: "ORIGIN_NOT_ALLOWED", requestId: id });
    }
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      return res.end();
    }
    if (!allowRequest(req)) {
      return json(res, 429, { ok: false, error: "RATE_LIMITED", requestId: id });
    }

    const url = new URL(req.url || "/", "http://localhost");

    try {
      if (url.pathname === "/api/gateway") {
        if (req.method !== "POST") {
          res.setHeader("Allow", "POST, OPTIONS");
          return json(res, 405, { ok: false, error: "METHOD_NOT_ALLOWED", requestId: id });
        }
        const body = await readJsonBody(req, 16 * 1024);
        const result = await handleGatewayOperation(body);
        const status = result.ok ? 200 : gatewayErrorStatus(result.error);
        return json(res, status, { ...result, requestId: id });
      }

      const out = route(req);
      return json(res, out.status, { ...out.body, requestId: id }, out.headers || {});
    } catch (err) {
      const out = toErrorResponse(err);
      return json(res, out.status, { ...out.body, requestId: id });
    }
  });
}

export function startServer(port = env.PORT) {
  const server = createServer();
  server.listen(port, () => console.log(`NIL backend listening on ${port}`));
  return server;
}

if (process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url) {
  startServer();
}
