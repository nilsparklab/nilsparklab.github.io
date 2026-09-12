# NIL SparkLab API Contract v1

Public API prefix: `/api/v1`

- `GET /health` — backend liveness
- `GET /status` — foundation status
- `POST /study` — reserved, disabled until a reviewed provider/service is configured
- `POST /books` — reserved, disabled until a reviewed provider/service is configured
- `POST /dictionary` — reserved, disabled until a reviewed provider/service is configured

## Rules
- No API key or secret is ever sent by the browser.
- Browser requests use the single `NIL_API` client.
- Unknown routes are rejected.
- Reserved routes fail closed with `503 SERVICE_NOT_CONFIGURED`.
