#!/usr/bin/env python3
"""Shared runtime controls for the local SaaS-style apps.

The apps in this folder intentionally remain small, dependency-free services.
This module centralizes the production posture they share: environment loading,
host validation, optional Basic auth, security headers, request IDs, health
checks, metrics, and body-size limits.
"""

from __future__ import annotations

import base64
import hmac
import json
import os
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from threading import Lock


@dataclass(frozen=True)
class EnterpriseSettings:
    app_name: str
    root: Path
    app_env: str
    host: str
    port: int
    allowed_hosts: tuple[str, ...]
    admin_username: str | None
    admin_password: str | None
    max_body_bytes: int

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() == "production"

    @property
    def auth_enabled(self) -> bool:
        return bool(self.admin_username and self.admin_password)

    def validate(self) -> None:
        if not self.is_production:
            return
        if not self.auth_enabled:
            raise RuntimeError(
                "APP_BASIC_AUTH_USERNAME and APP_BASIC_AUTH_PASSWORD must be set in production."
            )
        if self.admin_password and len(self.admin_password) < 16:
            raise RuntimeError("APP_BASIC_AUTH_PASSWORD must be at least 16 characters in production.")
        if not self.allowed_hosts:
            raise RuntimeError("ALLOWED_HOSTS must be set in production.")
        if "*" in self.allowed_hosts:
            raise RuntimeError("ALLOWED_HOSTS cannot contain '*' in production.")


_METRICS_LOCK = Lock()
_METRICS = {
    "started_at": time.time(),
    "requests": 0,
    "status_codes": {},
    "auth_failures": 0,
    "host_rejections": 0,
}


def load_env_file(root: Path) -> None:
    env_path = root / ".env"
    if not env_path.exists():
        return

    for line in env_path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("'\""))


def _parse_hosts(value: str | None, app_host: str) -> tuple[str, ...]:
    if value is None:
        value = f"127.0.0.1,localhost,{app_host}"
    return tuple(host.strip().lower() for host in value.split(",") if host.strip())


def build_settings(app_name: str, root: Path, default_port: int) -> EnterpriseSettings:
    load_env_file(root)
    app_env = os.getenv("APP_ENV", "development")
    host = os.getenv("HOST", "127.0.0.1")
    max_body_mb = int(os.getenv("MAX_BODY_MB", os.getenv("MAX_UPLOAD_MB", "25")))
    settings = EnterpriseSettings(
        app_name=app_name,
        root=root,
        app_env=app_env,
        host=host,
        port=int(os.getenv("PORT", str(default_port))),
        allowed_hosts=_parse_hosts(os.getenv("ALLOWED_HOSTS"), host),
        admin_username=os.getenv("APP_BASIC_AUTH_USERNAME"),
        admin_password=os.getenv("APP_BASIC_AUTH_PASSWORD"),
        max_body_bytes=max_body_mb * 1024 * 1024,
    )
    settings.validate()
    return settings


def display_host(host: str) -> str:
    return "localhost" if host in ("127.0.0.1", "0.0.0.0", "::") else host


def _host_without_port(raw_host: str) -> str:
    host = raw_host.strip().lower()
    if host.startswith("[") and "]" in host:
        return host[1 : host.index("]")]
    if ":" in host:
        return host.rsplit(":", 1)[0]
    return host


def _record_status(status_code: int) -> None:
    with _METRICS_LOCK:
        _METRICS["requests"] += 1
        codes = _METRICS["status_codes"]
        code = str(status_code)
        codes[code] = codes.get(code, 0) + 1


def _bump(metric: str) -> None:
    with _METRICS_LOCK:
        _METRICS[metric] = int(_METRICS.get(metric, 0)) + 1


class EnterpriseHTTPMixin:
    app_settings: EnterpriseSettings
    default_document = "index.html"

    server_version = "EnterpriseLocalHTTP/1.0"

    def prepare_request(self, *, allow_unauthenticated: bool = False) -> bool:
        self.request_id = self.headers.get("X-Request-ID") or uuid.uuid4().hex
        self._request_started_at = time.perf_counter()

        if not self._host_allowed():
            _bump("host_rejections")
            self.enterprise_json(400, {"error": "Host is not allowed.", "request_id": self.request_id})
            return False

        content_length = self.headers.get("Content-Length")
        if content_length:
            try:
                if int(content_length) > self.app_settings.max_body_bytes:
                    self.enterprise_json(
                        413,
                        {
                            "error": "Request body is too large.",
                            "max_bytes": self.app_settings.max_body_bytes,
                            "request_id": self.request_id,
                        },
                    )
                    return False
            except ValueError:
                self.enterprise_json(400, {"error": "Invalid Content-Length.", "request_id": self.request_id})
                return False

        if not allow_unauthenticated and self.app_settings.auth_enabled and not self._authenticated():
            _bump("auth_failures")
            self.send_response(401)
            self.send_header("WWW-Authenticate", 'Basic realm="Local enterprise apps"')
            self.send_header("Content-Type", "application/json; charset=utf-8")
            body = json.dumps({"error": "Authentication required.", "request_id": self.request_id}).encode("utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return False

        return True

    def handle_enterprise_get(self, path: str) -> bool:
        if path in ("/healthz", "/api/healthz"):
            self.enterprise_json(
                200,
                {
                    "status": "ok",
                    "app": self.app_settings.app_name,
                    "env": self.app_settings.app_env,
                    "auth_enabled": self.app_settings.auth_enabled,
                },
            )
            return True

        if path in ("/metrics", "/api/metrics"):
            self._send_metrics()
            return True

        return False

    def enterprise_json(self, status: int, payload: dict | list) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        if not self.prepare_request(allow_unauthenticated=True):
            return
        self.send_response(204)
        self.send_header("Allow", "GET, HEAD, POST, OPTIONS")
        self.end_headers()

    def do_HEAD(self) -> None:
        if not self.prepare_request():
            return
        path = self.path.split("?", 1)[0]
        if path == "/":
            self.path = "/" + self.default_document
        return super().do_HEAD()

    def send_response(self, code: int, message: str | None = None) -> None:
        self._status_code = code
        return super().send_response(code, message)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "same-origin")
        self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("X-Request-ID", getattr(self, "request_id", uuid.uuid4().hex))
        self.send_header(
            "Content-Security-Policy",
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com; "
            "img-src 'self' data: blob: https:; "
            "media-src 'self' data: blob:; "
            "connect-src 'self'; "
            "object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
        )
        if self.app_settings.is_production:
            self.send_header("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        return super().end_headers()

    def finish(self) -> None:
        try:
            return super().finish()
        finally:
            if hasattr(self, "_status_code"):
                _record_status(int(self._status_code))

    def _send_metrics(self) -> None:
        uptime = max(0, int(time.time() - float(_METRICS["started_at"])))
        with _METRICS_LOCK:
            lines = [
                f'local_app_uptime_seconds{{app="{self.app_settings.app_name}"}} {uptime}',
                f'local_app_requests_total{{app="{self.app_settings.app_name}"}} {_METRICS["requests"]}',
                f'local_app_auth_failures_total{{app="{self.app_settings.app_name}"}} {_METRICS["auth_failures"]}',
                f'local_app_host_rejections_total{{app="{self.app_settings.app_name}"}} {_METRICS["host_rejections"]}',
            ]
            for code, count in sorted(_METRICS["status_codes"].items()):
                lines.append(
                    f'local_app_responses_total{{app="{self.app_settings.app_name}",status="{code}"}} {count}'
                )
        body = ("\n".join(lines) + "\n").encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _host_allowed(self) -> bool:
        allowed = self.app_settings.allowed_hosts
        if "*" in allowed:
            return True
        raw_host = self.headers.get("Host")
        if not raw_host:
            return True
        host = _host_without_port(raw_host)
        return host in allowed

    def _authenticated(self) -> bool:
        auth = self.headers.get("Authorization", "")
        if not auth.lower().startswith("basic "):
            return False
        try:
            decoded = base64.b64decode(auth.split(" ", 1)[1]).decode("utf-8")
            username, password = decoded.split(":", 1)
        except (ValueError, UnicodeDecodeError):
            return False
        expected_user = self.app_settings.admin_username or ""
        expected_pass = self.app_settings.admin_password or ""
        return hmac.compare_digest(username, expected_user) and hmac.compare_digest(password, expected_pass)
