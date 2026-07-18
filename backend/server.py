from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import logging
import uuid
import bcrypt
import jwt
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
    response.set_cookie("access_token", access_token, httponly=True, secure=False,
                        samesite="lax", max_age=60 * 60 * 24, path="/")
    response.set_cookie("refresh_token", refresh_token, httponly=True, secure=False,
                        samesite="lax", max_age=60 * 60 * 24 * 7, path="/")


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
    rating: float = 4.5
    reviews_count: int = 0
    brand: str = ""


class ProductOut(ProductIn):
    id: str
    created_at: str


class CartItemIn(BaseModel):
    product_id: str
    quantity: int = 1


class CartItemOut(BaseModel):
    product_id: str
    quantity: int
    product: Optional[ProductOut] = None


class CheckoutInput(BaseModel):
    address: dict
    payment_method: str = "mock"


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
        "rating": float(doc.get("rating", 4.5)),
        "reviews_count": int(doc.get("reviews_count", 0)),
        "brand": doc.get("brand", ""),
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
        out.append({
            "product_id": it["product_id"],
            "quantity": it["quantity"],
            "product": product_doc_to_out(prod) if prod else None,
        })
    return out


@api_router.get("/cart")
async def get_cart(user: dict = Depends(get_current_user)):
    items = await _get_cart_items(user["id"])
    subtotal = sum((i["product"]["price"] * i["quantity"]) for i in items if i["product"])
    return {"items": items, "subtotal": round(subtotal, 2)}


@api_router.post("/cart/add")
async def add_to_cart(payload: CartItemIn, user: dict = Depends(get_current_user)):
    try:
        prod = await db.products.find_one({"_id": ObjectId(payload.product_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid product id")
    if not prod:
        raise HTTPException(status_code=404, detail="Product not found")
    cart = await db.carts.find_one({"user_id": user["id"]})
    items = (cart or {}).get("items", [])
    found = False
    for it in items:
        if it["product_id"] == payload.product_id:
            it["quantity"] += payload.quantity
            found = True
            break
    if not found:
        items.append({"product_id": payload.product_id, "quantity": payload.quantity})
    await db.carts.update_one({"user_id": user["id"]}, {"$set": {"items": items}}, upsert=True)
    return await get_cart(user)


@api_router.post("/cart/update")
async def update_cart_item(payload: CartItemIn, user: dict = Depends(get_current_user)):
    cart = await db.carts.find_one({"user_id": user["id"]})
    items = (cart or {}).get("items", [])
    if payload.quantity <= 0:
        items = [it for it in items if it["product_id"] != payload.product_id]
    else:
        for it in items:
            if it["product_id"] == payload.product_id:
                it["quantity"] = payload.quantity
                break
    await db.carts.update_one({"user_id": user["id"]}, {"$set": {"items": items}}, upsert=True)
    return await get_cart(user)


@api_router.post("/cart/remove")
async def remove_cart_item(payload: CartItemIn, user: dict = Depends(get_current_user)):
    cart = await db.carts.find_one({"user_id": user["id"]})
    items = [it for it in (cart or {}).get("items", []) if it["product_id"] != payload.product_id]
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
    subtotal = sum((i["product"]["price"] * i["quantity"]) for i in items if i["product"])
    tax = round(subtotal * 0.08, 2)
    shipping = 0 if subtotal >= 35 else 4.99
    total = round(subtotal + tax + shipping, 2)

    order = {
        "user_id": user["id"],
        "items": [{
            "product_id": i["product_id"],
            "title": i["product"]["title"] if i["product"] else "",
            "price": i["product"]["price"] if i["product"] else 0,
            "quantity": i["quantity"],
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
        "order_number": "SK-" + uuid.uuid4().hex[:10].upper(),
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


# ---------- Root ----------
@api_router.get("/")
async def root():
    return {"message": "ShopKart API", "version": "1.0"}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event():
    await db.users.create_index("email", unique=True)
    await db.products.create_index("category")
    await db.orders.create_index("user_id")
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
