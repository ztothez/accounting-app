# Accounting App

Local organization accounting workspace for verified transactions, fiscal periods, manager review, audit history, and SQLite persistence.

## Run

```bash
python3 server.py
```

Open <http://localhost:5179/>. `/Accounting/` remains a compatibility alias.

The application stores its SQLite database at `Accounting/data/accounting.sqlite3` by default. Copy `Accounting/.env.example` to `Accounting/.env` to configure the port, host allowlist, authentication, or database path.

## Accounting workflow

- Transactions: view saved organization transactions by fiscal month.
- New transaction: enter and verify all workbook fields before saving.
- Review & sign-off: record an accountable manager approval for the period.
- Audit trail: review local activity history.

The transaction fields preserve the original workbook structure: Date, Credit / debit, Cash, Cash register, VAT 24% Rent 40%, VAT 24% Rent 25%, and Product sales 5%.

## Enterprise Runtime

The Python server uses the shared `saas_runtime.py` layer for production env validation, optional Basic auth, allowed hosts, request IDs, security headers, health and metrics endpoints, and request body limits.

Do not commit databases, exports, credentials, or other local client data.
