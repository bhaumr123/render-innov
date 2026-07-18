from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import logging
import uuid
import bcrypt
import hmac
import hashlib
import jwt
import razorpay
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Annotated
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, Query
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from pydantic import BaseModel, Field, EmailStr, ConfigDict, BeforeValidator


# ---------- MongoDB ----------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI(title="ShopKart API")
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

JWT_ALGORITHM = "HS256"


def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


# ---------- Password / JWT helpers ----------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id, "email": email, "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=24),
        "type": "access",
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "refresh",
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def set_auth_cookies(response: Response, access_token: str, refresh_token: str):
    secure = os.environ.get("COOKIE_SECURE", "true").lower() == "true"
    response.set_cookie("access_token", access_token, httponly=True, secure=secure,
                        samesite="lax", max_age=60 * 60 * 24, path="/")
    response.set_cookie("refresh_token", refresh_token, httponly=True, secure=secure,
                        samesite="lax", max_age=60 * 60 * 24 * 7, path="/")


# ---------- Razorpay ----------
def get_razorpay_client() -> Optional["razorpay.Client"]:
    key_id = os.environ.get("RAZORPAY_KEY_ID", "")
    key_secret = os.environ.get("RAZORPAY_KEY_SECRET", "")
    if not key_id or not key_secret:
        return None
    return razorpay.Client(auth=(key_id, key_secret))


# ---------- Models ----------
PyObjectId = Annotated[str, BeforeValidator(lambda v: str(v) if isinstance(v, ObjectId) else v)]


class RegisterInput(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str = Field(min_length=1, max_length=80)


class LoginInput(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    email: EmailStr
    name: str
    role: str


class ProductIn(BaseModel):
    title: str
    description: str = ""
    price: float
    category: str
    stock: int = 100
    image_url: str = ""
    images: List[str] = []
    rating: float = 4.9
    reviews_count: int = 0
    brand: str = "IWI"
    size_variants: List[dict] = []  # [{"label":"50g","price":12.0,"stock":50}]


class ProductOut(ProductIn):
    id: str
    created_at: str


class CartItemIn(BaseModel):
    product_id: str
    quantity: int = 1
    variant_label: str = ""


class CartItemOut(BaseModel):
    product_id: str
    quantity: int
    variant_label: str = ""
    unit_price: float = 0
    product: Optional[ProductOut] = None


class CheckoutInput(BaseModel):
    address: dict
    payment_method: str = "mock"
    coupon_code: str = ""


# ---------- Auth dependency ----------
async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        user["id"] = str(user["_id"])
        user.pop("_id", None)
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin required")
    return user


def product_doc_to_out(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "title": doc.get("title", ""),
        "description": doc.get("description", ""),
        "price": float(doc.get("price", 0)),
        "category": doc.get("category", ""),
        "stock": int(doc.get("stock", 0)),
        "image_url": doc.get("image_url", ""),
        "images": doc.get("images", []),
        "rating": float(doc.get("rating", 4.9)),
        "reviews_count": int(doc.get("reviews_count", 0)),
        "brand": doc.get("brand", "IWI"),
        "size_variants": doc.get("size_variants", []),
        "created_at": doc.get("created_at", datetime.now(timezone.utc).isoformat()),
    }


# ---------- Auth endpoints ----------
@api_router.post("/auth/register", response_model=UserOut)
async def register(payload: RegisterInput, response: Response):
    email = payload.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    doc = {
        "email": email,
        "password_hash": hash_password(payload.password),
        "name": payload.name,
        "role": "customer",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    res = await db.users.insert_one(doc)
    uid = str(res.inserted_id)
    access = create_access_token(uid, email, "customer")
    refresh = create_refresh_token(uid)
    set_auth_cookies(response, access, refresh)
    return {"id": uid, "email": email, "name": payload.name, "role": "customer"}


@api_router.post("/auth/login", response_model=UserOut)
async def login(payload: LoginInput, response: Response):
    email = payload.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    uid = str(user["_id"])
    access = create_access_token(uid, email, user.get("role", "customer"))
    refresh = create_refresh_token(uid)
    set_auth_cookies(response, access, refresh)
    return {"id": uid, "email": email, "name": user.get("name", ""), "role": user.get("role", "customer")}


@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}


@api_router.get("/auth/me", response_model=UserOut)
async def me(user: dict = Depends(get_current_user)):
    return {"id": user["id"], "email": user["email"], "name": user["name"], "role": user["role"]}


# ---------- Products ----------
@api_router.get("/products")
async def list_products(
    q: Optional[str] = None,
    category: Optional[str] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    sort: Optional[str] = None,
    limit: int = Query(60, le=200),
    skip: int = 0,
):
    query: dict = {}
    if q:
        query["$or"] = [
            {"title": {"$regex": q, "$options": "i"}},
            {"description": {"$regex": q, "$options": "i"}},
            {"brand": {"$regex": q, "$options": "i"}},
        ]
    if category and category.lower() != "all":
        query["category"] = category
    if min_price is not None or max_price is not None:
        pr: dict = {}
        if min_price is not None:
            pr["$gte"] = min_price
        if max_price is not None:
            pr["$lte"] = max_price
        query["price"] = pr

    sort_opt = [("created_at", -1)]
    if sort == "price_asc":
        sort_opt = [("price", 1)]
    elif sort == "price_desc":
        sort_opt = [("price", -1)]
    elif sort == "rating":
        sort_opt = [("rating", -1)]

    cursor = db.products.find(query).sort(sort_opt).skip(skip).limit(limit)
    items = [product_doc_to_out(d) async for d in cursor]
    total = await db.products.count_documents(query)
    return {"items": items, "total": total}


@api_router.get("/products/categories")
async def list_categories():
    cats = await db.products.distinct("category")
    return {"categories": sorted([c for c in cats if c])}


@api_router.get("/products/{product_id}")
async def get_product(product_id: str):
    try:
        doc = await db.products.find_one({"_id": ObjectId(product_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid product id")
    if not doc:
        raise HTTPException(status_code=404, detail="Product not found")
    return product_doc_to_out(doc)


@api_router.post("/products")
async def create_product(payload: ProductIn, _: dict = Depends(require_admin)):
    doc = payload.model_dump()
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    res = await db.products.insert_one(doc)
    doc["_id"] = res.inserted_id
    return product_doc_to_out(doc)


@api_router.put("/products/{product_id}")
async def update_product(product_id: str, payload: ProductIn, _: dict = Depends(require_admin)):
    try:
        oid = ObjectId(product_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid product id")
    await db.products.update_one({"_id": oid}, {"$set": payload.model_dump()})
    doc = await db.products.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Product not found")
    return product_doc_to_out(doc)


@api_router.delete("/products/{product_id}")
async def delete_product(product_id: str, _: dict = Depends(require_admin)):
    try:
        oid = ObjectId(product_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid product id")
    await db.products.delete_one({"_id": oid})
    return {"ok": True}


# ---------- Cart ----------
async def _get_cart_items(user_id: str) -> List[dict]:
    cart = await db.carts.find_one({"user_id": user_id})
    if not cart:
        return []
    items = cart.get("items", [])
    out = []
    for it in items:
        try:
            prod = await db.products.find_one({"_id": ObjectId(it["product_id"])})
        except Exception:
            prod = None
        variant_label = it.get("variant_label", "")
        unit_price = 0
        if prod:
            unit_price = float(prod.get("price", 0))
            for v in prod.get("size_variants", []) or []:
                if v.get("label") == variant_label:
                    unit_price = float(v.get("price", unit_price))
                    break
        out.append({
            "product_id": it["product_id"],
            "quantity": it["quantity"],
            "variant_label": variant_label,
            "unit_price": unit_price,
            "product": product_doc_to_out(prod) if prod else None,
        })
    return out


def _shipping_for(subtotal: float) -> float:
    flat = float(os.environ.get("FLAT_SHIPPING_FEE", "6.99"))
    threshold = float(os.environ.get("FREE_SHIPPING_THRESHOLD", "75"))
    if subtotal <= 0:
        return 0.0
    return 0.0 if subtotal >= threshold else flat


@api_router.get("/config/shipping")
async def get_shipping_config():
    return {
        "flat_fee": float(os.environ.get("FLAT_SHIPPING_FEE", "6.99")),
        "free_threshold": float(os.environ.get("FREE_SHIPPING_THRESHOLD", "75")),
    }


@api_router.get("/cart")
async def get_cart(user: dict = Depends(get_current_user)):
    items = await _get_cart_items(user["id"])
    subtotal = sum((i["unit_price"] * i["quantity"]) for i in items if i["product"])
    return {"items": items, "subtotal": round(subtotal, 2)}


@api_router.post("/cart/add")
async def add_to_cart(payload: CartItemIn, user: dict = Depends(get_current_user)):
    try:
        prod = await db.products.find_one({"_id": ObjectId(payload.product_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid product id")
    if not prod:
        raise HTTPException(status_code=404, detail="Product not found")
    variant_label = payload.variant_label or ""
    cart = await db.carts.find_one({"user_id": user["id"]})
    items = (cart or {}).get("items", [])
    found = False
    for it in items:
        if it["product_id"] == payload.product_id and it.get("variant_label", "") == variant_label:
            it["quantity"] += payload.quantity
            found = True
            break
    if not found:
        items.append({"product_id": payload.product_id, "quantity": payload.quantity, "variant_label": variant_label})
    await db.carts.update_one({"user_id": user["id"]}, {"$set": {"items": items}}, upsert=True)
    return await get_cart(user)


@api_router.post("/cart/update")
async def update_cart_item(payload: CartItemIn, user: dict = Depends(get_current_user)):
    cart = await db.carts.find_one({"user_id": user["id"]})
    items = (cart or {}).get("items", [])
    variant_label = payload.variant_label or ""
    if payload.quantity <= 0:
        items = [it for it in items if not (it["product_id"] == payload.product_id and it.get("variant_label", "") == variant_label)]
    else:
        for it in items:
            if it["product_id"] == payload.product_id and it.get("variant_label", "") == variant_label:
                it["quantity"] = payload.quantity
                break
    await db.carts.update_one({"user_id": user["id"]}, {"$set": {"items": items}}, upsert=True)
    return await get_cart(user)


@api_router.post("/cart/remove")
async def remove_cart_item(payload: CartItemIn, user: dict = Depends(get_current_user)):
    cart = await db.carts.find_one({"user_id": user["id"]})
    variant_label = payload.variant_label or ""
    items = [it for it in (cart or {}).get("items", [])
             if not (it["product_id"] == payload.product_id and it.get("variant_label", "") == variant_label)]
    await db.carts.update_one({"user_id": user["id"]}, {"$set": {"items": items}}, upsert=True)
    return await get_cart(user)


@api_router.post("/cart/clear")
async def clear_cart(user: dict = Depends(get_current_user)):
    await db.carts.update_one({"user_id": user["id"]}, {"$set": {"items": []}}, upsert=True)
    return {"items": [], "subtotal": 0}


# ---------- Orders (mock checkout) ----------
@api_router.post("/orders/checkout")
async def checkout(payload: CheckoutInput, user: dict = Depends(get_current_user)):
    items = await _get_cart_items(user["id"])
    if not items:
        raise HTTPException(status_code=400, detail="Cart is empty")
    subtotal = sum((i["unit_price"] * i["quantity"]) for i in items if i["product"])
    tax = round(subtotal * 0.05, 2)
    shipping = _shipping_for(subtotal)
    total = round(subtotal + tax + shipping, 2)

    order = {
        "user_id": user["id"],
        "items": [{
            "product_id": i["product_id"],
            "title": i["product"]["title"] if i["product"] else "",
            "price": i["unit_price"],
            "quantity": i["quantity"],
            "variant_label": i.get("variant_label", ""),
            "image_url": i["product"]["image_url"] if i["product"] else "",
        } for i in items],
        "address": payload.address,
        "payment_method": payload.payment_method,
        "subtotal": round(subtotal, 2),
        "tax": tax,
        "shipping": shipping,
        "total": total,
        "status": "confirmed",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "order_number": "IWI-" + uuid.uuid4().hex[:10].upper(),
    }
    res = await db.orders.insert_one(order)
    await db.carts.update_one({"user_id": user["id"]}, {"$set": {"items": []}}, upsert=True)
    order["id"] = str(res.inserted_id)
    order.pop("_id", None)
    return order


@api_router.get("/orders")
async def list_my_orders(user: dict = Depends(get_current_user)):
    cursor = db.orders.find({"user_id": user["id"]}).sort([("created_at", -1)])
    out = []
    async for o in cursor:
        o["id"] = str(o["_id"])
        o.pop("_id", None)
        out.append(o)
    return {"orders": out}


@api_router.get("/orders/{order_id}")
async def get_order(order_id: str, user: dict = Depends(get_current_user)):
    try:
        oid = ObjectId(order_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid id")
    o = await db.orders.find_one({"_id": oid, "user_id": user["id"]})
    if not o:
        raise HTTPException(status_code=404, detail="Order not found")
    o["id"] = str(o["_id"])
    o.pop("_id", None)
    return o


@api_router.get("/admin/orders")
async def list_all_orders(_: dict = Depends(require_admin)):
    cursor = db.orders.find({}).sort([("created_at", -1)])
    out = []
    async for o in cursor:
        o["id"] = str(o["_id"])
        o.pop("_id", None)
        out.append(o)
    return {"orders": out}


# ---------- Razorpay payments ----------
class RazorpayCreateInput(BaseModel):
    address: dict
    payment_method: str = "razorpay"
    coupon_code: str = ""


class RazorpayVerifyInput(BaseModel):
    order_id: str  # our DB order id
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


@api_router.get("/config/razorpay")
async def get_razorpay_public_config():
    key_id = os.environ.get("RAZORPAY_KEY_ID", "")
    return {"key_id": key_id, "enabled": bool(key_id and os.environ.get("RAZORPAY_KEY_SECRET"))}


@api_router.post("/orders/create-razorpay")
async def create_razorpay_order(payload: RazorpayCreateInput, user: dict = Depends(get_current_user)):
    client_rzp = get_razorpay_client()
    if client_rzp is None:
        raise HTTPException(status_code=503, detail="Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.")
    items = await _get_cart_items(user["id"])
    if not items:
        raise HTTPException(status_code=400, detail="Cart is empty")
    subtotal = sum((i["unit_price"] * i["quantity"]) for i in items if i["product"])
    discount = 0.0
    coupon_applied = None
    if payload.coupon_code:
        val = await _validate_coupon(payload.coupon_code, subtotal)
        if not val.get("valid"):
            raise HTTPException(status_code=400, detail=val.get("reason", "Invalid coupon"))
        discount = float(val["discount"])
        coupon_applied = val["code"]
    discounted_subtotal = max(0.0, round(subtotal - discount, 2))
    tax = round(discounted_subtotal * 0.05, 2)
    shipping = _shipping_for(discounted_subtotal)
    total = round(discounted_subtotal + tax + shipping, 2)
    amount_paise = int(round(total * 100))

    # Persist internal pending order first so we can bind to razorpay_order_id
    order = {
        "user_id": user["id"],
        "items": [{
            "product_id": i["product_id"],
            "title": i["product"]["title"] if i["product"] else "",
            "price": i["unit_price"],
            "quantity": i["quantity"],
            "variant_label": i.get("variant_label", ""),
            "image_url": i["product"]["image_url"] if i["product"] else "",
        } for i in items],
        "address": payload.address,
        "payment_method": "razorpay",
        "subtotal": round(subtotal, 2),
        "discount": discount,
        "coupon_code": coupon_applied,
        "tax": tax,
        "shipping": shipping,
        "total": total,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "order_number": "IWI-" + uuid.uuid4().hex[:10].upper(),
    }
    res = await db.orders.insert_one(order)
    our_order_id = str(res.inserted_id)

    try:
        rzp_order = client_rzp.order.create({
            "amount": amount_paise,
            "currency": "INR",
            "receipt": order["order_number"][:40],
            "payment_capture": 1,
            "notes": {"internal_order_id": our_order_id, "user_email": user["email"]},
        })
    except Exception as e:
        await db.orders.delete_one({"_id": res.inserted_id})
        raise HTTPException(status_code=502, detail=f"Razorpay order creation failed: {str(e)}")

    await db.orders.update_one({"_id": res.inserted_id},
                               {"$set": {"razorpay_order_id": rzp_order["id"]}})
    if coupon_applied:
        await db.coupons.update_one({"code": coupon_applied}, {"$inc": {"uses": 1}})

    return {
        "order_id": our_order_id,
        "order_number": order["order_number"],
        "amount": amount_paise,
        "currency": "INR",
        "razorpay_order_id": rzp_order["id"],
        "key_id": os.environ.get("RAZORPAY_KEY_ID", ""),
    }


@api_router.post("/orders/verify-razorpay")
async def verify_razorpay(payload: RazorpayVerifyInput, user: dict = Depends(get_current_user)):
    key_secret = os.environ.get("RAZORPAY_KEY_SECRET", "")
    if not key_secret:
        raise HTTPException(status_code=503, detail="Razorpay is not configured")
    # HMAC verification
    body = f"{payload.razorpay_order_id}|{payload.razorpay_payment_id}".encode("utf-8")
    expected = hmac.new(key_secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, payload.razorpay_signature):
        # mark failed
        try:
            oid = ObjectId(payload.order_id)
            await db.orders.update_one({"_id": oid, "user_id": user["id"]},
                                       {"$set": {"status": "payment_failed"}})
        except Exception:
            pass
        raise HTTPException(status_code=400, detail="Invalid payment signature")

    try:
        oid = ObjectId(payload.order_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid order id")
    o = await db.orders.find_one({"_id": oid, "user_id": user["id"]})
    if not o:
        raise HTTPException(status_code=404, detail="Order not found")
    await db.orders.update_one(
        {"_id": oid},
        {"$set": {
            "status": "confirmed",
            "razorpay_payment_id": payload.razorpay_payment_id,
            "razorpay_signature": payload.razorpay_signature,
            "paid_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    # empty cart on successful payment
    await db.carts.update_one({"user_id": user["id"]}, {"$set": {"items": []}}, upsert=True)
    o = await db.orders.find_one({"_id": oid})
    o["id"] = str(o["_id"])
    o.pop("_id", None)
    return o


# ---------- Reviews (verified purchasers only) ----------
class ReviewIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    title: str = Field(max_length=120, default="")
    comment: str = Field(max_length=2000, default="")
    rating: int = Field(ge=1, le=5)
    title: str = Field(max_length=120, default="")
    comment: str = Field(max_length=2000, default="")


async def _has_purchased(user_id: str, product_id: str) -> bool:
    return await db.orders.find_one({
        "user_id": user_id,
        "status": "confirmed",
        "items.product_id": product_id,
    }) is not None


async def _recompute_product_rating(product_id: str):
    try:
        oid = ObjectId(product_id)
    except Exception:
        return
    cursor = db.reviews.find({"product_id": product_id})
    total, count = 0.0, 0
    async for r in cursor:
        total += float(r.get("rating", 0))
        count += 1
    avg = round(total / count, 2) if count > 0 else 0
    await db.products.update_one({"_id": oid}, {"$set": {"rating": avg, "reviews_count": count}})


@api_router.get("/products/{product_id}/reviews")
async def list_reviews(product_id: str):
    cursor = db.reviews.find({"product_id": product_id}).sort([("created_at", -1)])
    reviews = []
    async for r in cursor:
        reviews.append({
            "id": str(r["_id"]),
            "product_id": r["product_id"],
            "user_id": r.get("user_id"),
            "user_name": r.get("user_name", "Customer"),
            "rating": r.get("rating"),
            "title": r.get("title", ""),
            "comment": r.get("comment", ""),
            "created_at": r.get("created_at"),
        })
    return {"reviews": reviews}


@api_router.get("/products/{product_id}/reviews/eligibility")
async def review_eligibility(product_id: str, user: dict = Depends(get_current_user)):
    purchased = await _has_purchased(user["id"], product_id)
    existing = await db.reviews.find_one({"product_id": product_id, "user_id": user["id"]})
    return {
        "purchased": purchased,
        "already_reviewed": existing is not None,
        "can_review": purchased and existing is None,
    }


@api_router.post("/products/{product_id}/reviews")
async def create_review(product_id: str, payload: ReviewIn, user: dict = Depends(get_current_user)):
    # product must exist
    try:
        prod_oid = ObjectId(product_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid product id")
    prod = await db.products.find_one({"_id": prod_oid})
    if not prod:
        raise HTTPException(status_code=404, detail="Product not found")
    # must have purchased
    if not await _has_purchased(user["id"], product_id):
        raise HTTPException(status_code=403, detail="Only verified purchasers can review this product")
    # one per user per product
    if await db.reviews.find_one({"product_id": product_id, "user_id": user["id"]}):
        raise HTTPException(status_code=400, detail="You have already reviewed this product")
    doc = {
        "product_id": product_id,
        "user_id": user["id"],
        "user_name": user.get("name") or "Customer",
        "rating": payload.rating,
        "title": payload.title.strip(),
        "comment": payload.comment.strip(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    res = await db.reviews.insert_one(doc)
    await _recompute_product_rating(product_id)
    doc["id"] = str(res.inserted_id)
    doc.pop("_id", None)
    return doc


# ---------- Razorpay webhook ----------
@api_router.post("/webhooks/razorpay")
async def razorpay_webhook(request: Request):
    secret = os.environ.get("RAZORPAY_WEBHOOK_SECRET", "")
    if not secret:
        raise HTTPException(status_code=503, detail="Webhook secret not configured")
    body = await request.body()
    sig = request.headers.get("X-Razorpay-Signature", "")
    expected = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, sig):
        raise HTTPException(status_code=400, detail="Invalid webhook signature")
    try:
        import json as _json
        payload = _json.loads(body.decode("utf-8"))
    except Exception:
        raise HTTPException(status_code=400, detail="Bad payload")

    event = payload.get("event", "")
    if event in ("payment.captured", "order.paid"):
        rzp_order_id = (
            payload.get("payload", {}).get("payment", {}).get("entity", {}).get("order_id")
            or payload.get("payload", {}).get("order", {}).get("entity", {}).get("id")
        )
        rzp_payment_id = payload.get("payload", {}).get("payment", {}).get("entity", {}).get("id")
        if rzp_order_id:
            o = await db.orders.find_one({"razorpay_order_id": rzp_order_id})
            if o and o.get("status") != "confirmed":
                await db.orders.update_one(
                    {"_id": o["_id"]},
                    {"$set": {
                        "status": "confirmed",
                        "razorpay_payment_id": rzp_payment_id or o.get("razorpay_payment_id"),
                        "paid_at": datetime.now(timezone.utc).isoformat(),
                        "confirmed_via": "webhook",
                    }},
                )
                await db.carts.update_one({"user_id": o["user_id"]}, {"$set": {"items": []}}, upsert=True)
    return {"ok": True, "event": event}


# ---------- Wishlist ----------
class WishlistItemIn(BaseModel):
    product_id: str


@api_router.get("/wishlist")
async def get_wishlist(user: dict = Depends(get_current_user)):
    doc = await db.wishlists.find_one({"user_id": user["id"]}) or {"product_ids": []}
    ids = doc.get("product_ids", [])
    products = []
    for pid in ids:
        try:
            p = await db.products.find_one({"_id": ObjectId(pid)})
            if p:
                products.append(product_doc_to_out(p))
        except Exception:
            continue
    return {"product_ids": ids, "products": products}


@api_router.post("/wishlist/toggle")
async def toggle_wishlist(payload: WishlistItemIn, user: dict = Depends(get_current_user)):
    doc = await db.wishlists.find_one({"user_id": user["id"]}) or {"product_ids": []}
    ids = list(doc.get("product_ids", []))
    if payload.product_id in ids:
        ids.remove(payload.product_id)
        in_wishlist = False
    else:
        ids.append(payload.product_id)
        in_wishlist = True
    await db.wishlists.update_one(
        {"user_id": user["id"]},
        {"$set": {"product_ids": ids, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"product_ids": ids, "in_wishlist": in_wishlist}


# ---------- Coupons ----------
class CouponIn(BaseModel):
    code: str
    discount_type: str  # "percent" | "flat"
    value: float
    min_subtotal: float = 0
    max_uses: int = 0  # 0 = unlimited
    active: bool = True


def _coupon_out(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "code": doc.get("code", "").upper(),
        "discount_type": doc.get("discount_type", "percent"),
        "value": float(doc.get("value", 0)),
        "min_subtotal": float(doc.get("min_subtotal", 0)),
        "max_uses": int(doc.get("max_uses", 0)),
        "uses": int(doc.get("uses", 0)),
        "active": bool(doc.get("active", True)),
        "created_at": doc.get("created_at", ""),
    }


def _compute_discount(coupon: dict, subtotal: float) -> float:
    if not coupon:
        return 0.0
    dt = coupon.get("discount_type", "percent")
    val = float(coupon.get("value", 0))
    if dt == "percent":
        return round(subtotal * val / 100, 2)
    return round(min(val, subtotal), 2)


async def _validate_coupon(code: str, subtotal: float) -> dict:
    code = (code or "").strip().upper()
    if not code:
        return {"valid": False, "reason": "No code"}
    c = await db.coupons.find_one({"code": code})
    if not c:
        return {"valid": False, "reason": "Coupon not found"}
    if not c.get("active", True):
        return {"valid": False, "reason": "Coupon is inactive"}
    if c.get("max_uses", 0) and c.get("uses", 0) >= c["max_uses"]:
        return {"valid": False, "reason": "Coupon has been fully redeemed"}
    if subtotal < float(c.get("min_subtotal", 0)):
        return {"valid": False, "reason": f"Minimum subtotal ₹{c['min_subtotal']:.2f} required"}
    discount = _compute_discount(c, subtotal)
    return {"valid": True, "code": code, "discount": discount,
            "discount_type": c.get("discount_type"), "value": c.get("value")}


@api_router.post("/coupons/validate")
async def validate_coupon(payload: dict, user: dict = Depends(get_current_user)):
    code = (payload.get("code") or "").strip()
    items = await _get_cart_items(user["id"])
    subtotal = sum((i["unit_price"] * i["quantity"]) for i in items if i["product"])
    res = await _validate_coupon(code, subtotal)
    return res


@api_router.get("/admin/coupons")
async def admin_list_coupons(_: dict = Depends(require_admin)):
    cursor = db.coupons.find({}).sort([("created_at", -1)])
    out = []
    async for c in cursor:
        out.append(_coupon_out(c))
    return {"coupons": out}


@api_router.post("/admin/coupons")
async def admin_create_coupon(payload: CouponIn, _: dict = Depends(require_admin)):
    code = payload.code.strip().upper()
    if not code:
        raise HTTPException(status_code=400, detail="Code required")
    if payload.discount_type not in ("percent", "flat"):
        raise HTTPException(status_code=400, detail="Invalid discount_type")
    doc = {
        "code": code,
        "discount_type": payload.discount_type,
        "value": float(payload.value),
        "min_subtotal": float(payload.min_subtotal),
        "max_uses": int(payload.max_uses),
        "uses": 0,
        "active": bool(payload.active),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        res = await db.coupons.insert_one(doc)
    except Exception:
        raise HTTPException(status_code=400, detail="Coupon code already exists")
    doc["_id"] = res.inserted_id
    return _coupon_out(doc)


@api_router.delete("/admin/coupons/{coupon_id}")
async def admin_delete_coupon(coupon_id: str, _: dict = Depends(require_admin)):
    try:
        oid = ObjectId(coupon_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid id")
    await db.coupons.delete_one({"_id": oid})
    return {"ok": True}


# ---------- Root ----------
@api_router.get("/")
async def root():
    return {"message": "Innovation Window India API", "version": "1.0"}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[o.strip() for o in os.environ.get('CORS_ORIGINS', 'http://localhost:3000').split(',') if o.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event():
    await db.users.create_index("email", unique=True)
    await db.products.create_index("category")
    await db.orders.create_index("user_id")
    await db.reviews.create_index([("product_id", 1), ("user_id", 1)], unique=True)
    await db.coupons.create_index("code", unique=True)
    await db.wishlists.create_index("user_id", unique=True)
    # seed admin
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@shop.com").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "email": admin_email,
            "password_hash": hash_password(admin_password),
            "name": "Admin",
            "role": "admin",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info(f"Seeded admin user: {admin_email}")
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one({"email": admin_email},
                                  {"$set": {"password_hash": hash_password(admin_password),
                                            "role": "admin"}})


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
