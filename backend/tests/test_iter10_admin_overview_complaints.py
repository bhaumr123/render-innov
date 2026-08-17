"""Iteration 10 tests: admin sales overview stats + buyer/seller complaints."""
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


@pytest.fixture()
def buyer():
    s = requests.Session()
    email = f"TEST_buyer_{uuid.uuid4().hex[:8]}@shop.com"
    r = s.post(f"{API}/auth/register", json={"email": email, "password": "BuyerPass123", "name": "T Buyer"}, timeout=15)
    assert r.status_code == 200
    return s


@pytest.fixture()
def seller():
    s = requests.Session()
    email = f"TEST_cseller_{uuid.uuid4().hex[:8]}@shop.com"
    r = s.post(f"{API}/auth/register", json={
        "email": email, "password": "SellerPass123", "name": "T Seller", "role": "seller",
        "state": "Rajasthan", "city": "Jaipur",
    }, timeout=15)
    assert r.status_code == 200
    return s


class TestAdminStats:
    def test_non_admin_cannot_view_stats(self, buyer):
        r = buyer.get(f"{API}/admin/stats", timeout=15)
        assert r.status_code == 403

    def test_anonymous_cannot_view_stats(self):
        r = requests.get(f"{API}/admin/stats", timeout=15)
        assert r.status_code == 401

    def test_admin_stats_shape(self, admin):
        r = admin.get(f"{API}/admin/stats", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        for key in ("total_orders", "total_revenue", "orders_by_status", "total_products",
                    "pending_products", "total_sellers", "total_customers", "open_complaints"):
            assert key in d, f"Missing stats key: {key}"
        assert isinstance(d["orders_by_status"], dict)


class TestComplaints:
    def test_buyer_can_raise_and_view_own_complaint(self, buyer):
        r = buyer.post(f"{API}/complaints", json={
            "subject": "TEST_ Wrong item delivered",
            "message": "I ordered honey but got chilli powder.",
        }, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "open"
        assert d["role"] == "customer"
        assert d["admin_response"] == ""

        mine = buyer.get(f"{API}/complaints/mine", timeout=15).json()
        assert any(c["id"] == d["id"] for c in mine["items"])

    def test_seller_can_raise_complaint_with_role_tagged(self, seller):
        r = seller.post(f"{API}/complaints", json={
            "subject": "TEST_ Payout missing",
            "message": "Buyer paid via QR but I have no record of it.",
        }, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["role"] == "seller"

    def test_anonymous_cannot_raise_complaint(self):
        r = requests.post(f"{API}/complaints", json={"subject": "x", "message": "y"}, timeout=15)
        assert r.status_code == 401

    def test_non_admin_cannot_list_all_complaints(self, buyer):
        r = buyer.get(f"{API}/admin/complaints", timeout=15)
        assert r.status_code == 403

    def test_admin_sees_and_resolves_complaint(self, admin, buyer):
        created = buyer.post(f"{API}/complaints", json={
            "subject": "TEST_ Damaged jar",
            "message": "The jar arrived cracked.",
        }, timeout=15).json()
        cid = created["id"]

        listing = admin.get(f"{API}/admin/complaints", timeout=15).json()
        assert any(c["id"] == cid for c in listing["items"])

        updated = admin.patch(f"{API}/admin/complaints/{cid}", json={
            "status": "resolved",
            "admin_response": "We've shipped a replacement, sorry for the trouble!",
        }, timeout=15)
        assert updated.status_code == 200, updated.text
        d = updated.json()
        assert d["status"] == "resolved"
        assert "replacement" in d["admin_response"]

        # Buyer sees the admin's response on their own copy.
        mine = buyer.get(f"{API}/complaints/mine", timeout=15).json()
        mine_match = next(c for c in mine["items"] if c["id"] == cid)
        assert mine_match["status"] == "resolved"
        assert mine_match["admin_response"] == d["admin_response"]

    def test_invalid_status_rejected(self, admin, buyer):
        created = buyer.post(f"{API}/complaints", json={
            "subject": "TEST_ Invalid status probe",
            "message": "x",
        }, timeout=15).json()
        r = admin.patch(f"{API}/admin/complaints/{created['id']}", json={"status": "not_a_real_status"}, timeout=15)
        assert r.status_code == 400
