# LedgerOS Accounting

Local organization accounting app based on the `Kirjanpito.xlsm` workbook.
It runs with Python's standard library and stores data in SQLite.

## Run

From this directory:

```bash
python3 ../server.py
```

Open the app at <http://127.0.0.1:5179/>. `/Accounting/` remains a compatibility
alias. The database is created at
`data/accounting.sqlite3` on first run. Set `ACCOUNTING_DB_PATH` in `.env` to
place it elsewhere. The database is intentionally ignored by source control.

The workbook columns are preserved as: Date, Credit / debit, Cash, Cash
register, VAT 24% Rent 40%, VAT 24% Rent 25%, and Product sales 5%.
