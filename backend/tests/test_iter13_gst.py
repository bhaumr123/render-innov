"""Iteration 13 tests: mandatory seller GSTIN, per-product GST rate, and
GST-aware checkout totals (GST amount + shipping folded into the total)."""
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
VALID_GSTIN = "27AAAAA0000A1Z5"


@pytest.fixture(scope="module")
def admin():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=ADMIN, timeout=15)
    assert r.status_code == 200
    return s


def _register_seller(gst_number=VALID_GSTIN, **overrides):
    s = requests.Session()
    email = f"TEST_gstseller_{uuid.uuid4().hex[:8]}@shop.com"
    payload = {
        "email": email, "password": "SellerPass123", "name": "GST Seller", "role": "seller",
        "state": "Rajasthan", "city": "Jaipur", "gst_number": gst_number,
    }
    payload.update(overrides)
    r = s.post(f"{API}/auth/register", json=payload, timeout=15)
    return s, r


def _register_buyer(gst_number=""):
    s = requests.Session()
    email = f"TEST_gstbuyer_{uuid.uuid4().hex[:8]}@shop.com"
    payload = {"email": email, "password": "BuyerPass123", "name": "GST Buyer"}
    if gst_number:
        payload["gst_number"] = gst_number
    r = s.post(f"{API}/auth/register", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    return s


class TestGstNumberRegistration:
    def test_seller_without_gst_rejected(self):
        _, r = _register_seller(gst_number="")
        assert r.status_code == 422

    def test_seller_with_malformed_gst_rejected(self):
        _, r = _register_seller(gst_number="NOT-A-GSTIN")
        assert r.status_code == 422

    def test_seller_with_valid_gst_accepted(self):
        _, r = _register_seller()
        assert r.status_code == 200, r.text
        assert r.json()["gst_number"] == VALID_GSTIN

    def test_buyer_without_gst_accepted(self):
        s = _register_buyer()
        me = s.get(f"{API}/auth/me", timeout=15).json()
        assert me["gst_number"] == ""

    def test_buyer_with_valid_gst_accepted(self):
        s = _register_buyer(gst_number=VALID_GSTIN.lower())  # lowercase should normalize
        me = s.get(f"{API}/auth/me", timeout=15).json()
        assert me["gst_number"] == VALID_GSTIN

    def test_buyer_with_malformed_gst_rejected(self):
        s = requests.Session()
        email = f"TEST_gstbuyer_{uuid.uuid4().hex[:8]}@shop.com"
        r = s.post(f"{API}/auth/register", json={
            "email": email, "password": "BuyerPass123", "name": "B", "gst_number": "bad",
        }, timeout=15)
        assert r.status_code == 422


@pytest.fixture()
def seller_with_products(admin):
    seller, r = _register_seller()
    assert r.status_code == 200, r.text

    p5 = seller.post(f"{API}/products", json={
        "title": f"TEST_GST5 {uuid.uuid4().hex[:6]}",
        "image_url": "https://via.placeholder.com/200",
        "gst_rate": 5,
        "size_variants": [{"label": "100g", "price": 100.0, "stock": 50}],
    }, timeout=15).json()
    p18 = seller.post(f"{API}/products", json={
        "title": f"TEST_GST18 {uuid.uuid4().hex[:6]}",
        "image_url": "https://via.placeholder.com/200",
        "gst_rate": 18,
        "size_variants": [{"label": "100g", "price": 200.0, "stock": 50}],
    }, timeout=15).json()
    for p in (p5, p18):
        assert admin.patch(f"{API}/products/{p['id']}/approval", json={"approval_status": "approved"}, timeout=15).status_code == 200

    yield seller, p5, p18
    admin.delete(f"{API}/products/{p5['id']}")
    admin.delete(f"{API}/products/{p18['id']}")


class TestProductGstRate:
    def test_product_carries_selected_gst_rate(self, seller_with_products):
        _, p5, p18 = seller_with_products
        assert p5["gst_rate"] == 5.0
        assert p18["gst_rate"] == 18.0

    def test_invalid_gst_rate_falls_back_to_5(self, seller_with_products):
        seller, _, _ = seller_with_products
        r = seller.post(f"{API}/products", json={
            "title": f"TEST_GSTbad {uuid.uuid4().hex[:6]}",
            "image_url": "https://via.placeholder.com/200",
            "gst_rate": 12,  # not a supported rate
        }, timeout=15)
        assert r.status_code == 200
        assert r.json()["gst_rate"] == 5.0


class TestCheckoutGst:
    def test_authenticated_checkout_sums_per_item_gst_and_adds_shipping(self, seller_with_products):
        _, p5, p18 = seller_with_products
        buyer = _register_buyer()
        buyer.post(f"{API}/cart/add", json={"product_id": p5["id"], "quantity": 1, "variant_label": "100g"}, timeout=15)
        buyer.post(f"{API}/cart/add", json={"product_id": p18["id"], "quantity": 1, "variant_label": "100g"}, timeout=15)

        order = buyer.post(f"{API}/orders/checkout", json={
            "address": {"full_name": "GST Buyer", "street": "1 St", "city": "Delhi", "state": "DL", "zip": "110001", "phone": "9876543210"},
            "payment_method": "mock_card",
        }, timeout=15).json()

        assert order["subtotal"] == 300.0
        # 100 * 5% + 200 * 18% = 5 + 36 = 41
        assert order["tax"] == 41.0
        # subtotal (300) is above the free-shipping threshold, so shipping is 0 here;
        # what matters is that shipping is still folded into total either way.
        assert order["total"] == round(order["subtotal"] + order["tax"] + order["shipping"], 2)
        assert order["items"][0]["gst_rate"] in (5.0, 18.0)

    def test_guest_checkout_sums_per_item_gst(self, seller_with_products):
        _, p5, p18 = seller_with_products
        email = f"TEST_gstguest_{uuid.uuid4().hex[:8]}@shop.com"
        payload = {
            "contact": {"name": "Guest", "email": email, "phone": "9999999999"},
            "shipping_address": {"line1": "X", "city": "M", "state": "MH", "pincode": "400001"},
            "items": [
                {"product_id": p5["id"], "quantity": 2, "variant_label": "100g"},   # 200 subtotal, 5% -> 10
                {"product_id": p18["id"], "quantity": 1, "variant_label": "100g"},  # 200 subtotal, 18% -> 36
            ],
            "payment_method": "mock_card",
        }
        order = requests.post(f"{API}/orders/guest/checkout", json=payload, timeout=15).json()
        assert order["subtotal"] == 400.0
        assert order["tax"] == 46.0
        assert order["total"] == round(order["subtotal"] + order["tax"] + order["shipping"], 2)

    def test_shipping_is_included_in_total(self, seller_with_products):
        _, p5, _ = seller_with_products
        buyer = _register_buyer()
        # Single low-value item stays under the free-shipping threshold.
        buyer.post(f"{API}/cart/add", json={"product_id": p5["id"], "quantity": 1, "variant_label": "100g"}, timeout=15)
        order = buyer.post(f"{API}/orders/checkout", json={
            "address": {"full_name": "GST Buyer", "street": "1 St", "city": "Delhi", "state": "DL", "zip": "110001"},
            "payment_method": "mock_cod",
        }, timeout=15).json()
        assert order["shipping"] >= 0
        assert order["total"] == round(order["subtotal"] + order["tax"] + order["shipping"], 2)
        if order["shipping"] > 0:
            assert order["total"] > order["subtotal"] + order["tax"]
