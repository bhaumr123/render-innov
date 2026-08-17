"""Iteration 11 tests: per-seller order tracking + admin seller-wise gist.

Payment confirmation over email/WhatsApp is fire-and-forget and unconfigured
in test environments (same pattern as the existing password-reset email
tests), so we don't assert delivery here — only that checkout/verification
still succeeds and returns the expected seller-tracking shape.
"""
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


def _new_seller():
    s = requests.Session()
    email = f"TEST_trackseller_{uuid.uuid4().hex[:8]}@shop.com"
    r = s.post(f"{API}/auth/register", json={
        "email": email, "password": "SellerPass123", "name": "Track Seller", "role": "seller",
    }, timeout=15)
    assert r.status_code == 200
    return s


def _new_buyer():
    s = requests.Session()
    email = f"TEST_trackbuyer_{uuid.uuid4().hex[:8]}@shop.com"
    r = s.post(f"{API}/auth/register", json={
        "email": email, "password": "BuyerPass123", "name": "Track Buyer",
    }, timeout=15)
    assert r.status_code == 200
    return s


@pytest.fixture()
def seller_and_product(admin):
    seller = _new_seller()
    r = seller.post(f"{API}/products", json={
        "title": f"TEST_Tracked Product {uuid.uuid4().hex[:6]}",
        "image_url": "https://via.placeholder.com/200",
        "size_variants": [{"label": "100g", "price": 99.0, "stock": 50}],
    }, timeout=15)
    assert r.status_code == 200, r.text
    product = r.json()
    approve = admin.patch(f"{API}/products/{product['id']}/approval", json={"approval_status": "approved"}, timeout=15)
    assert approve.status_code == 200
    yield seller, product
    admin.delete(f"{API}/products/{product['id']}")


class TestAuthenticatedCheckoutSellerTracking:
    def test_order_carries_seller_id_snapshot_and_status(self, seller_and_product):
        seller, product = seller_and_product
        buyer = _new_buyer()
        add = buyer.post(f"{API}/cart/add", json={
            "product_id": product["id"], "quantity": 2, "variant_label": "100g",
        }, timeout=15)
        assert add.status_code == 200, add.text

        order = buyer.post(f"{API}/orders/checkout", json={
            "address": {"full_name": "Track Buyer", "street": "1 St", "city": "Delhi", "state": "DL", "zip": "110001", "phone": "9876543210"},
            "payment_method": "mock_card",
        }, timeout=15).json()

        seller_id = seller.get(f"{API}/auth/me", timeout=15).json()["id"]
        assert order["items"][0]["seller_id"] == seller_id
        assert seller_id in order["sellers"]
        assert order["sellers"][seller_id]["name"] == "Track Seller"
        assert order["seller_status"][seller_id]["status"] == "confirmed"
        assert order["seller_status"][seller_id]["history"][0]["note"] == "Order placed"

    def test_seller_sees_scoped_order_in_seller_orders(self, seller_and_product):
        seller, product = seller_and_product
        buyer = _new_buyer()
        buyer.post(f"{API}/cart/add", json={"product_id": product["id"], "quantity": 1, "variant_label": "100g"}, timeout=15)
        order = buyer.post(f"{API}/orders/checkout", json={
            "address": {"full_name": "B", "street": "S", "city": "C", "state": "DL", "zip": "110001"},
            "payment_method": "mock_cod",
        }, timeout=15).json()

        listing = seller.get(f"{API}/seller/orders", timeout=15).json()
        match = next((o for o in listing["orders"] if o["id"] == order["id"]), None)
        assert match is not None, "seller should see the order in their own list"
        assert len(match["items"]) == 1
        assert match["seller_subtotal"] == 99.0
        assert match["seller_fulfillment"]["status"] == "confirmed"
        # A seller-scoped view should not leak the buyer's other-seller data structures.
        assert "seller_status" not in match

    def test_seller_can_update_own_fulfillment(self, seller_and_product):
        seller, product = seller_and_product
        buyer = _new_buyer()
        buyer.post(f"{API}/cart/add", json={"product_id": product["id"], "quantity": 1, "variant_label": "100g"}, timeout=15)
        order = buyer.post(f"{API}/orders/checkout", json={
            "address": {"full_name": "B", "street": "S", "city": "C", "state": "DL", "zip": "110001"},
            "payment_method": "mock_cod",
        }, timeout=15).json()

        r = seller.patch(f"{API}/seller/orders/{order['id']}/status", json={
            "status": "shipped", "tracking_number": "TRK999", "carrier": "BlueDart",
        }, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["seller_fulfillment"]["status"] == "shipped"
        assert d["seller_fulfillment"]["tracking_number"] == "TRK999"

        # Buyer's own order fetch reflects the same transition under seller_status.
        mine = buyer.get(f"{API}/orders/{order['id']}", timeout=15).json()
        seller_id = list(mine["seller_status"].keys())[0]
        assert mine["seller_status"][seller_id]["status"] == "shipped"

    def test_other_seller_cannot_update_foreign_order(self, seller_and_product):
        seller, product = seller_and_product
        buyer = _new_buyer()
        buyer.post(f"{API}/cart/add", json={"product_id": product["id"], "quantity": 1, "variant_label": "100g"}, timeout=15)
        order = buyer.post(f"{API}/orders/checkout", json={
            "address": {"full_name": "B", "street": "S", "city": "C", "state": "DL", "zip": "110001"},
            "payment_method": "mock_cod",
        }, timeout=15).json()

        other_seller = _new_seller()
        r = other_seller.patch(f"{API}/seller/orders/{order['id']}/status", json={"status": "shipped"}, timeout=15)
        assert r.status_code == 403

    def test_invalid_seller_status_rejected(self, seller_and_product):
        seller, product = seller_and_product
        buyer = _new_buyer()
        buyer.post(f"{API}/cart/add", json={"product_id": product["id"], "quantity": 1, "variant_label": "100g"}, timeout=15)
        order = buyer.post(f"{API}/orders/checkout", json={
            "address": {"full_name": "B", "street": "S", "city": "C", "state": "DL", "zip": "110001"},
            "payment_method": "mock_cod",
        }, timeout=15).json()

        r = seller.patch(f"{API}/seller/orders/{order['id']}/status", json={"status": "teleported"}, timeout=15)
        assert r.status_code == 400


class TestGuestCheckoutSellerTracking:
    def test_guest_order_carries_seller_status(self, seller_and_product):
        seller, product = seller_and_product
        email = f"TEST_guesttrack_{uuid.uuid4().hex[:8]}@shop.com"
        payload = {
            "contact": {"name": "Guest T", "email": email, "phone": "9999999999"},
            "shipping_address": {"line1": "X", "city": "M", "state": "MH", "pincode": "400001"},
            "items": [{"product_id": product["id"], "quantity": 1, "variant_label": "100g"}],
            "payment_method": "mock_card",
        }
        order = requests.post(f"{API}/orders/guest/checkout", json=payload, timeout=15).json()
        seller_id = seller.get(f"{API}/auth/me", timeout=15).json()["id"]
        assert order["items"][0]["seller_id"] == seller_id
        assert order["seller_status"][seller_id]["status"] == "confirmed"


class TestAdminSellerGist:
    def test_non_admin_forbidden(self, seller_and_product):
        seller, _ = seller_and_product
        r = seller.get(f"{API}/admin/stats/sellers", timeout=15)
        assert r.status_code == 403

    def test_gist_reflects_orders_and_pending_fulfillments(self, admin, seller_and_product):
        seller, product = seller_and_product
        buyer = _new_buyer()
        buyer.post(f"{API}/cart/add", json={"product_id": product["id"], "quantity": 3, "variant_label": "100g"}, timeout=15)
        buyer.post(f"{API}/orders/checkout", json={
            "address": {"full_name": "B", "street": "S", "city": "C", "state": "DL", "zip": "110001"},
            "payment_method": "mock_cod",
        }, timeout=15)

        seller_id = seller.get(f"{API}/auth/me", timeout=15).json()["id"]
        gist = admin.get(f"{API}/admin/stats/sellers", timeout=15).json()
        row = next(s for s in gist["items"] if s["seller_id"] == seller_id)
        assert row["orders"] >= 1
        assert row["items_sold"] >= 3
        assert row["revenue"] >= 297.0
        assert row["pending_fulfillments"] >= 1  # freshly "confirmed", not yet delivered/cancelled
