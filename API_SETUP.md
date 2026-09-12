# NIL SparkLab — Final API Setup

## Easiest way — one script
From the `worker/` folder, run:

```bash
cd worker
chmod +x setup-and-deploy.sh
./setup-and-deploy.sh
```

This automatically logs you into Cloudflare, creates the KV namespace, asks
you once for your Gemini API key, deploys the Worker, and writes the
deployed URL into `index.html` for you. Get a free Gemini key from
https://aistudio.google.com/apikey when the script asks for it.

## Manual way (if you prefer step-by-step)
The codebase is wired so the AI key is server-side only.

### Cloudflare Worker
1. Deploy `worker/`.
2. Set the secret:
   `wrangler secret put GEMINI_API_KEY`
3. Optional Worker variables are `GEMINI_MODEL` (default `gemini-2.5-flash`) and `GEMINI_SYSTEM_PROMPT`.
4. Set the public Worker URL once as `window.NIL_SPARKLAB_API_BASE` for the hosted frontend. This is a public URL, not a secret.

## Security
- Never put `GEMINI_API_KEY` in `index.html`, `js/`, GitHub Pages, or client-side localStorage.
- The frontend sends requests only to `/api/gateway`.
- AI provider authentication happens only inside the Worker/backend.
- The gateway keeps request/response size limits, CORS, rate limiting, timeouts and upstream error mapping.

## Free use
Google's current Gemini API documentation lists a Free Tier for selected models, including Gemini 2.5 Flash. Free-tier limits are account/model dependent and can change. See Google's current pricing/rate-limit documentation before production use.
