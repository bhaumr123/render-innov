"""Iteration 9 tests: seller two-photo uploads + admin product approval gate."""
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
def seller():
    s = requests.Session()
    email = f"TEST_seller_{uuid.uuid4().hex[:8]}@shop.com"
    r = s.post(f"{API}/auth/register", json={
        "email": email, "password": "SellerPass123", "name": "T Seller", "role": "seller",
    }, timeout=15)
    assert r.status_code == 200, r.text
    assert r.json()["role"] == "seller"
    return s


def _seller_product_payload(**overrides):
    payload = {
        "title": f"TEST_Seller Product {uuid.uuid4().hex[:6]}",
        "price": 199.0,
        "category": "Teas",
        "image_url": "https://via.placeholder.com/300?text=Front",
        "images": ["https://via.placeholder.com/300?text=Back"],
    }
    payload.update(overrides)
    return payload


class TestSellerProductTwoPhotos:
    def test_seller_can_set_two_photos(self, seller):
        payload = _seller_product_payload()
        r = seller.post(f"{API}/products", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["image_url"] == payload["image_url"]
        assert d["images"] == payload["images"]


class TestSellerProductApprovalGate:
    def test_new_seller_product_is_pending_and_hidden_from_public_list(self, seller):
        payload = _seller_product_payload()
        r = seller.post(f"{API}/products", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["approval_status"] == "pending"
        pid = d["id"]

        # Hidden from the public catalog...
        listing = requests.get(f"{API}/products?limit=200", timeout=15).json()
        assert all(item["id"] != pid for item in listing["items"])

        # ...and hidden from an anonymous product-detail fetch (404, not leaked).
        detail = requests.get(f"{API}/products/{pid}", timeout=15)
        assert detail.status_code == 404

        # But the owning seller can still see it themselves.
        own = seller.get(f"{API}/products/{pid}", timeout=15)
        assert own.status_code == 200
        assert own.json()["approval_status"] == "pending"

    def test_admin_sees_pending_queue_and_can_approve(self, admin, seller):
        payload = _seller_product_payload()
        r = seller.post(f"{API}/products", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        pid = r.json()["id"]

        pending = admin.get(f"{API}/admin/products/pending", timeout=15).json()
        assert any(item["id"] == pid for item in pending["items"])

        approve = admin.patch(f"{API}/products/{pid}/approval", json={"approval_status": "approved"}, timeout=15)
        assert approve.status_code == 200, approve.text
        assert approve.json()["approval_status"] == "approved"

        listing = requests.get(f"{API}/products?limit=200", timeout=15).json()
        assert any(item["id"] == pid for item in listing["items"])

        detail = requests.get(f"{API}/products/{pid}", timeout=15)
        assert detail.status_code == 200

        admin.delete(f"{API}/products/{pid}")

    def test_seller_cannot_self_approve(self, admin):
        s = requests.Session()
        email = f"TEST_selfapprove_{uuid.uuid4().hex[:8]}@shop.com"
        s.post(f"{API}/auth/register", json={
            "email": email, "password": "SellerPass123", "name": "T", "role": "seller",
        }, timeout=15)
        r = s.post(f"{API}/products", json=_seller_product_payload(), timeout=15)
        pid = r.json()["id"]
        # approval_status isn't a field on ProductIn — sending it is a no-op, product stays pending.
        assert r.json()["approval_status"] == "pending"
        # Only admins may hit the approval endpoint at all.
        forbidden = s.patch(f"{API}/products/{pid}/approval", json={"approval_status": "approved"}, timeout=15)
        assert forbidden.status_code == 403
        admin.delete(f"{API}/products/{pid}")

    def test_admin_created_products_are_auto_approved(self, admin):
        r = admin.post(f"{API}/products", json=_seller_product_payload(), timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["approval_status"] == "approved"
        admin.delete(f"{API}/products/{r.json()['id']}")
