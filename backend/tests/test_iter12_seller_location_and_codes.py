"""Iteration 12 tests: seller state/city, vendor/customer codes, statewise filter."""
import os, uuid, requests, pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip()
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@shop.com", "password": "admin123"}


@pytest.fixture(scope="module")
def admin():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=ADMIN, timeout=15)
    assert r.status_code == 200
    return s


def _register_seller(state="Rajasthan", city="Jaipur", **overrides):
    payload = {
        "email": f"TEST_locseller_{uuid.uuid4().hex[:8]}@shop.com",
        "password": "SellerPass123", "name": "Loc Seller", "role": "seller",
        "state": state, "city": city, "gst_number": "27AAAAA0000A1Z5",
    }
    payload.update(overrides)
    s = requests.Session()
    r = s.post(f"{API}/auth/register", json=payload, timeout=15)
    return s, r


class TestSellerLocationRequired:
    def test_missing_city_rejected(self):
        _, r = _register_seller(city="")
        assert r.status_code == 422

    def test_missing_state_rejected(self):
        _, r = _register_seller(state="")
        assert r.status_code == 422

    def test_invalid_state_rejected(self):
        _, r = _register_seller(state="Atlantis")
        assert r.status_code == 422

    def test_valid_state_city_accepted(self):
        s, r = _register_seller(state="Kerala", city="Kochi")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["state"] == "Kerala"
        assert d["city"] == "Kochi"

    def test_customer_registration_does_not_require_location(self):
        s = requests.Session()
        r = s.post(f"{API}/auth/register", json={
            "email": f"TEST_loccust_{uuid.uuid4().hex[:8]}@shop.com",
            "password": "BuyerPass123", "name": "Loc Buyer",
        }, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["state"] == ""
        assert r.json()["city"] == ""


class TestVendorAndCustomerCodes:
    def test_seller_gets_vendor_code(self):
        _, r = _register_seller()
        assert r.status_code == 200
        assert r.json()["code"].startswith("VEN-")

    def test_customer_gets_customer_code(self):
        s = requests.Session()
        r = s.post(f"{API}/auth/register", json={
            "email": f"TEST_code_{uuid.uuid4().hex[:8]}@shop.com",
            "password": "BuyerPass123", "name": "Code Buyer",
        }, timeout=15)
        assert r.status_code == 200
        assert r.json()["code"].startswith("CUS-")

    def test_codes_are_unique_even_with_identical_names(self):
        s1, r1 = _register_seller(**{"email": f"TEST_dup1_{uuid.uuid4().hex[:8]}@shop.com", "name": "Same Name"})
        s2, r2 = _register_seller(**{"email": f"TEST_dup2_{uuid.uuid4().hex[:8]}@shop.com", "name": "Same Name"})
        assert r1.status_code == 200 and r2.status_code == 200
        assert r1.json()["name"] == r2.json()["name"] == "Same Name"
        assert r1.json()["code"] != r2.json()["code"]
        assert r1.json()["id"] != r2.json()["id"]

    def test_duplicate_email_still_rejected(self):
        email = f"TEST_dupemail_{uuid.uuid4().hex[:8]}@shop.com"
        s1, r1 = _register_seller(email=email)
        assert r1.status_code == 200
        s2, r2 = _register_seller(email=email)
        assert r2.status_code == 400

    def test_code_persists_across_login(self):
        s, r = _register_seller()
        code = r.json()["code"]
        s2 = requests.Session()
        login = s2.post(f"{API}/auth/login", json={"email": r.json()["email"], "password": "SellerPass123"}, timeout=15)
        assert login.status_code == 200
        assert login.json()["code"] == code

    def test_admin_gets_backfilled_customer_code_via_me(self, admin):
        me = admin.get(f"{API}/auth/me", timeout=15)
        assert me.status_code == 200
        assert me.json()["code"]  # backfilled lazily, non-empty


class TestStatewiseProductFilter:
    def test_product_inherits_seller_state_and_city(self, admin):
        seller, r = _register_seller(state="Tamil Nadu", city="Chennai")
        assert r.status_code == 200
        p = seller.post(f"{API}/products", json={
            "title": f"TEST_Statewise Product {uuid.uuid4().hex[:6]}",
            "image_url": "https://via.placeholder.com/200",
            "size_variants": [{"label": "100g", "price": 49.0, "stock": 20}],
        }, timeout=15).json()
        assert p["state"] == "Tamil Nadu"
        assert p["city"] == "Chennai"
        admin.patch(f"{API}/products/{p['id']}/approval", json={"approval_status": "approved"}, timeout=15)

        listing = requests.get(f"{API}/products?state=Tamil Nadu&limit=200", timeout=15).json()
        assert any(item["id"] == p["id"] for item in listing["items"])

        other = requests.get(f"{API}/products?state=Goa&limit=200", timeout=15).json()
        assert all(item["id"] != p["id"] for item in other["items"])

        admin.delete(f"{API}/products/{p['id']}")

    def test_states_endpoint_lists_full_india_list(self):
        r = requests.get(f"{API}/products/states", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "Rajasthan" in d["states"]
        assert "Kerala" in d["states"]
        assert len(d["states"]) >= 28  # 28 states + UTs
        assert isinstance(d["with_products"], list)
