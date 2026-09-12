# NIL SparkLab Secure API Gateway

This folder is the backend/API security boundary for NIL SparkLab.

## Security rules
- Never put API keys in `index.html`, frontend JavaScript, or GitHub commits.
- Store future provider credentials as Cloudflare Worker Secrets.
- Add only explicit routes; never create an arbitrary URL proxy.
- Validate every request and limit request/response sizes.
- Keep CORS restricted to approved NIL SparkLab origins.
- Add rate limiting before enabling any expensive external provider.

## Current status
Current provider: Wikimedia/Wikipedia search is enabled without an API key. No provider secret is stored in the frontend.

The primary Worker routing lives in `worker/src/index.js`; `worker/src/api-gateway.js` is retained only as a compatibility helper and must not be treated as a separate gateway implementation.

## AI provider secret
Set the server-side secret only:

`wrangler secret put GEMINI_API_KEY`

Optional variables: `GEMINI_MODEL` and `GEMINI_SYSTEM_PROMPT`.
The frontend must never contain the API key.
