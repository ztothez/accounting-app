# Accounting App

Local-first accounting workspace for private monthly finance tracking.

## Apps

- `Ledger`: monthly income, expenses, due dates, paid status, custom columns, JSON import/export.
- `Debts`: debt balances, repayment progress, monthly commitments, payment logs, custom columns.

The apps store working data in browser `localStorage`. Personal seed data, spreadsheets, exports, TLS keys, and generated runtime files are intentionally excluded from the repository.

## Run

```bash
python3 server.py
```

Open:

- `http://localhost:5173/Accounting/`
- `http://localhost:5174/Ledger.html` with `python3 Ledger/server.py`
- `http://localhost:5175/Debts.html` with `python3 Debts/server.py`

## Enterprise Runtime

The Python servers use the shared `saas_runtime.py` layer:

- production env validation
- optional Basic auth
- allowed host checks
- request IDs
- security headers
- `/healthz` and `/metrics`
- request body limits

Copy `.env.example` into the app folder you are deploying as `.env`, then set `APP_ENV=production`, `ALLOWED_HOSTS`, and `APP_BASIC_AUTH_*`.

## Data Safety

Use the in-app import/export controls for private backups. Do not commit exported JSON, spreadsheets, local certificates, `.env`, browser storage dumps, or seed files containing real data.
