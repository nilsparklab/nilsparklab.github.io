import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { env } from "../config/env.js";

const CODE_RE = /^[A-Za-z0-9_-]{1,8000}$/;

function galleryDataDir() {
  return path.resolve(process.cwd(), env.SYNC_DATA_DIR, "..", "gallery");
}

export async function publishCircuit(title, authorName, code) {
  const cleanTitle = String(title || "").trim().slice(0, 60);
  if (!cleanTitle) return { ok: false, error: "INVALID_TITLE" };
  const cleanAuthor = String(authorName || "Anonymous").trim().slice(0, 40) || "Anonymous";
  if (typeof code !== "string" || !CODE_RE.test(code)) {
    return { ok: false, error: "INVALID_CODE" };
  }
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await fs.mkdir(galleryDataDir(), { recursive: true });
  // Filename starts with an inverted timestamp so a plain alphabetical
  // directory listing already comes back newest-first.
  const sortKey = String(Number.MAX_SAFE_INTEGER - Date.now()).padStart(16, "0");
  const fileName = sortKey + "_" + id + ".json";
  await fs.writeFile(
    path.join(galleryDataDir(), fileName),
    JSON.stringify({ id, title: cleanTitle, authorName: cleanAuthor, code, createdAt }),
    "utf8"
  );
  return { ok: true, id, createdAt };
}

export async function listCircuits() {
  let files;
  try {
    files = await fs.readdir(galleryDataDir());
  } catch (e) {
    if (e && e.code === "ENOENT") return { ok: true, circuits: [] };
    return { ok: false, error: "GALLERY_DATA_CORRUPT" };
  }
  files.sort(); // filenames are sort-key-prefixed, so this is newest-first
  const circuits = [];
  for (const file of files.slice(0, 50)) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(galleryDataDir(), file), "utf8");
      circuits.push(JSON.parse(raw));
    } catch (_) { /* skip a corrupt entry rather than fail the whole list */ }
  }
  return { ok: true, circuits };
}
