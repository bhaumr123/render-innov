"""
Backend API tests for ShopKart ecommerce MVP.
Covers: auth (register/login/me/logout), products (CRUD + filters), cart, orders (checkout), admin.
"""
import os
import time
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    # Fallback: read from frontend/.env
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


# ---------------- Fixtures ----------------
@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    data = r.json()
    assert data["role"] == "admin"
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
def sample_product_id(admin_session):
    """Create a product as admin and return id. Cleaned up module teardown."""
    payload = {
        "title": "TEST_Sample Widget",
        "description": "Sample product for tests",
        "price": 40.00,  # over 35 to trigger free shipping tests
        "category": "TEST_Cat",
        "stock": 100,
        "image_url": "https://via.placeholder.com/300",
        "rating": 4.7,
        "brand": "TEST_Brand",
    }
    r = admin_session.post(f"{API}/products", json=payload, timeout=15)
    assert r.status_code == 200, f"Create product failed: {r.status_code} {r.text}"
    pid = r.json()["id"]
    yield pid
    # cleanup
    admin_session.delete(f"{API}/products/{pid}")


# ---------------- Auth ----------------
class TestAuth:
    def test_register_creates_customer_and_sets_cookies(self):
        s = requests.Session()
        email = f"TEST_reg_{uuid.uuid4().hex[:8]}@shop.com"
        r = s.post(f"{API}/auth/register", json={"email": email, "password": "abcdef", "name": "Reg User"})
        assert r.status_code == 200
        d = r.json()
        assert d["email"] == email.lower()
        assert d["role"] == "customer"
        assert d["name"] == "Reg User"
        assert "access_token" in s.cookies
        assert "refresh_token" in s.cookies

    def test_register_duplicate_returns_400(self):
        s = requests.Session()
        email = f"TEST_dup_{uuid.uuid4().hex[:8]}@shop.com"
        r1 = s.post(f"{API}/auth/register", json={"email": email, "password": "abcdef", "name": "Dup"})
        assert r1.status_code == 200
        r2 = requests.post(f"{API}/auth/register", json={"email": email, "password": "abcdef", "name": "Dup"})
        assert r2.status_code == 400

    def test_login_success_and_wrong_password(self):
        s = requests.Session()
        email = f"TEST_login_{uuid.uuid4().hex[:8]}@shop.com"
        s.post(f"{API}/auth/register", json={"email": email, "password": "abcdef", "name": "L"})
        s2 = requests.Session()
        r = s2.post(f"{API}/auth/login", json={"email": email, "password": "abcdef"})
        assert r.status_code == 200
        assert "access_token" in s2.cookies
        r2 = requests.post(f"{API}/auth/login", json={"email": email, "password": "wrongpw"})
        assert r2.status_code == 401

    def test_me_requires_cookies(self, customer_session):
        r = customer_session.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json()["email"] == customer_session.customer_email.lower()
        # without cookies
        r2 = requests.get(f"{API}/auth/me")
        assert r2.status_code == 401

    def test_logout_clears_cookies(self):
        s = requests.Session()
        email = f"TEST_lo_{uuid.uuid4().hex[:8]}@shop.com"
        s.post(f"{API}/auth/register", json={"email": email, "password": "abcdef", "name": "LO"})
        assert s.get(f"{API}/auth/me").status_code == 200
        rlo = s.post(f"{API}/auth/logout")
        assert rlo.status_code == 200
        # Server should have deleted cookies; requests session should reflect
        # After delete_cookie the Set-Cookie has max-age=0; requests may drop them.
        r_me = s.get(f"{API}/auth/me")
        assert r_me.status_code == 401

    def test_admin_login(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200
        assert r.json()["role"] == "admin"


# ---------------- Products ----------------
class TestProducts:
    def test_non_admin_cannot_create(self, customer_session):
        r = customer_session.post(f"{API}/products", json={"title": "x", "price": 1, "category": "c"})
        assert r.status_code == 403

    def test_unauth_cannot_create(self):
        r = requests.post(f"{API}/products", json={"title": "x", "price": 1, "category": "c"})
        assert r.status_code == 401

    def test_admin_can_create_update_delete(self, admin_session):
        payload = {"title": "TEST_CRUD", "description": "d", "price": 10.5,
                   "category": "TEST_Cat2", "stock": 5, "image_url": "http://x"}
        r = admin_session.post(f"{API}/products", json=payload)
        assert r.status_code == 200
        pid = r.json()["id"]

        # Get
        g = requests.get(f"{API}/products/{pid}")
        assert g.status_code == 200
        assert g.json()["title"] == "TEST_CRUD"

        # Update
        payload2 = {**payload, "title": "TEST_CRUD_UPD", "price": 12.0}
        u = admin_session.put(f"{API}/products/{pid}", json=payload2)
        assert u.status_code == 200
        assert u.json()["title"] == "TEST_CRUD_UPD"
        assert u.json()["price"] == 12.0

        # Non-admin cannot update/delete
        cs = requests.Session()
        email = f"TEST_ncust_{uuid.uuid4().hex[:6]}@shop.com"
        cs.post(f"{API}/auth/register", json={"email": email, "password": "abcdef", "name": "N"})
        assert cs.put(f"{API}/products/{pid}", json=payload2).status_code == 403
        assert cs.delete(f"{API}/products/{pid}").status_code == 403

        # Delete
        d = admin_session.delete(f"{API}/products/{pid}")
        assert d.status_code == 200
        assert requests.get(f"{API}/products/{pid}").status_code == 404

    def test_invalid_id_returns_400(self):
        r = requests.get(f"{API}/products/not-an-id")
        assert r.status_code == 400

    def test_not_found_returns_404(self):
        r = requests.get(f"{API}/products/507f1f77bcf86cd799439011")
        assert r.status_code == 404

    def test_categories_endpoint(self, sample_product_id):
        r = requests.get(f"{API}/products/categories")
        assert r.status_code == 200
        cats = r.json()["categories"]
        assert isinstance(cats, list)
        assert "TEST_Cat" in cats

    def test_list_filters_and_sort(self, admin_session, sample_product_id):
        # Create additional products with different prices/categories
        p2 = admin_session.post(f"{API}/products", json={
            "title": "TEST_Cheap", "price": 5.0, "category": "TEST_Cat", "rating": 4.9}).json()
        p3 = admin_session.post(f"{API}/products", json={
            "title": "TEST_Pricey", "price": 200.0, "category": "TEST_Cat", "rating": 4.0}).json()
        try:
            # q filter
            r = requests.get(f"{API}/products", params={"q": "TEST_Cheap"})
            assert r.status_code == 200
            titles = [i["title"] for i in r.json()["items"]]
            assert "TEST_Cheap" in titles

            # category filter
            r = requests.get(f"{API}/products", params={"category": "TEST_Cat"})
            titles = [i["title"] for i in r.json()["items"]]
            assert "TEST_Cheap" in titles and "TEST_Pricey" in titles

            # min/max price
            r = requests.get(f"{API}/products", params={"category": "TEST_Cat", "min_price": 10, "max_price": 100})
            titles = [i["title"] for i in r.json()["items"]]
            assert "TEST_Cheap" not in titles
            assert "TEST_Pricey" not in titles

            # sort price_asc
            r = requests.get(f"{API}/products", params={"category": "TEST_Cat", "sort": "price_asc"})
            prices = [i["price"] for i in r.json()["items"]]
            assert prices == sorted(prices)

            # sort price_desc
            r = requests.get(f"{API}/products", params={"category": "TEST_Cat", "sort": "price_desc"})
            prices = [i["price"] for i in r.json()["items"]]
            assert prices == sorted(prices, reverse=True)

            # sort rating (descending)
            r = requests.get(f"{API}/products", params={"category": "TEST_Cat", "sort": "rating"})
            ratings = [i["rating"] for i in r.json()["items"]]
            assert ratings == sorted(ratings, reverse=True)
        finally:
            admin_session.delete(f"{API}/products/{p2['id']}")
            admin_session.delete(f"{API}/products/{p3['id']}")


# ---------------- Cart ----------------
class TestCart:
    def test_cart_requires_auth(self):
        assert requests.get(f"{API}/cart").status_code == 401
        assert requests.post(f"{API}/cart/add", json={"product_id": "x"}).status_code == 401

    def test_cart_add_update_remove_clear(self, sample_product_id):
        s = requests.Session()
        email = f"TEST_cart_{uuid.uuid4().hex[:6]}@shop.com"
        s.post(f"{API}/auth/register", json={"email": email, "password": "abcdef", "name": "C"})

        # Start with clear cart
        s.post(f"{API}/cart/clear")

        # Add
        r = s.post(f"{API}/cart/add", json={"product_id": sample_product_id, "quantity": 2})
        assert r.status_code == 200
        d = r.json()
        assert len(d["items"]) == 1
        assert d["items"][0]["quantity"] == 2
        assert d["items"][0]["product"]["id"] == sample_product_id
        assert d["subtotal"] == round(40.0 * 2, 2)

        # GET cart
        g = s.get(f"{API}/cart")
        assert g.status_code == 200
        assert g.json()["subtotal"] == 80.0

        # Update
        u = s.post(f"{API}/cart/update", json={"product_id": sample_product_id, "quantity": 3})
        assert u.status_code == 200
        assert u.json()["items"][0]["quantity"] == 3

        # Remove
        rm = s.post(f"{API}/cart/remove", json={"product_id": sample_product_id, "quantity": 1})
        assert rm.status_code == 200
        assert rm.json()["items"] == []

        # Clear
        s.post(f"{API}/cart/add", json={"product_id": sample_product_id, "quantity": 1})
        c = s.post(f"{API}/cart/clear")
        assert c.status_code == 200
        assert c.json()["items"] == []

    def test_add_invalid_product(self):
        s = requests.Session()
        email = f"TEST_c2_{uuid.uuid4().hex[:6]}@shop.com"
        s.post(f"{API}/auth/register", json={"email": email, "password": "abcdef", "name": "C2"})
        r = s.post(f"{API}/cart/add", json={"product_id": "not-an-id", "quantity": 1})
        assert r.status_code == 400
        r2 = s.post(f"{API}/cart/add", json={"product_id": "507f1f77bcf86cd799439011", "quantity": 1})
        assert r2.status_code == 404


# ---------------- Orders / Checkout ----------------
class TestOrders:
    def test_checkout_free_shipping_over_35(self, sample_product_id):
        s = requests.Session()
        email = f"TEST_ord1_{uuid.uuid4().hex[:6]}@shop.com"
        s.post(f"{API}/auth/register", json={"email": email, "password": "abcdef", "name": "O"})
        s.post(f"{API}/cart/clear")
        s.post(f"{API}/cart/add", json={"product_id": sample_product_id, "quantity": 1})  # $40
        r = s.post(f"{API}/orders/checkout", json={
            "address": {"name": "T", "street": "1 x", "city": "Y", "state": "Z", "zip": "111"},
            "payment_method": "mock"
        })
        assert r.status_code == 200, r.text
        o = r.json()
        assert o["subtotal"] == 40.0
        assert o["tax"] == round(40.0 * 0.08, 2)
        assert o["shipping"] == 0
        assert o["total"] == round(40.0 + o["tax"], 2)
        assert o["order_number"].startswith("SK-") and len(o["order_number"]) == 13
        # Cart should be empty
        assert s.get(f"{API}/cart").json()["items"] == []

    def test_checkout_shipping_under_35(self, admin_session):
        # create cheap product
        cheap = admin_session.post(f"{API}/products", json={
            "title": "TEST_CheapItem", "price": 10.0, "category": "TEST_Cat3"}).json()
        pid = cheap["id"]
        try:
            s = requests.Session()
            email = f"TEST_ord2_{uuid.uuid4().hex[:6]}@shop.com"
            s.post(f"{API}/auth/register", json={"email": email, "password": "abcdef", "name": "O2"})
            s.post(f"{API}/cart/add", json={"product_id": pid, "quantity": 1})  # $10
            r = s.post(f"{API}/orders/checkout", json={"address": {"a": 1}, "payment_method": "mock"})
            assert r.status_code == 200
            o = r.json()
            assert o["shipping"] == 4.99
            assert o["subtotal"] == 10.0
            assert o["total"] == round(10.0 + o["tax"] + 4.99, 2)
        finally:
            admin_session.delete(f"{API}/products/{pid}")

    def test_checkout_empty_cart(self):
        s = requests.Session()
        email = f"TEST_ord3_{uuid.uuid4().hex[:6]}@shop.com"
        s.post(f"{API}/auth/register", json={"email": email, "password": "abcdef", "name": "O3"})
        r = s.post(f"{API}/orders/checkout", json={"address": {}, "payment_method": "mock"})
        assert r.status_code == 400

    def test_my_orders_isolated(self, sample_product_id):
        # Two users each place an order; each only sees their own
        sA = requests.Session()
        sB = requests.Session()
        emailA = f"TEST_iA_{uuid.uuid4().hex[:6]}@shop.com"
        emailB = f"TEST_iB_{uuid.uuid4().hex[:6]}@shop.com"
        sA.post(f"{API}/auth/register", json={"email": emailA, "password": "abcdef", "name": "A"})
        sB.post(f"{API}/auth/register", json={"email": emailB, "password": "abcdef", "name": "B"})
        for s in (sA, sB):
            s.post(f"{API}/cart/add", json={"product_id": sample_product_id, "quantity": 1})
            r = s.post(f"{API}/orders/checkout", json={"address": {}, "payment_method": "mock"})
            assert r.status_code == 200
        listA = sA.get(f"{API}/orders").json()["orders"]
        listB = sB.get(f"{API}/orders").json()["orders"]
        assert len(listA) >= 1
        assert all(o["user_id"] for o in listA)
        # A should not see B's user_ids
        A_uids = {o["user_id"] for o in listA}
        B_uids = {o["user_id"] for o in listB}
        assert A_uids != B_uids or len(A_uids) == 1  # different users' orders isolated
        # Cross verify B's order not in listA
        listB_ids = {o["id"] for o in listB}
        listA_ids = {o["id"] for o in listA}
        assert listA_ids.isdisjoint(listB_ids)

    def test_admin_orders_requires_admin(self, admin_session, customer_session):
        r = customer_session.get(f"{API}/admin/orders")
        assert r.status_code == 403
        r2 = admin_session.get(f"{API}/admin/orders")
        assert r2.status_code == 200
        assert "orders" in r2.json()
        r3 = requests.get(f"{API}/admin/orders")
        assert r3.status_code == 401
