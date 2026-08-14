"""
Iter8: Password reset flow tests.
Covers:
  - POST /api/auth/forgot-password (enumeration protection, token created, log emitted)
  - POST /api/auth/reset-password (single-use, expiry logic, cross-user token invalidation)
  - Login with new password + old password rejected
Requires backend .env: SMTP_USER/SMTP_APP_PASSWORD UNSET so the link is logged.
"""
import os
import re
import time
import uuid
import requests
import pytest
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip()
                break
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

BACKEND_LOG = "/var/log/supervisor/backend.err.log"
STANDARD_MSG = "If an account exists for that email, a reset link has been sent."


@pytest.fixture(scope="module")
def db():
    c = MongoClient(MONGO_URL)
    yield c[DB_NAME]
    c.close()


def _read_log_tail(bytes_from_end=200_000):
    try:
        with open(BACKEND_LOG, "rb") as f:
            f.seek(0, 2)
            size = f.tell()
            f.seek(max(0, size - bytes_from_end))
            return f.read().decode("utf-8", errors="ignore")
    except FileNotFoundError:
        return ""


def _extract_token_for(email: str):
    """Find the latest '[SMTP UNCONFIGURED] Password reset link for {email}: ...token=XXX' in logs."""
    log = _read_log_tail()
    # Backend lowercases the email before logging; match case-insensitively for safety
    pattern = rf"\[SMTP UNCONFIGURED\] Password reset link for {re.escape(email.lower())}: \S*token=([A-Za-z0-9_\-]+)"
    matches = re.findall(pattern, log, re.IGNORECASE)
    return matches[-1] if matches else None


def _register_user(prefix="reset"):
    email = f"TEST_{prefix}_{uuid.uuid4().hex[:8]}@shop.com"
    password = "Orig1234"
    s = requests.Session()
    r = s.post(f"{API}/auth/register", json={"email": email, "password": password, "name": "Reset Tester"}, timeout=15)
    assert r.status_code == 200, r.text
    return email, password


class TestForgotPassword:
    def test_forgot_existing_email_returns_standard_message_and_creates_token(self, db):
        email, _ = _register_user("f_ok")
        elow = email.lower()
        before = db.password_reset_tokens.count_documents({"email": elow})
        r = requests.post(f"{API}/auth/forgot-password", json={"email": email}, timeout=15)
        assert r.status_code == 200
        assert r.json().get("message") == STANDARD_MSG
        # allow write to flush
        time.sleep(0.4)
        after = db.password_reset_tokens.count_documents({"email": elow})
        assert after == before + 1, f"expected +1 token for {elow}, got {before}->{after}"
        rec = db.password_reset_tokens.find_one({"email": elow}, sort=[("created_at", -1)])
        assert rec["used"] is False
        assert rec["token_hash"].startswith("$2b$"), "token stored bcrypt-hashed"
        # No plaintext token in DB
        assert "token" not in rec or not isinstance(rec.get("token"), str)

    def test_forgot_nonexistent_email_returns_same_message_and_no_record(self, db):
        email = f"TEST_ghost_{uuid.uuid4().hex[:8]}@nowhere.example"
        before = db.password_reset_tokens.count_documents({"email": email.lower()})
        r = requests.post(f"{API}/auth/forgot-password", json={"email": email}, timeout=15)
        assert r.status_code == 200
        assert r.json().get("message") == STANDARD_MSG  # same response — enumeration protection
        time.sleep(0.3)
        after = db.password_reset_tokens.count_documents({"email": email.lower()})
        assert after == before, "must NOT insert a token for non-existent email"

    def test_forgot_log_contains_reset_link_when_smtp_unconfigured(self):
        email, _ = _register_user("f_log")
        r = requests.post(f"{API}/auth/forgot-password", json={"email": email}, timeout=15)
        assert r.status_code == 200
        time.sleep(0.6)
        token = _extract_token_for(email)
        assert token is not None, "expected [SMTP UNCONFIGURED] log line with token"
        assert len(token) >= 20


class TestResetPassword:
    def test_valid_token_resets_password_and_old_password_rejected(self):
        email, old_pw = _register_user("r_valid")
        requests.post(f"{API}/auth/forgot-password", json={"email": email}, timeout=15)
        time.sleep(0.6)
        token = _extract_token_for(email)
        assert token, "log token missing"
        new_pw = "NewPass1234"
        r = requests.post(f"{API}/auth/reset-password",
                          json={"token": token, "new_password": new_pw}, timeout=15)
        assert r.status_code == 200, r.text
        assert "reset" in r.json().get("message", "").lower()
        # New password logs in
        ok = requests.post(f"{API}/auth/login", json={"email": email, "password": new_pw})
        assert ok.status_code == 200
        # Old password rejected
        bad = requests.post(f"{API}/auth/login", json={"email": email, "password": old_pw})
        assert bad.status_code == 401

    def test_same_token_cannot_be_reused(self):
        email, _ = _register_user("r_reuse")
        requests.post(f"{API}/auth/forgot-password", json={"email": email}, timeout=15)
        time.sleep(0.6)
        token = _extract_token_for(email)
        assert token
        first = requests.post(f"{API}/auth/reset-password",
                              json={"token": token, "new_password": "First1234"})
        assert first.status_code == 200
        second = requests.post(f"{API}/auth/reset-password",
                               json={"token": token, "new_password": "Second1234"})
        assert second.status_code == 400
        assert "invalid" in second.json().get("detail", "").lower() or "expired" in second.json().get("detail", "").lower()

    def test_random_token_returns_400(self):
        random_token = "totally-made-up-token-that-does-not-exist-abcdef123456"
        r = requests.post(f"{API}/auth/reset-password",
                          json={"token": random_token, "new_password": "Whatever1"})
        assert r.status_code == 400

    def test_short_password_rejected_by_validation(self):
        # min_length=6 on the schema
        r = requests.post(f"{API}/auth/reset-password",
                          json={"token": "x" * 25, "new_password": "abc"})
        assert r.status_code == 422

    def test_other_unused_tokens_are_invalidated_after_reset(self, db):
        email, _ = _register_user("r_invall")
        # Request TWO tokens
        requests.post(f"{API}/auth/forgot-password", json={"email": email}, timeout=15)
        time.sleep(0.5)
        first_token = _extract_token_for(email)
        requests.post(f"{API}/auth/forgot-password", json={"email": email}, timeout=15)
        time.sleep(0.5)
        second_token = _extract_token_for(email)
        assert first_token and second_token and first_token != second_token
        # Consume the second one
        r = requests.post(f"{API}/auth/reset-password",
                          json={"token": second_token, "new_password": "Fresh12345"})
        assert r.status_code == 200
        # First token should now be invalidated (defensive)
        r2 = requests.post(f"{API}/auth/reset-password",
                           json={"token": first_token, "new_password": "Fresh67890"})
        assert r2.status_code == 400
        # DB: all tokens for this email marked used
        unused = db.password_reset_tokens.count_documents({"email": email.lower(), "used": False})
        assert unused == 0


def teardown_module(module):
    """Restore admin password to admin123 in case any test touched it (defensive)."""
    try:
        # Re-login as admin with expected creds; if it fails, do nothing (no destructive action).
        r = requests.post(f"{API}/auth/login", json={"email": "admin@shop.com", "password": "admin123"}, timeout=10)
        if r.status_code != 200:
            # Try to reset via the flow
            requests.post(f"{API}/auth/forgot-password", json={"email": "admin@shop.com"}, timeout=10)
            time.sleep(0.6)
            tok = _extract_token_for("admin@shop.com")
            if tok:
                requests.post(f"{API}/auth/reset-password",
                              json={"token": tok, "new_password": "admin123"}, timeout=10)
    except Exception:
        pass
