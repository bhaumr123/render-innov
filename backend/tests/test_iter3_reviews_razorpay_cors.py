"""
Iteration 3 backend tests for Innovation Window India (IWI):
  - Razorpay endpoints return 503 while keys are empty
  - Product reviews restricted to verified purchasers
  - CORS lockdown to explicit preview origin
  - Cookies set with Secure attribute (COOKIE_SECURE=true)
"""
import os
import re
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip()
                    break
    except Exception:
        pass
BASE_URL = (BASE_URL or "").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@shop.com"
ADMIN_PASSWORD = "admin123"
ALLOWED_ORIGIN = "https://shop-engine-57.preview.emergentagent.com"


# ---------------- helpers ----------------
def _register(prefix="rev"):
    s = requests.Session()
    email = f"TEST_{prefix}_{uuid.uuid4().hex[:6]}@shop.com"
    r = s.post(f"{API}/auth/register",
               json={"email": email, "password": "Test1234", "name": f"TEST_{prefix}"})
    assert r.status_code == 200, r.text
    s.email = email
    return s


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200
    return s


@pytest.fixture(scope="module")
def review_product(admin_session):
    """A dedicated product used purely for the review tests (so we don't pollute IWI seeded products)."""
    payload = {
        "title": "TEST_Review Product",
        "description": "Product for review testing",
        "price": 25.0,
        "category": "Teas",
        "stock": 100,
        "image_url": "https://via.placeholder.com/300",
        "brand": "IWI",
        "size_variants": [],
    }
    r = admin_session.post(f"{API}/products", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    pid = r.json()["id"]
    yield pid
    # cleanup: delete reviews and product
    admin_session.delete(f"{API}/products/{pid}")


def _buy_product(session, product_id, qty=1, variant_label=""):
    """Add to cart then checkout so user becomes a verified purchaser."""
    r = session.post(f"{API}/cart/add", json={"product_id": product_id, "quantity": qty, "variant_label": variant_label})
    assert r.status_code == 200, r.text
    r = session.post(f"{API}/orders/checkout", json={
        "address": {"name": "T", "street": "1 Main", "city": "Delhi", "state": "DL", "zip": "110001"},
        "payment_method": "mock_card",
    })
    assert r.status_code == 200, r.text
    return r.json()


# ---------------- Razorpay (unconfigured) ----------------
class TestRazorpayUnconfigured:
    def test_public_config_disabled(self):
        r = requests.get(f"{API}/config/razorpay")
        assert r.status_code == 200
        d = r.json()
        assert d.get("key_id") == ""
        assert d.get("enabled") is False

    def test_create_razorpay_503_when_unconfigured(self):
        s = _register("rzp_create")
        r = s.post(f"{API}/orders/create-razorpay", json={
            "address": {"name": "T", "street": "1", "city": "Delhi", "state": "DL", "zip": "110001"},
            "payment_method": "razorpay",
        })
        assert r.status_code == 503, r.text
        detail = r.json().get("detail", "")
        assert "not configured" in detail.lower() or "razorpay" in detail.lower()

    def test_verify_razorpay_503_when_unconfigured(self):
        s = _register("rzp_verify")
        r = s.post(f"{API}/orders/verify-razorpay", json={
            "order_id": "507f1f77bcf86cd799439011",
            "razorpay_order_id": "order_test",
            "razorpay_payment_id": "pay_test",
            "razorpay_signature": "sig_test",
        })
        assert r.status_code == 503, r.text
        assert "not configured" in r.json().get("detail", "").lower()

    def test_razorpay_endpoints_require_auth(self):
        # No cookies / auth
        r1 = requests.post(f"{API}/orders/create-razorpay", json={"address": {}, "payment_method": "razorpay"})
        assert r1.status_code == 401
        r2 = requests.post(f"{API}/orders/verify-razorpay", json={
            "order_id": "x", "razorpay_order_id": "x", "razorpay_payment_id": "x", "razorpay_signature": "x"
        })
        assert r2.status_code == 401


# ---------------- Reviews ----------------
class TestReviewsGating:
    def test_list_reviews_empty_public(self, review_product):
        r = requests.get(f"{API}/products/{review_product}/reviews")
        assert r.status_code == 200
        assert r.json() == {"reviews": []} or r.json().get("reviews") == []

    def test_eligibility_requires_auth(self, review_product):
        r = requests.get(f"{API}/products/{review_product}/reviews/eligibility")
        assert r.status_code == 401

    def test_eligibility_for_fresh_user(self, review_product):
        s = _register("elig_fresh")
        r = s.get(f"{API}/products/{review_product}/reviews/eligibility")
        assert r.status_code == 200
        d = r.json()
        assert d == {"purchased": False, "already_reviewed": False, "can_review": False}

    def test_non_purchaser_cannot_review(self, review_product):
        s = _register("noprchr")
        r = s.post(f"{API}/products/{review_product}/reviews",
                   json={"rating": 5, "title": "cool", "comment": "loved it"})
        assert r.status_code == 403, r.text
        assert "verified purchasers" in r.json().get("detail", "").lower()

    def test_post_review_requires_auth(self, review_product):
        r = requests.post(f"{API}/products/{review_product}/reviews",
                          json={"rating": 5, "title": "x", "comment": "y"})
        assert r.status_code == 401


class TestVerifiedPurchaserFlow:
    def test_e2e_verified_review_and_recompute(self, review_product, admin_session):
        pid = review_product

        # Baseline product rating/count
        base = requests.get(f"{API}/products/{pid}").json()
        # Register + buy + review
        s = _register("verif_1")
        _buy_product(s, pid, qty=1)

        # eligibility now purchased=True
        elig = s.get(f"{API}/products/{pid}/reviews/eligibility").json()
        assert elig["purchased"] is True
        assert elig["already_reviewed"] is False
        assert elig["can_review"] is True

        # POST review
        r = s.post(f"{API}/products/{pid}/reviews",
                   json={"rating": 5, "title": "Excellent tea", "comment": "Really lovely, will buy again"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["rating"] == 5
        assert body["title"] == "Excellent tea"
        assert "id" in body

        # Review list has it
        listed = requests.get(f"{API}/products/{pid}/reviews").json()["reviews"]
        assert any(rv["title"] == "Excellent tea" for rv in listed)

        # Product recomputed
        prod = requests.get(f"{API}/products/{pid}").json()
        assert prod["reviews_count"] == 1
        assert prod["rating"] == 5.0

        # Duplicate review by same user rejected
        r2 = s.post(f"{API}/products/{pid}/reviews",
                    json={"rating": 4, "title": "again", "comment": "again"})
        assert r2.status_code == 400
        assert "already reviewed" in r2.json().get("detail", "").lower()

        # Eligibility now already_reviewed
        elig2 = s.get(f"{API}/products/{pid}/reviews/eligibility").json()
        assert elig2 == {"purchased": True, "already_reviewed": True, "can_review": False}

    def test_rating_averages_across_two_purchasers(self, admin_session):
        # Fresh dedicated product to keep math clean
        payload = {
            "title": "TEST_Avg Rating Product",
            "description": "avg",
            "price": 20.0,
            "category": "Teas",
            "stock": 100,
            "image_url": "https://via.placeholder.com/300",
            "brand": "IWI",
            "size_variants": [],
        }
        r = admin_session.post(f"{API}/products", json=payload)
        assert r.status_code == 200
        pid = r.json()["id"]
        try:
            s1 = _register("avg_a")
            _buy_product(s1, pid, qty=1)
            r1 = s1.post(f"{API}/products/{pid}/reviews",
                         json={"rating": 4, "title": "ok", "comment": "nice"})
            assert r1.status_code == 200

            s2 = _register("avg_b")
            _buy_product(s2, pid, qty=1)
            r2 = s2.post(f"{API}/products/{pid}/reviews",
                         json={"rating": 5, "title": "great", "comment": "loved"})
            assert r2.status_code == 200

            prod = requests.get(f"{API}/products/{pid}").json()
            assert prod["reviews_count"] == 2
            assert prod["rating"] == 4.5
        finally:
            admin_session.delete(f"{API}/products/{pid}")


# ---------------- CORS lockdown ----------------
class TestCORSLockdown:
    def test_allowed_origin_echoed(self):
        r = requests.get(f"{API}/products", headers={"Origin": ALLOWED_ORIGIN})
        assert r.status_code == 200
        aco = r.headers.get("access-control-allow-origin", "")
        assert aco == ALLOWED_ORIGIN, f"Expected explicit allowed origin, got: {aco!r}"
        # allow-credentials should be true
        acc = r.headers.get("access-control-allow-credentials", "").lower()
        assert acc == "true", f"allow-credentials header not true: {acc!r}"

    def test_disallowed_origin_no_cors(self):
        r = requests.get(f"{API}/products", headers={"Origin": "https://evil.example.com"})
        assert r.status_code == 200
        aco = r.headers.get("access-control-allow-origin", "")
        # Must NOT be '*' and must NOT match the evil origin
        assert aco != "*", "CORS is a wildcard — should be locked down"
        assert aco != "https://evil.example.com", "Evil origin was reflected as allowed"

    def test_preflight_allowed_origin(self):
        r = requests.options(f"{API}/auth/login", headers={
            "Origin": ALLOWED_ORIGIN,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        })
        # Starlette CORSMiddleware returns 200 for allowed preflight
        assert r.status_code in (200, 204), r.status_code
        aco = r.headers.get("access-control-allow-origin", "")
        assert aco == ALLOWED_ORIGIN


# ---------------- Secure cookie ----------------
class TestSecureCookie:
    def test_login_sets_secure_httponly_cookie(self):
        # Use raw requests to inspect Set-Cookie headers
        r = requests.post(f"{API}/auth/login",
                          json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200
        # There may be multiple Set-Cookie headers joined by "; " when read via .headers.
        # Use raw list from raw.headers for reliability.
        set_cookies = r.raw.headers.getlist("Set-Cookie") if hasattr(r.raw.headers, "getlist") else [r.headers.get("Set-Cookie", "")]
        joined = "\n".join(set_cookies)
        # access_token cookie present
        assert re.search(r"access_token=", joined), f"access_token cookie not set: {joined!r}"
        # Find the access_token cookie line
        access_line = next((c for c in set_cookies if c.startswith("access_token=")), "")
        assert "Secure" in access_line, f"access_token missing Secure attr: {access_line!r}"
        assert "HttpOnly" in access_line, f"access_token missing HttpOnly attr: {access_line!r}"
        assert re.search(r"SameSite=lax", access_line, re.IGNORECASE), f"SameSite=lax missing: {access_line!r}"
        # Max-Age 86400 (24h)
        assert re.search(r"Max-Age=86400", access_line), f"Max-Age=86400 missing: {access_line!r}"
