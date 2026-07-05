#!/usr/bin/env python3
import mimetypes
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from saas_runtime import EnterpriseHTTPMixin, build_settings, display_host  # noqa: E402

SETTINGS = build_settings("Accounting", ROOT, 5173)


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
        if path in ("/", "/Accounting", "/Accounting/"):
            self.path = "/Accounting/index.html"
        return super().do_GET()


if __name__ == "__main__":
    mimetypes.add_type("text/babel; charset=utf-8", ".jsx")
    print(f"Accounting app listening on http://{display_host(SETTINGS.host)}:{SETTINGS.port}/Accounting/")
    ThreadingHTTPServer((SETTINGS.host, SETTINGS.port), AccountingHandler).serve_forever()
