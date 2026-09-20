import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../config/env.js";

const ROOM_RE = /^[A-Za-z0-9]{3,12}$/;
const STUDENT_ID_RE = /^[A-Za-z0-9]{8,24}$/;
const MAX_STATUS_BYTES = 4 * 1024;
const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours — one classroom session, matches the Worker's expirationTtl

function classroomDataDir() {
  return path.resolve(process.cwd(), env.SYNC_DATA_DIR, "..", "classroom");
}

function roomDir(room) {
  return path.join(classroomDataDir(), room);
}

function studentFilePath(room, studentId) {
  return path.join(roomDir(room), studentId + ".json");
}

export function isValidRoom(room) {
  return typeof room === "string" && ROOM_RE.test(room);
}

export async function pushStudentStatus(room, studentId, studentName, statusString) {
  if (!isValidRoom(room)) return { ok: false, error: "INVALID_ROOM_CODE" };
  if (typeof studentId !== "string" || !STUDENT_ID_RE.test(studentId)) {
    return { ok: false, error: "INVALID_STUDENT_ID" };
  }
  if (typeof statusString !== "string" || statusString.length === 0) {
    return { ok: false, error: "INVALID_STATUS" };
  }
  if (Buffer.byteLength(statusString, "utf8") > MAX_STATUS_BYTES) {
    return { ok: false, error: "STATUS_TOO_LARGE" };
  }
  try {
    JSON.parse(statusString);
  } catch (_) {
    return { ok: false, error: "INVALID_STATUS" };
  }
  const upperRoom = room.toUpperCase();
  const name = String(studentName || "Student").slice(0, 40);
  const updatedAt = new Date().toISOString();
  await fs.mkdir(roomDir(upperRoom), { recursive: true });
  await fs.writeFile(
    studentFilePath(upperRoom, studentId),
    JSON.stringify({ studentName: name, status: statusString, updatedAt }),
    "utf8"
  );
  return { ok: true, updatedAt };
}

export async function pullRoom(room) {
  if (!isValidRoom(room)) return { ok: false, error: "INVALID_ROOM_CODE" };
  const upperRoom = room.toUpperCase();
  let files;
  try {
    files = await fs.readdir(roomDir(upperRoom));
  } catch (e) {
    if (e && e.code === "ENOENT") return { ok: true, room: upperRoom, students: [] };
    return { ok: false, error: "CLASSROOM_DATA_CORRUPT" };
  }
  const students = [];
  const now = Date.now();
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const studentId = file.slice(0, -5);
    try {
      const raw = await fs.readFile(path.join(roomDir(upperRoom), file), "utf8");
      const parsed = JSON.parse(raw);
      if (now - Date.parse(parsed.updatedAt) > TTL_MS) {
        await fs.unlink(path.join(roomDir(upperRoom), file)).catch(() => {});
        continue;
      }
      students.push({ studentId, studentName: parsed.studentName, status: parsed.status, updatedAt: parsed.updatedAt });
    } catch (_) { /* skip a corrupt entry rather than fail the whole roster */ }
  }
  return { ok: true, room: upperRoom, students: students.slice(0, 60) };
}
