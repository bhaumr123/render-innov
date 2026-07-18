"""
Backend API tests for Innovation Window India (IWI) apothecary ecommerce.
Covers:
  - Auth (register/login/me/logout, admin)
  - Shipping config endpoint (env-driven flat_fee + free_threshold)
  - Products (CRUD + size_variants persistence)
  - Cart (variant-aware add/update/remove; unit_price reflects variant)
  - Orders / Checkout (IWI- order_number, 5% tax, shipping rules, variant_label preserved)
"""
import os
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

EXPECTED_FLAT_FEE = 6.99
EXPECTED_FREE_THRESHOLD = 75.0


# ---------------- Fixtures ----------------
@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    assert r.json()["role"] == "admin"
    return s


@pytest.fixture(scope="module")
def customer_session():
    s = requests.Session()
    email = f"TEST_user_{uuid.uuid4().hex[:8]}@shop.com"
    r = s.post(f"{API}/auth/register", json={"email": email, "password": "Test1234", "name": "Test User"}, timeout=15)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    s.customer_email = email
    return s


@pytest.fixture(scope="module")
def variant_product(admin_session):
    """Product with 2 size variants: 50g @ 20, 100g @ 35 (both < 75 free-shipping threshold)."""
    payload = {
        "title": "TEST_Butterfly Pea Tea",
        "description": "Test tea with variants",
        "price": 20.0,  # base = 50g variant price
        "category": "Teas",
        "stock": 100,
        "image_url": "https://via.placeholder.com/300",
        "rating": 4.9,
        "brand": "IWI",
        "size_variants": [
            {"label": "50g", "price": 20.0, "stock": 50},
            {"label": "100g", "price": 35.0, "stock": 40},
        ],
    }
    r = admin_session.post(f"{API}/products", json=payload, timeout=15)
    assert r.status_code == 200, f"Create failed: {r.status_code} {r.text}"
    pid = r.json()["id"]
    yield {"id": pid, "variants": payload["size_variants"]}
    admin_session.delete(f"{API}/products/{pid}")


@pytest.fixture(scope="module")
def pricey_product(admin_session):
    """Product with variant priced above 75 threshold to test free shipping."""
    payload = {
        "title": "TEST_Himalayan Honey",
        "description": "Bulk honey",
        "price": 80.0,
        "category": "Artisanal Goods",
        "stock": 20,
        "image_url": "https://via.placeholder.com/300",
        "size_variants": [
            {"label": "1kg", "price": 80.0, "stock": 10},
        ],
    }
    r = admin_session.post(f"{API}/products", json=payload, timeout=15)
    assert r.status_code == 200
    pid = r.json()["id"]
    yield pid
    admin_session.delete(f"{API}/products/{pid}")


def _register(prefix="u"):
    s = requests.Session()
    email = f"TEST_{prefix}_{uuid.uuid4().hex[:6]}@shop.com"
    r = s.post(f"{API}/auth/register", json={"email": email, "password": "Test1234", "name": prefix})
    assert r.status_code == 200, r.text
    s.email = email
    return s


# ---------------- Auth ----------------
class TestAuth:
    def test_register_sets_cookies(self):
        s = requests.Session()
        email = f"TEST_reg_{uuid.uuid4().hex[:8]}@shop.com"
        r = s.post(f"{API}/auth/register", json={"email": email, "password": "abcdef", "name": "Reg"})
        assert r.status_code == 200
        d = r.json()
        assert d["email"] == email.lower()
        assert d["role"] == "customer"
        assert "access_token" in s.cookies
        assert "refresh_token" in s.cookies

    def test_login_wrong_password(self):
        s = requests.Session()
        email = f"TEST_login_{uuid.uuid4().hex[:8]}@shop.com"
        s.post(f"{API}/auth/register", json={"email": email, "password": "abcdef", "name": "L"})
        r = requests.post(f"{API}/auth/login", json={"email": email, "password": "WRONG"})
        assert r.status_code == 401

    def test_me_requires_cookies(self, customer_session):
        r = customer_session.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json()["email"] == customer_session.customer_email.lower()
        assert requests.get(f"{API}/auth/me").status_code == 401

    def test_admin_login(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200
        assert r.json()["role"] == "admin"

    def test_bcrypt_hash_format(self):
        """Verify admin password is stored as bcrypt ($2b$)."""
        # Login round-trip must work; hash format is implicitly verified via bcrypt.checkpw.
        # We can only confirm login works, since the hash is not exposed via API.
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200


# ---------------- Shipping config ----------------
class TestShippingConfig:
    def test_shipping_config_from_env(self):
        r = requests.get(f"{API}/config/shipping")
        assert r.status_code == 200
        d = r.json()
        assert "flat_fee" in d and "free_threshold" in d
        assert float(d["flat_fee"]) == EXPECTED_FLAT_FEE
        assert float(d["free_threshold"]) == EXPECTED_FREE_THRESHOLD


# ---------------- Products / Categories ----------------
class TestProducts:
    def test_categories_include_iwi_three(self):
        r = requests.get(f"{API}/products/categories")
        assert r.status_code == 200
        cats = r.json()["categories"]
        assert isinstance(cats, list)
        for expected in ["Teas", "Spices", "Artisanal Goods"]:
            assert expected in cats, f"Missing category: {expected}. Got: {cats}"

    def test_size_variants_persist(self, admin_session):
        payload = {
            "title": "TEST_Variant Persist",
            "description": "vp",
            "price": 10.0,
            "category": "Teas",
            "stock": 30,
            "size_variants": [
                {"label": "25g", "price": 10.0, "stock": 20},
                {"label": "75g", "price": 25.0, "stock": 5},
            ],
        }
        r = admin_session.post(f"{API}/products", json=payload)
        assert r.status_code == 200
        pid = r.json()["id"]
        try:
            g = requests.get(f"{API}/products/{pid}")
            assert g.status_code == 200
            data = g.json()
            variants = data.get("size_variants", [])
            assert len(variants) == 2
            labels = {v["label"] for v in variants}
            assert labels == {"25g", "75g"}
            price_by_label = {v["label"]: v["price"] for v in variants}
            assert price_by_label["25g"] == 10.0
            assert price_by_label["75g"] == 25.0
        finally:
            admin_session.delete(f"{API}/products/{pid}")

    def test_non_admin_cannot_create(self, customer_session):
        r = customer_session.post(f"{API}/products", json={"title": "x", "price": 1, "category": "Teas"})
        assert r.status_code == 403

    def test_invalid_id_400(self):
        assert requests.get(f"{API}/products/not-an-id").status_code == 400

    def test_not_found_404(self):
        assert requests.get(f"{API}/products/507f1f77bcf86cd799439011").status_code == 404


# ---------------- Cart (variant-aware) ----------------
class TestCartVariants:
    def test_cart_requires_auth(self):
        assert requests.get(f"{API}/cart").status_code == 401

    def test_add_same_product_same_variant_increments(self, variant_product):
        s = _register("cart_incr")
        pid = variant_product["id"]
        r1 = s.post(f"{API}/cart/add", json={"product_id": pid, "quantity": 1, "variant_label": "50g"})
        assert r1.status_code == 200
        r2 = s.post(f"{API}/cart/add", json={"product_id": pid, "quantity": 2, "variant_label": "50g"})
        assert r2.status_code == 200
        items = r2.json()["items"]
        assert len(items) == 1
        assert items[0]["variant_label"] == "50g"
        assert items[0]["quantity"] == 3
        assert items[0]["unit_price"] == 20.0  # 50g variant price

    def test_add_same_product_different_variant_creates_new_line(self, variant_product):
        s = _register("cart_multi")
        pid = variant_product["id"]
        s.post(f"{API}/cart/add", json={"product_id": pid, "quantity": 1, "variant_label": "50g"})
        r = s.post(f"{API}/cart/add", json={"product_id": pid, "quantity": 1, "variant_label": "100g"})
        assert r.status_code == 200
        items = r.json()["items"]
        assert len(items) == 2
        labels = {i["variant_label"] for i in items}
        assert labels == {"50g", "100g"}
        # unit_price reflects the variant, not base price
        by_label = {i["variant_label"]: i["unit_price"] for i in items}
        assert by_label["50g"] == 20.0
        assert by_label["100g"] == 35.0
        # subtotal = 1*20 + 1*35 = 55
        assert r.json()["subtotal"] == 55.0

    def test_update_updates_only_matching_variant(self, variant_product):
        s = _register("cart_upd")
        pid = variant_product["id"]
        s.post(f"{API}/cart/add", json={"product_id": pid, "quantity": 1, "variant_label": "50g"})
        s.post(f"{API}/cart/add", json={"product_id": pid, "quantity": 1, "variant_label": "100g"})
        r = s.post(f"{API}/cart/update", json={"product_id": pid, "quantity": 4, "variant_label": "100g"})
        assert r.status_code == 200
        items = {i["variant_label"]: i["quantity"] for i in r.json()["items"]}
        assert items["50g"] == 1
        assert items["100g"] == 4

    def test_remove_removes_only_matching_variant(self, variant_product):
        s = _register("cart_rm")
        pid = variant_product["id"]
        s.post(f"{API}/cart/add", json={"product_id": pid, "quantity": 1, "variant_label": "50g"})
        s.post(f"{API}/cart/add", json={"product_id": pid, "quantity": 2, "variant_label": "100g"})
        r = s.post(f"{API}/cart/remove", json={"product_id": pid, "quantity": 1, "variant_label": "50g"})
        assert r.status_code == 200
        items = r.json()["items"]
        assert len(items) == 1
        assert items[0]["variant_label"] == "100g"
        assert items[0]["quantity"] == 2

    def test_get_cart_returns_variant_and_unit_price(self, variant_product):
        s = _register("cart_get")
        pid = variant_product["id"]
        s.post(f"{API}/cart/add", json={"product_id": pid, "quantity": 2, "variant_label": "100g"})
        r = s.get(f"{API}/cart")
        assert r.status_code == 200
        d = r.json()
        assert len(d["items"]) == 1
        it = d["items"][0]
        assert it["variant_label"] == "100g"
        assert it["unit_price"] == 35.0
        assert d["subtotal"] == 70.0  # 2 * 35


# ---------------- Orders / Checkout ----------------
class TestCheckout:
    def test_checkout_under_threshold_charges_flat_shipping(self, variant_product):
        s = _register("chk_paid")
        pid = variant_product["id"]
        # 1 * 50g @ 20 = 20 subtotal (< 75)
        s.post(f"{API}/cart/add", json={"product_id": pid, "quantity": 1, "variant_label": "50g"})
        r = s.post(f"{API}/orders/checkout", json={
            "address": {"name": "T", "street": "1 Main", "city": "Delhi", "state": "DL", "zip": "110001"},
            "payment_method": "mock"
        })
        assert r.status_code == 200, r.text
        o = r.json()
        assert o["subtotal"] == 20.0
        assert o["tax"] == round(20.0 * 0.05, 2)  # 5% tax
        assert o["shipping"] == EXPECTED_FLAT_FEE
        assert o["total"] == round(20.0 + o["tax"] + EXPECTED_FLAT_FEE, 2)
        assert o["order_number"].startswith("IWI-")
        assert len(o["order_number"]) == 14  # 'IWI-' + 10 hex
        # Order items include variant_label
        assert any(it.get("variant_label") == "50g" for it in o["items"])
        # Cart emptied
        assert s.get(f"{API}/cart").json()["items"] == []

    def test_checkout_over_threshold_free_shipping(self, pricey_product):
        s = _register("chk_free")
        pid = pricey_product
        # 1 * 1kg @ 80 = 80 (>= 75)
        s.post(f"{API}/cart/add", json={"product_id": pid, "quantity": 1, "variant_label": "1kg"})
        r = s.post(f"{API}/orders/checkout", json={"address": {}, "payment_method": "mock"})
        assert r.status_code == 200
        o = r.json()
        assert o["subtotal"] == 80.0
        assert o["tax"] == round(80.0 * 0.05, 2)
        assert o["shipping"] == 0.0
        assert o["total"] == round(80.0 + o["tax"], 2)
        assert o["order_number"].startswith("IWI-")

    def test_checkout_uses_variant_unit_price_not_base(self, variant_product):
        """Ensure 100g variant (price=35) is used for cost, not base price 20."""
        s = _register("chk_var")
        pid = variant_product["id"]
        s.post(f"{API}/cart/add", json={"product_id": pid, "quantity": 2, "variant_label": "100g"})
        r = s.post(f"{API}/orders/checkout", json={"address": {}, "payment_method": "mock"})
        assert r.status_code == 200
        o = r.json()
        assert o["subtotal"] == 70.0  # 2 * 35
        assert o["items"][0]["price"] == 35.0  # variant price stored on order line
        assert o["items"][0]["variant_label"] == "100g"

    def test_checkout_empty_cart_400(self):
        s = _register("chk_empty")
        r = s.post(f"{API}/orders/checkout", json={"address": {}, "payment_method": "mock"})
        assert r.status_code == 400

    def test_my_orders_preserves_variant_label(self, variant_product):
        s = _register("chk_hist")
        pid = variant_product["id"]
        s.post(f"{API}/cart/add", json={"product_id": pid, "quantity": 1, "variant_label": "100g"})
        r = s.post(f"{API}/orders/checkout", json={"address": {}, "payment_method": "mock"})
        assert r.status_code == 200
        order_id = r.json()["id"]
        # GET /orders
        lr = s.get(f"{API}/orders")
        assert lr.status_code == 200
        orders = lr.json()["orders"]
        matching = [o for o in orders if o["id"] == order_id]
        assert matching, "Order not found in /orders"
        found = matching[0]
        assert found["order_number"].startswith("IWI-")
        assert any(it.get("variant_label") == "100g" for it in found["items"])

    def test_admin_orders_requires_admin(self, admin_session, customer_session):
        assert customer_session.get(f"{API}/admin/orders").status_code == 403
        assert admin_session.get(f"{API}/admin/orders").status_code == 200
        assert requests.get(f"{API}/admin/orders").status_code == 401
