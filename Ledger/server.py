#!/usr/bin/env python3
import mimetypes
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent))

from saas_runtime import EnterpriseHTTPMixin, build_settings, display_host  # noqa: E402

SETTINGS = build_settings("Ledger", ROOT, 5174)


class LedgerHandler(EnterpriseHTTPMixin, SimpleHTTPRequestHandler):
    app_settings = SETTINGS
    default_document = "Ledger.html"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        path = urlparse(self.path).path
        if not self.prepare_request(allow_unauthenticated=path in ("/healthz", "/api/healthz")):
            return
        if self.handle_enterprise_get(path):
            return
        if path == "/":
            self.path = "/Ledger.html"
        return super().do_GET()


if __name__ == "__main__":
    mimetypes.add_type("text/babel; charset=utf-8", ".jsx")
    print(f"Ledger app listening on http://{display_host(SETTINGS.host)}:{SETTINGS.port}/Ledger.html")
    ThreadingHTTPServer((SETTINGS.host, SETTINGS.port), LedgerHandler).serve_forever()
