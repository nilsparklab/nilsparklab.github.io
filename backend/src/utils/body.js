import { env } from "../config/env.js";

export function readJsonBody(req, maxBytes) {
  const limit = Math.min(maxBytes, env.MAX_BODY_BYTES);
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    let settled = false;

    const fail = (status, code, message) => {
      if (settled) return;
      settled = true;
      reject(Object.assign(new Error(message), { status, code }));
      req.destroy();
    };

    req.on("data", chunk => {
      total += chunk.length;
      if (total > limit) fail(413, "PAYLOAD_TOO_LARGE", "Request is too large.");
      else chunks.push(chunk);
    });
    req.on("end", () => {
      if (settled) return;
      settled = true;
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve(JSON.parse(text || "{}"));
      } catch {
        reject(Object.assign(new Error("Invalid JSON."), { status: 400, code: "INVALID_JSON" }));
      }
    });
    req.on("error", err => {
      if (!settled) reject(err);
    });
  });
}
