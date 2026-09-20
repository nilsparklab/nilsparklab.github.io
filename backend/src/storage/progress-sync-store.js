import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../config/env.js";

const CODE_RE = /^[A-Za-z0-9]{8,16}$/;
const MAX_DATA_BYTES = 32 * 1024;
const TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days, matches the Worker's KV expirationTtl

function dataDir() {
  return path.resolve(process.cwd(), env.SYNC_DATA_DIR);
}

function filePathFor(code) {
  // code is already validated against CODE_RE by callers, so it's safe
  // to use directly as a filename (no path traversal characters possible).
  return path.join(dataDir(), code + ".json");
}

async function ensureDir() {
  await fs.mkdir(dataDir(), { recursive: true });
}

export function isValidSyncCode(code) {
  return typeof code === "string" && CODE_RE.test(code);
}

export async function pushProgress(code, dataString) {
  if (!isValidSyncCode(code)) return { ok: false, error: "INVALID_SYNC_CODE" };
  if (typeof dataString !== "string" || dataString.length === 0) {
    return { ok: false, error: "INVALID_SYNC_DATA" };
  }
  if (Buffer.byteLength(dataString, "utf8") > MAX_DATA_BYTES) {
    return { ok: false, error: "SYNC_DATA_TOO_LARGE" };
  }
  try {
    JSON.parse(dataString);
  } catch (_) {
    return { ok: false, error: "INVALID_SYNC_DATA" };
  }
  const updatedAt = new Date().toISOString();
  await ensureDir();
  await fs.writeFile(filePathFor(code), JSON.stringify({ data: dataString, updatedAt }), "utf8");
  return { ok: true, updatedAt };
}

export async function pullProgress(code) {
  if (!isValidSyncCode(code)) return { ok: false, error: "INVALID_SYNC_CODE" };
  try {
    const raw = await fs.readFile(filePathFor(code), "utf8");
    const parsed = JSON.parse(raw);
    if (Date.now() - Date.parse(parsed.updatedAt) > TTL_MS) {
      await fs.unlink(filePathFor(code)).catch(() => {});
      return { ok: false, error: "SYNC_CODE_NOT_FOUND" };
    }
    return { ok: true, data: parsed.data, updatedAt: parsed.updatedAt };
  } catch (e) {
    if (e && e.code === "ENOENT") return { ok: false, error: "SYNC_CODE_NOT_FOUND" };
    return { ok: false, error: "SYNC_DATA_CORRUPT" };
  }
}
