## v11.5 — Builder probes, Multimeter card tools, home cleanup
- Builder: multimeter probes now start together at the bottom-left of the
  canvas. Fixed them jumping to the top-left / drifting apart (positions were
  measured while the Builder was hidden, and mixed top/bottom anchoring). They
  reset to the default spot when you leave the Builder or clear the canvas;
  a plain tap no longer saves a position.
- Multimeter card: the "More Tools" dropdown now lists **Multimeter** (default)
  and swaps the display in place for **Waveform** (compact inline graph of the
  circuit's source) or **V-I Curve** (four-quadrant characteristic of a
  resistor / LED / diode / zener, tap to switch component, operating point
  from the last simulation). Volts/Amps/Beep show only for the Multimeter.
  Other tools (Solver, Practical Lab, ...) still open as popups.
- Home: removed the "Learning Lab" section (tools stay reachable from the
  Builder's More Tools menu and the Assistant).
- Removed the floating Progress Sync button (sync code/modules are untouched).
- SEO: added `alternateName` to the homepage WebSite structured data.
- Builder: fixed straight wires disappearing. A wire whose two ends share the
  same x (vertical) or same y (horizontal) has a zero-size bounding box, which
  made its glow filter render nothing. Each wire now has its own glow filter
  with an explicit region.
- In-app updates: the update check now also runs when the app returns to the
  foreground and every 30 minutes. In the installed app / live site the banner
  has an **Update now** button (fetches the new service worker, waits for it,
  reloads). Old downloaded copies keep the "Update" link.
- CSP: `connect-src` now allows https://nilsparklab.github.io so a downloaded
  copy (file:// / content://) can actually reach version.json — before, the
  browser blocked that request and the update banner could never appear there.
- sw.js: precache is re-downloaded bypassing the browser HTTP cache on every
  update, and version.json is never served from the cache.
- Version bumped to 11.5 (index.html, version.json, app-config.js, sw.js cache).

## v97–v104 — Diagram workflow, safe public search, builder handoff hardening
_Note: these entries were reconstructed from in-code version markers/comments
in `index.html`; no changelog entries existed for this range before now._
- Added a no-credential, sanitized "public search relay" path for the
  Assistant (query envelope, URL/result sanitization, zero-payment guard) —
  no API keys, no paid fallback, output limited to title/URL/snippet.
- Added a safety guard that intercepts "Wi-Fi jammer" style requests and
  routes them to a non-operational, educational-only interference diagram
  instead of ever generating an actionable jammer circuit.
- Added a circuit diagram library/workflow modal (built-in + custom
  uploaded diagrams) with view/insert actions.
- Added a Phase 1 regression self-test harness (`NilSparkLabPhase1Regression`).
- Added `exact-builder-handoff.js` / `builder-handoff-verify.js` compat
  modules to harden the Builder state handoff path.
- Added a single normalized circuit verification state (topology-only
  pre-check plus solved-telemetry priority) and related UI polish.
- Perf fix: skip rendering work for off-screen component cards.
- Fixed a regression where Builder-card delete gestures worked but the
  confirmation popup had been accidentally dropped; restored the
  confirmation dialog with a fail-closed fallback if the dialog module is
  unavailable.


## v96.4 — Smart Assistant compact tools menu
- Replaced the five top-level Web/Research/Literature/Books controls with a single **Tools** menu.
- Kept the existing tool button IDs and handlers, so search functionality remains connected.
- Removed duplicate search quick-action chips from the visible Assistant chip set.
- Cleaned the invalid `</input>` closing tag and added mobile-friendly tool layout rules.


## v96.1 — Bottom Blank Area Leak Fix
- Fixed broken Lab Report print handler that embedded raw `<script>`/CSS markup inside `document.write()`.
- Restored valid JavaScript string handling and HTML escaping for report printing.
- Prevents internal JavaScript source from rendering as visible text at the bottom of the page.
- Backend test suite remains green (10/10).

## v95 — Final Assistant Integration Audit Fix
- Loaded the Fault Finder module in the live script chain.
- Restored Fault Finder, Practical/Viva and Agentic Task Mode quick-action routing.
- Corrected provider tool-router method names to match the API client.
- Connected tool results to centralized citation normalization.
- Added final integration regression test.

## v93 — Advanced Agentic Task Mode
- Added bounded multi-step task planner/executor.
- Added approval-preserving execution across existing tools.
- Added Task Mode UI plan preview and cancellation.
- Added regression tests for allowlisting and approval gates.

## v91 — Practical + Viva Assistant
- Added experiment guides, observation/result sections, precautions and viva Q&A.
- Added Practical + Viva quick action.
- Added controlled `practical_viva` tool.

## v90 — Fault Finder Audit Fix
- Added resilient Fault Finder action bridge.
- Added local source-to-load graph reachability fallback for disconnected-load detection.
- Added regression coverage for incomplete load return paths.

## v89 — Fault Finder Copilot
- Added read-only evidence-ranked fault diagnosis.
- Added symptom-aware motor/LED/high-current checks and safety guidance.
- Added controlled `fault_finder` tool.
- Added Assistant quick action for Fault Finder.

## v88 — Assistant Sources & Citations
- Added centralized source normalization and citation rendering.
- Added strict HTTPS/host allowlisting and duplicate-source filtering.
- Added citation regression tests.

## v87 — Controlled Tool Calling
- Added a centralized allowlisted Assistant tool router.
- Added approval gating for external search providers.
- Added bounded calculator and read-only circuit analysis tools.
- Added regression tests for tool authorization and safe input handling.

## v86 — Assistant Integration Audit Fix
- Fixed Circuit-Aware Assistant to read the authoritative NilSparkLabBuilderState bridge.
- Connected Context Memory to live Builder/simulation state and Assistant conversation flow.
- Added regression tests for real bridge integration.

## v83 — Smart Assistant Intent Detection
- Added deterministic intent detection for general, search, troubleshooting, calculation, component, circuit, practical, quiz/viva, and concept queries.
- Added visible intent/confidence badge to the Assistant UI.
- Added intent-aware troubleshooting precedence using current circuit context.
- Preserved explicit external-search consent; intent detection never calls external providers directly.
- Added regression coverage for intent detection and routing boundaries.

## v82 — Deep Line-by-Line Audit + Consistency Fixes
- Normalized backend provider User-Agent identifiers to the current audited release.
- Updated stale active regression expectations that still referenced older release identifiers.
- Added a deep audit report covering frontend, Worker, backend, providers, security, contracts, production configuration, and E2E tooling.

## v81 — Deep Audit Recheck
- Normalized all backend provider User-Agent identifiers to the current audited release version.
- Updated stale regression expectations so the full suite validates the current release instead of older provider versions.
- No runtime behavior change to the public E2E harness; this release is a consistency/regression-quality fix.

# NIL SparkLab v76 — Wikimedia Search UX Improvements

## Changes
- Improved Smart Assistant Web Search result rendering with deduplication and malformed-item filtering.
- Added compact result count and a clearer no-result state.
- Added explicit **Open Wikipedia ↗** affordance to each valid article result.
- Disables the Web Search button while a request is pending.
- Prevents stale/older search requests from overwriting a newer search result.
- Added specific timeout and network-error messaging.
- Centralized HTML/attribute escaping for search-result rendering.
- Preserved the existing Gateway → Wikimedia security boundary; no API keys were added to the frontend.

## Validation
- API gateway/Smart Assistant tests: 10/10 PASS
- Project regression tests: 7/7 PASS
- JavaScript inline-block syntax sweep: 157 JavaScript blocks, 0 syntax errors
- Duplicate runtime DOM IDs: known quiz template IDs are reused only after the completion view replaces the active quiz content; no simultaneous duplicate static controls were introduced.

## Previous release
See the v75 deep-audit fixes below for the multilingual Gateway/Wikimedia security baseline.

# NIL SparkLab v75 — Wikimedia Multilingual Search + Deep Audit Fixes

## Changes
- Fixed the Smart Assistant **🌐 Web Search** quick-action routing bug: the authoritative chip router now delegates to the real Web button instead of falling through to the local Assistant path.
- Added **English/Hindi Wikipedia routing** with a strict allowlist (`en`, `hi`); no arbitrary upstream domains are accepted.
- Wikimedia provider now returns a server-constructed, allowlisted article URL so the frontend does not reconstruct external destinations from raw provider keys.
- Frontend passes the current Assistant language (`en`/`hi`) to the gateway.
- Gateway contract bumped to **1.4.0** with `language` request field and bilingual Wikimedia upstreams.
- Added regression coverage for Web Search chip routing and Hindi provider URL generation.

## Validation
- API gateway/frontend/assistant tests: PASS
- Backend tests: 10/10 PASS
- Project regression tests: PASS
- JavaScript syntax checks: PASS
- Worker syntax check: PASS
- Secret/API-key scan of source: no exposed provider credentials detected

## Security
- No frontend provider API key added.
- Arbitrary URL proxying remains disabled.
- Wikimedia language selection is allowlisted to `en` and `hi` only.


## v75 deep audit fixes
- Updated Wikimedia User-Agent identifier to v75.
- Added backend and Worker upstream response-size limits (512 KiB).
- Added safe handling for oversized and invalid-JSON Wikimedia responses.
- Added regression tests for both upstream failure modes.
### v77 — Production Deployment Configuration
- Added explicit Cloudflare Worker production Wrangler config.
- Added production Node environment template with enforced HTTPS origin.
- Added production deployment/acceptance checklist.
- Added HSTS to production backend responses and Worker JSON responses.
- Updated Wikimedia User-Agent to v77.
- Added production configuration regression tests.

## v78 — Additional Free Provider: Crossref
- Added Crossref provider adapter and validated gateway operation.
- Added Worker route with timeout, size cap, safe normalization, and public-pool access.
- Added Smart Assistant Research Search UI.
- Added provider-status reporting for Wikimedia + Crossref.
- Added backend/Worker/UI regression tests and documentation.

## v79 — Europe PMC Free Literature Provider
- Added Europe PMC metadata search through the server-side Gateway.
- No provider API key exposed or required.


## v80 — Open Library Free Book Provider
- Added Open Library book search through the server-side Gateway.
- Added Smart Assistant Book Search UI and quick-action routing.
- Added bounded fields/results, 8-second timeout, 512 KiB response cap, one-request concurrency guard, and allowlisted Open Library work URLs.
- No API key added to frontend.
- Provider and Worker both enforce the caller result limit even if an upstream ignores the requested limit.

## v80 Final Validation
- API gateway/UX tests: 22/22 PASS.
- Backend tests: 10/10 PASS.
- Project regression tests: 7/7 PASS.
- JavaScript/MJS syntax sweep: 0 errors.
- API gateway contract JSON validation: PASS.
- Secret-like source scan: no exposed provider credential patterns detected.
- Fixed provider-side result-limit enforcement so the backend/Worker cannot return more than the requested bounded result count even if an upstream ignores the requested limit.

## v81 — Real Deployed E2E Harness
- Updated provider User-Agent identifiers to v81.
- Added `tools/e2e-smoke.mjs` for real deployed Worker smoke testing.
- Added fail-closed HTTPS and production-Origin checks to the smoke harness.
- Added live checks for status, health, Wikimedia, Crossref, Europe PMC, and Open Library.
- Added `REAL_DEPLOYED_E2E_v81.md` explaining the required live deployment validation.


## v85
- Added read-only Circuit-Aware Assistant using live Builder state.
- Added connectivity/source/load/terminal structure checks and last-simulation summary.
- Added Analyze My Circuit quick action.
- Synced circuit/simulation summaries into Assistant Context Memory on analysis.
- Added circuit-aware regression coverage.

### v96.2 — Install App button sizing
- Slightly reduced the PWA Install App button padding/font size.
- Added `whitespace-nowrap` so “Install App” stays on one line on mobile where space permits.

## v96.3 — API Contract Recheck
- Removed legacy client methods for `/api/v1/study`, `/api/v1/books`, `/api/v1/dictionary`, and `/api/v1/search` because those routes are intentionally not public contracts.
- Client API surface now matches the allowlisted Worker gateway routes exactly.
- Re-verified the PWA install button sizing change and existing backend/security tests.
