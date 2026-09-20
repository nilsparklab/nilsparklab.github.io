import { validateGatewayRequest } from "../security/request-guard.js";
import { callProvider } from "../providers/provider-adapter.js";
import { searchWikipedia } from "../providers/wikimedia-adapter.js";
import { searchCrossref } from "../providers/crossref-adapter.js";
import { searchEuropePMC } from "../providers/europepmc-adapter.js";
import { searchOpenLibrary } from "../providers/openlibrary-adapter.js";
import { generateGemini } from "../providers/gemini-adapter.js";
import { allowAiRequest } from "../security/ai-rate-limit.js";
import { pushProgress, pullProgress } from "../storage/progress-sync-store.js";
import { pushStudentStatus, pullRoom } from "../storage/classroom-store.js";
import { publishCircuit, listCircuits } from "../storage/circuit-gallery-store.js";

export async function handleGatewayOperation(body, req) {
  const check = validateGatewayRequest(body);
  if (!check.ok) return { ok: false, error: check.code };

  if (body.operation === "health") {
    return { ok: true, service: "api-gateway", status: "ready" };
  }
  if (body.operation === "provider-status") {
    return callProvider();
  }

  if (body.operation === "wiki-search") {
    return searchWikipedia(body.query, { limit: body.limit, language: body.language });
  }
  if (body.operation === "research-search") {
    return searchCrossref(body.query, { limit: body.limit });
  }
  if (body.operation === "literature-search") {
    return searchEuropePMC(body.query, { limit: body.limit });
  }
  if (body.operation === "book-search") {
    return searchOpenLibrary(body.query, { limit: body.limit, language: body.language });
  }
  if (body.operation === "ai-chat") {
    if (!allowAiRequest(req)) {
      return { ok: false, error: "AI_RATE_LIMITED" };
    }
    return generateGemini(body);
  }
  if (body.operation === "sync-push") {
    return pushProgress(body.code, body.data);
  }
  if (body.operation === "sync-pull") {
    return pullProgress(body.code);
  }
  if (body.operation === "class-push") {
    return pushStudentStatus(body.room, body.studentId, body.studentName, body.status);
  }
  if (body.operation === "class-pull") {
    return pullRoom(body.room);
  }
  if (body.operation === "gallery-publish") {
    return publishCircuit(body.title, body.authorName, body.code);
  }
  if (body.operation === "gallery-list") {
    return listCircuits();
  }
  return { ok: false, error: "OPERATION_NOT_IMPLEMENTED" };
}
