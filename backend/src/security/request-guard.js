import { API_GATEWAY_CONFIG } from "../config/api-gateway.js";

export function validateGatewayRequest(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, code: "INVALID_REQUEST" };
  }
  if (typeof input.operation !== "string" || input.operation.length > 64) {
    return { ok: false, code: "INVALID_OPERATION" };
  }
  if (!API_GATEWAY_CONFIG.allowedOperations.includes(input.operation)) {
    return { ok: false, code: "OPERATION_NOT_ALLOWED" };
  }
  if ((input.operation === "wiki-search" || input.operation === "book-search") && input.language !== undefined && input.language !== "en" && input.language !== "hi") {
    return { ok: false, code: "UNSUPPORTED_LANGUAGE" };
  }
  if ((input.operation === "wiki-search" || input.operation === "research-search" || input.operation === "literature-search" || input.operation === "book-search") && input.query !== undefined && typeof input.query !== "string") {
    return { ok: false, code: "INVALID_QUERY" };
  }
  return { ok: true };
}
