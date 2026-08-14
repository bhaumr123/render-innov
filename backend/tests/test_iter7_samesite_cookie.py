"""
Iter7 regression: COOKIE_SAMESITE env-var behavior for set_auth_cookies.

With /app/backend/.env currently containing COOKIE_SAMESITE=none, the live
backend must set cookies with 'samesite=none; Secure'. We also unit-test the
fallback (unset -> lax) directly via the FastAPI Response object.
"""
import os
import re
import time
import requests
import pytest
from fastapi import Response

# Import server (and thus trigger its load_dotenv) BEFORE any monkeypatching so
# subsequent env changes in tests aren't undone by a first-time import.
import sys
sys.path.insert(0, "/app")
from backend.server import set_auth_cookies  # noqa: E402

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") else None
if not BASE_URL:
    # Fall back to frontend/.env-provided URL used across the suite
    from pathlib import Path
    for line in (Path("/app/frontend/.env").read_text().splitlines()):
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
            break

ADMIN_EMAIL = "admin@shop.com"
ADMIN_PASSWORD = "admin123"


# --- Live integration: current env has COOKIE_SAMESITE=none ---
class TestLiveSameSiteNone:
    def test_login_cookie_has_samesite_none_and_secure(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        raw = r.headers.get("set-cookie", "")
        # requests folds all set-cookie headers into one comma-joined string;
        # split on 'access_token=' occurrences to find that specific cookie line.
        # Simpler: search across the whole string.
        assert re.search(r"access_token=", raw), f"access_token cookie missing: {raw!r}"
        assert re.search(r"samesite=none", raw, re.IGNORECASE), (
            f"expected samesite=none, got: {raw!r}"
        )
        assert re.search(r"\bSecure\b", raw), f"Secure flag missing: {raw!r}"
        assert re.search(r"HttpOnly", raw, re.IGNORECASE), f"HttpOnly missing: {raw!r}"

    def test_auth_me_still_works_same_origin(self):
        s = requests.Session()
        r = s.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
            timeout=15,
        )
        assert r.status_code == 200
        me = s.get(f"{BASE_URL}/api/auth/me", timeout=15)
        assert me.status_code == 200, me.text
        assert me.json()["email"] == ADMIN_EMAIL


# --- Unit tests for the helper directly, bypassing env of the live process ---
class TestSetAuthCookiesHelper:
    def _extract_cookie(self, resp: Response, name: str) -> str:
        for k, v in resp.raw_headers:
            if k.lower() == b"set-cookie" and v.startswith(name.encode() + b"="):
                return v.decode()
        raise AssertionError(f"cookie {name} not set. headers={resp.raw_headers}")

    def test_default_fallback_is_lax(self, monkeypatch):
        # Ensure env doesn't force 'none' for this direct call
        monkeypatch.delenv("COOKIE_SAMESITE", raising=False)
        monkeypatch.setenv("COOKIE_SECURE", "false")
        # Import inside test so env changes take effect for os.environ.get lookups

        resp = Response()
        set_auth_cookies(resp, "a.b.c", "r.r.r")
        access = self._extract_cookie(resp, "access_token")
        assert "samesite=lax" in access.lower(), access
        # secure=false path -> no Secure flag
        assert "secure" not in access.lower(), access

    def test_none_forces_secure(self, monkeypatch):
        monkeypatch.setenv("COOKIE_SAMESITE", "none")
        monkeypatch.setenv("COOKIE_SECURE", "false")  # should be overridden

        resp = Response()
        set_auth_cookies(resp, "a.b.c", "r.r.r")
        access = self._extract_cookie(resp, "access_token")
        assert "samesite=none" in access.lower(), access
        assert "secure" in access.lower(), access


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
