#!/usr/bin/env python3
import mimetypes
import json
import os
import sqlite3
import sys
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from saas_runtime import EnterpriseHTTPMixin, build_settings, display_host  # noqa: E402

SETTINGS = build_settings("Accounting", ROOT, 5179)
DB_PATH = Path(os.getenv("ACCOUNTING_DB_PATH", str(ROOT / "data" / "accounting.sqlite3"))).expanduser()


def _seed_state():
    now = datetime.now(timezone.utc).isoformat()
    return {
        "org": {"name": "Northstar Cooperative", "id": "FI-ORG-001", "currency": "EUR"},
        "year": datetime.now().year,
        "activeMonth": datetime.now().month,
        "entries": {},
        "audit": [{"id": "workspace-created", "action": "Workspace created", "time": now}],
    }


def _db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute("CREATE TABLE IF NOT EXISTS accounting_state (id INTEGER PRIMARY KEY CHECK (id = 1), data_json TEXT NOT NULL, updated_at TEXT NOT NULL)")
    row = conn.execute("SELECT data_json FROM accounting_state WHERE id = 1").fetchone()
    if row is None:
        state = _seed_state()
        conn.execute("INSERT INTO accounting_state VALUES (1, ?, ?)", (json.dumps(state), datetime.now(timezone.utc).isoformat()))
        conn.commit()
    else:
        state = json.loads(row[0])
    return conn, state


def _write_state(state):
    conn, _ = _db()
    conn.execute("UPDATE accounting_state SET data_json = ?, updated_at = ? WHERE id = 1", (json.dumps(state), datetime.now(timezone.utc).isoformat()))
    conn.commit()
    conn.close()


class AccountingHandler(EnterpriseHTTPMixin, SimpleHTTPRequestHandler):
    app_settings = SETTINGS
    default_document = "Accounting/index.html"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        path = urlparse(self.path).path
        if not self.prepare_request(allow_unauthenticated=path in ("/healthz", "/api/healthz")):
            return
        if self.handle_enterprise_get(path):
            return
        if path == "/api/accounting/state":
            conn, state = _db()
            conn.close()
            return self.enterprise_json(200, state)
        if path in ("/", "/Accounting", "/Accounting/"):
            self.path = "/Accounting/index.html"
        return super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path
        if not self.prepare_request():
            return
        if path == "/api/accounting/state":
            try:
                length = int(self.headers.get("Content-Length", "0"))
                state = json.loads(self.rfile.read(length))
                if not isinstance(state, dict) or not isinstance(state.get("entries"), dict) or not isinstance(state.get("org"), dict):
                    raise ValueError("invalid state shape")
                _write_state(state)
                return self.enterprise_json(200, {"status": "saved", "updated_at": datetime.now(timezone.utc).isoformat()})
            except (ValueError, json.JSONDecodeError):
                return self.enterprise_json(400, {"error": "Invalid accounting state."})
        return self.enterprise_json(404, {"error": "Not found."})


if __name__ == "__main__":
    mimetypes.add_type("application/javascript", ".js")
    print(f"Accounting app listening on http://{display_host(SETTINGS.host)}:{SETTINGS.port}/Accounting/")
    ThreadingHTTPServer((SETTINGS.host, SETTINGS.port), AccountingHandler).serve_forever()
