# Enterprise Readiness Notes

These apps are still local-first single-folder tools, but the server runtime now
uses a shared production posture inspired by the Slayah85 FastAPI app:

- environment-driven config with production validation
- optional Basic auth for every non-health endpoint
- host allowlist enforcement
- request IDs on every response
- security headers and no-store caching
- `/healthz` and `/api/healthz` for unauthenticated liveness checks
- `/metrics` and `/api/metrics` for Prometheus-style runtime counters
- request body size limits before API work starts
- local state, seed data, certificates, caches, and histories ignored by default

## Production env

Each app loads `.env` from its own folder. Copy `.env.example` into the app
folder, update `PORT`, `ALLOWED_HOSTS`, and secrets, then run the app.

In `APP_ENV=production`, startup fails unless:

- `APP_BASIC_AUTH_USERNAME` is set
- `APP_BASIC_AUTH_PASSWORD` is set and at least 16 characters
- `ALLOWED_HOSTS` is explicit and does not include `*`

## App ports

- AI Roadmap: `5173`
- Ledger: `5174`
- Debth: `5175`
- Career: `5176`
- VideoDownloader: `5177`
- PdfConvert: `5178`

## Personal data policy

Do not keep personal exports, seed data, generated histories, or TLS keys in the
app folders. Use browser exports/imports for intentional backups and keep those
outside this source tree.
