const DEFAULT_MODEL = 'gemini-2.5-flash';
const MAX_INPUT_CHARS = 12000;
const MAX_OUTPUT_TOKENS = 1200;

function cleanText(value, max) {
  const s = typeof value === 'string' ? value.trim() : '';
  return s.length > max ? s.slice(0, max) : s;
}

function safeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history.slice(-12).map(item => {
    const role = item && item.role === 'model' ? 'model' : 'user';
    const text = cleanText(item && item.text, MAX_INPUT_CHARS);
    return text ? { role, parts: [{ text }] } : null;
  }).filter(Boolean);
}

export async function generateGemini(body, env) {
  const apiKey = String(env.GEMINI_API_KEY || '').trim();
  if (!apiKey) return { ok: false, error: 'PROVIDER_NOT_CONFIGURED', message: 'AI provider is not configured.' };
  const message = cleanText(body && body.message, MAX_INPUT_CHARS);
  if (!message) return { ok: false, error: 'INVALID_QUERY', message: 'Message is required.' };
  const model = cleanText(env.GEMINI_MODEL || DEFAULT_MODEL, 80).replace(/[^a-zA-Z0-9._-]/g, '');
  const systemInstruction = cleanText(env.GEMINI_SYSTEM_PROMPT || 'You are NIL SparkLab Assistant, an electrical engineering educational assistant. Answer accurately, clearly, and safely. Prefer concise explanations with formulas and practical examples when useful. Do not claim live/current facts without sources. For electrical safety, recommend qualified supervision for hazardous mains work.', 3000);
  const contents = [...safeHistory(body && body.history), { role: 'user', parts: [{ text: message }] }];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'accept': 'application/json' }, body: JSON.stringify({ systemInstruction: { parts: [{ text: systemInstruction }] }, contents, generationConfig: { temperature: 0.4, maxOutputTokens: MAX_OUTPUT_TOKENS } }), signal: controller.signal });
    const raw = await response.text();
    if (new TextEncoder().encode(raw).byteLength > 512 * 1024) return { ok: false, error: 'UPSTREAM_RESPONSE_TOO_LARGE', message: 'AI response was too large.' };
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch (_) { return { ok: false, error: 'UPSTREAM_INVALID_JSON', message: 'AI provider returned invalid data.' }; }
    if (!response.ok) {
      if (response.status === 429) return { ok: false, error: 'UPSTREAM_BUSY', message: 'AI provider rate limit reached. Please try again shortly.' };
      if (response.status === 401 || response.status === 403) return { ok: false, error: 'PROVIDER_AUTH_ERROR', message: 'AI provider authentication failed.' };
      return { ok: false, error: 'UPSTREAM_HTTP_ERROR', message: data?.error?.message || 'AI provider request failed.' };
    }
    const text = (Array.isArray(data?.candidates) ? data.candidates : []).flatMap(c => Array.isArray(c?.content?.parts) ? c.content.parts : []).map(p => typeof p?.text === 'string' ? p.text : '').join('').trim();
    if (!text) return { ok: false, error: 'EMPTY_RESPONSE', message: 'AI provider returned no answer.' };
    return { ok: true, provider: 'gemini', model, answer: text.slice(0, 20000) };
  } catch (e) {
    if (e?.name === 'AbortError') return { ok: false, error: 'UPSTREAM_TIMEOUT', message: 'AI provider timed out.' };
    return { ok: false, error: 'UPSTREAM_NETWORK_ERROR', message: 'AI provider could not be reached.' };
  } finally { clearTimeout(timer); }
}
