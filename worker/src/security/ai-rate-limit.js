import { clientKey } from './rate-limit.js';

// Stricter limits for the AI (Gemini) operation only. General traffic keeps
// using rate-limit.js's 60/min gate; this adds tighter gates on top of it
// for `ai-chat` requests specifically:
//
// - Per-minute cap: Cloudflare's account-level Rate Limiting binding
//   (AI_RATE_LIMITER) when available. Distributed across all Worker
//   instances.
// - Daily quota: Workers KV (AI_DAILY_QUOTA) when available. Distributed,
//   but eventually consistent — under concurrent bursts right at the edge
//   of the limit, a few extra requests can slip through before the count
//   catches up. Good enough for abuse prevention, not a hard guarantee.
// - Burst (sub-10s) window: always in-memory/per-instance. Cloudflare's
//   Rate Limiting binding has a 10s minimum period, so a 5s burst window
//   can't be expressed there even if we wanted to.
//
// If a binding isn't configured, each check falls back to an in-memory
// per-instance equivalent so the app still works (just without the
// cross-instance guarantee) rather than breaking.
const FALLBACK_MINUTE_MS = 60_000;
const FALLBACK_MINUTE_LIMIT = 10;
const BURST_MS = 5_000;
const BURST_LIMIT = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_LIMIT = 200;
const MAX_ENTRIES = 10_000;

const state = new Map();

function getEntry(key, now) {
  let entry = state.get(key);
  if (!entry) {
    entry = { minuteStart: now, minuteCount: 0, burstTimes: [], dayStart: now, dayCount: 0 };
    state.set(key, entry);
    if (state.size > MAX_ENTRIES) state.delete(state.keys().next().value);
  }
  return entry;
}

function todayKey(key) {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  return `ai-daily:${key}:${today}`;
}

async function underDailyQuota(env, key, entry, now) {
  if (env?.AI_DAILY_QUOTA) {
    const kvKey = todayKey(key);
    const current = await env.AI_DAILY_QUOTA.get(kvKey);
    const count = current ? parseInt(current, 10) || 0 : 0;
    if (count >= DAY_LIMIT) return { ok: false, commit: async () => {} };
    return {
      ok: true,
      commit: () => env.AI_DAILY_QUOTA.put(kvKey, String(count + 1), { expirationTtl: 172_800 }),
    };
  }

  // Fallback: in-memory, per-instance daily counter.
  if (now - entry.dayStart >= DAY_MS) {
    entry.dayStart = now;
    entry.dayCount = 0;
  }
  if (entry.dayCount >= DAY_LIMIT) return { ok: false, commit: async () => {} };
  return { ok: true, commit: () => { entry.dayCount += 1; } };
}

export async function allowAiRequest(request, env) {
  const key = clientKey(request);
  const now = Date.now();
  const entry = getEntry(key, now);

  entry.burstTimes = entry.burstTimes.filter((t) => now - t < BURST_MS);
  if (entry.burstTimes.length >= BURST_LIMIT) return false;

  const daily = await underDailyQuota(env, key, entry, now);
  if (!daily.ok) return false;

  let underMinuteCap;
  if (env?.AI_RATE_LIMITER) {
    const { success } = await env.AI_RATE_LIMITER.limit({ key });
    underMinuteCap = success;
  } else {
    if (now - entry.minuteStart >= FALLBACK_MINUTE_MS) {
      entry.minuteStart = now;
      entry.minuteCount = 0;
    }
    underMinuteCap = entry.minuteCount < FALLBACK_MINUTE_LIMIT;
    entry.minuteCount += 1;
  }
  if (!underMinuteCap) return false;

  entry.burstTimes.push(now);
  await daily.commit();
  return true;
}
