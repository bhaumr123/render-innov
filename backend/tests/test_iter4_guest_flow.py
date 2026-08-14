"""Iteration 4 tests: guest checkout, guest lookup, cart merge, razorpay config."""
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


@pytest.fixture(scope="module")
def product(admin):
    payload = {
        "title": "TEST_Guest Product",
        "description": "guest",
        "price": 25.0,
        "category": "Teas",
        "stock": 100,
        "image_url": "https://via.placeholder.com/300",
    }
    r = admin.post(f"{API}/products", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    pid = r.json()["id"]
    yield pid
    admin.delete(f"{API}/products/{pid}")


# ---------- Razorpay config ----------
def test_razorpay_config_enabled():
    r = requests.get(f"{API}/config/razorpay")
    assert r.status_code == 200
    d = r.json()
    assert d.get("enabled") is True, f"Razorpay should be enabled, got {d}"
    assert d.get("key_id"), "key_id should be non-empty"


# ---------- Guest checkout (mock_card) ----------
def test_guest_checkout_mock_card_end_to_end(product):
    email = f"TEST_guest_{uuid.uuid4().hex[:8]}@shop.com"
    payload = {
        "contact": {"name": "Guest User", "email": email, "phone": "9999999999"},
        "shipping_address": {
            "line1": "123 Main", "line2": "", "city": "Mumbai",
            "state": "MH", "pincode": "400001", "country": "India"
        },
        "billing_same_as_shipping": True,
        "items": [{"product_id": product, "quantity": 2, "variant_label": ""}],
        "payment_method": "mock_card",
    }
    r = requests.post(f"{API}/orders/guest/checkout", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    o = r.json()
    assert o["order_number"].startswith("IWI-")
    assert o["subtotal"] == 50.0
    assert o["tax"] == 2.5
    assert o["shipping"] == 6.99  # under 75
    assert o["total"] == round(50.0 + 2.5 + 6.99, 2)
    assert o["status"] == "confirmed"
    assert o["guest"] is True
    assert o["contact"]["email"] == email.lower() or o["contact"]["email"] == email
    assert o["billing_address"] == o["shipping_address"]
    assert "guest_access_token" in o
    order_id = o["id"]
    token = o["guest_access_token"]

    # GET guest order using token
    g = requests.get(f"{API}/orders/guest/{order_id}?t={token}", timeout=15)
    assert g.status_code == 200
    assert g.json()["order_number"] == o["order_number"]

    # Wrong token → 404
    g2 = requests.get(f"{API}/orders/guest/{order_id}?t=badtokenXXXXXXXX", timeout=15)
    assert g2.status_code == 404


def test_guest_checkout_separate_billing_address(product):
    email = f"TEST_guestB_{uuid.uuid4().hex[:8]}@shop.com"
    payload = {
        "contact": {"name": "Guest", "email": email, "phone": "9999999999"},
        "shipping_address": {"line1": "A", "city": "Mumbai", "state": "MH", "pincode": "400001"},
        "billing_same_as_shipping": False,
        "billing_address": {"line1": "B", "city": "Pune", "state": "MH", "pincode": "411001"},
        "items": [{"product_id": product, "quantity": 1}],
        "payment_method": "mock_cod",
    }
    r = requests.post(f"{API}/orders/guest/checkout", json=payload)
    assert r.status_code == 200, r.text
    o = r.json()
    assert o["billing_address"]["line1"] == "B"
    assert o["shipping_address"]["line1"] == "A"


def test_guest_lookup_success_and_wrong_email(product):
    email = f"TEST_lk_{uuid.uuid4().hex[:8]}@shop.com"
    r = requests.post(f"{API}/orders/guest/checkout", json={
        "contact": {"name": "L", "email": email, "phone": "9999999999"},
        "shipping_address": {"line1": "A", "city": "M", "state": "MH", "pincode": "400001"},
        "items": [{"product_id": product, "quantity": 1}],
        "payment_method": "mock_card",
    })
    assert r.status_code == 200
    ord_num = r.json()["order_number"]

    ok = requests.post(f"{API}/orders/guest/lookup", json={"order_number": ord_num, "email": email})
    assert ok.status_code == 200
    assert ok.json()["order_number"] == ord_num
    assert "guest_access_token" in ok.json()

    bad = requests.post(f"{API}/orders/guest/lookup",
                       json={"order_number": ord_num, "email": "wrong@example.com"})
    assert bad.status_code == 404


def test_guest_razorpay_create_returns_order_id(product):
    """Should hit real Razorpay test API and return a rzp order id (keys are configured)."""
    email = f"TEST_grzp_{uuid.uuid4().hex[:8]}@shop.com"
    payload = {
        "contact": {"name": "G", "email": email, "phone": "9999999999"},
        "shipping_address": {"line1": "X", "city": "M", "state": "MH", "pincode": "400001"},
        "items": [{"product_id": product, "quantity": 1}],
        "payment_method": "razorpay",
    }
    r = requests.post(f"{API}/orders/guest/create-razorpay", json=payload, timeout=30)
    # Accept 200 (keys valid) or 502 (rzp API failed) — but NOT 503 (not configured)
    assert r.status_code != 503, f"Razorpay reported not-configured: {r.text}"
    if r.status_code == 200:
        d = r.json()
        assert d["razorpay_order_id"].startswith("order_")
        assert d["currency"] == "INR"
        assert d["amount"] > 0
        assert "guest_access_token" in d
        assert d["key_id"]
    else:
        pytest.skip(f"Razorpay upstream returned {r.status_code}: {r.text}")


# ---------- Cart merge (guest → authed) ----------
def test_cart_merge_endpoint(product):
    s = requests.Session()
    email = f"TEST_merge_{uuid.uuid4().hex[:8]}@shop.com"
    r = s.post(f"{API}/auth/register", json={"email": email, "password": "Test1234", "name": "M"})
    assert r.status_code == 200
    # server cart should be empty
    assert s.get(f"{API}/cart").json()["items"] == []

    # Merge 3 units of the product
    m = s.post(f"{API}/cart/merge", json={
        "items": [{"product_id": product, "quantity": 3, "variant_label": ""}]
    })
    assert m.status_code == 200, m.text
    items = m.json()["items"]
    assert len(items) == 1
    assert items[0]["product_id"] == product
    assert items[0]["quantity"] == 3

    # Merge again → quantities are additive
    m2 = s.post(f"{API}/cart/merge", json={
        "items": [{"product_id": product, "quantity": 2, "variant_label": ""}]
    })
    assert m2.status_code == 200
    items2 = m2.json()["items"]
    assert items2[0]["quantity"] == 5


def test_cart_merge_requires_auth():
    r = requests.post(f"{API}/cart/merge", json={"items": []})
    assert r.status_code == 401


# ---------- Guest add-to-cart route existence check ----------
def test_guest_checkout_empty_cart():
    r = requests.post(f"{API}/orders/guest/checkout", json={
        "contact": {"name": "G", "email": "a@b.com", "phone": "9999999999"},
        "shipping_address": {"line1": "X", "city": "M", "state": "MH", "pincode": "400001"},
        "items": [],
        "payment_method": "mock_card",
    })
    assert r.status_code == 400
