import { keyFor } from './rate-limit.js';

// Stricter limits for the AI (Gemini) operation only. General traffic keeps
// using rate-limit.js's 60/min gate; this adds a second, tighter gate on
// top of it for `ai-chat` requests specifically.
const MINUTE_MS = 60_000;
const MINUTE_LIMIT = 10;
const BURST_MS = 5_000;
const BURST_LIMIT = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_LIMIT = 200;
const MAX_ENTRIES = 10_000;

const state = new Map();

export function allowAiRequest(req) {
  const key = keyFor(req);
  const now = Date.now();
  let entry = state.get(key);
  if (!entry) {
    entry = { minuteStart: now, minuteCount: 0, burstTimes: [], dayStart: now, dayCount: 0 };
    state.set(key, entry);
    if (state.size > MAX_ENTRIES) state.delete(state.keys().next().value);
  }

  entry.burstTimes = entry.burstTimes.filter((t) => now - t < BURST_MS);
  if (entry.burstTimes.length >= BURST_LIMIT) return false;

  if (now - entry.minuteStart >= MINUTE_MS) {
    entry.minuteStart = now;
    entry.minuteCount = 0;
  }
  if (entry.minuteCount >= MINUTE_LIMIT) return false;

  if (now - entry.dayStart >= DAY_MS) {
    entry.dayStart = now;
    entry.dayCount = 0;
  }
  if (entry.dayCount >= DAY_LIMIT) return false;

  entry.burstTimes.push(now);
  entry.minuteCount += 1;
  entry.dayCount += 1;
  return true;
}

export function resetAiRateLimits() {
  state.clear();
}
