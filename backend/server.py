from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import re
import logging
import uuid
import asyncio
import bcrypt
import hmac
import hashlib
import secrets
import jwt
import razorpay
import requests
import aiosmtplib

# The cloudinary SDK reads CLOUDINARY_URL the instant it's imported (below)
# and raises immediately if it isn't exactly "cloudinary://key:secret@cloud"
# — which takes down the *entire* server before our own config guard further
# down ever runs. Sanitize it up front so a bad paste in the Render
# dashboard (stray "CLOUDINARY_URL=" prefix, quotes, whitespace) degrades to
# "uploads fall back to local disk" instead of crashing the whole app.
_cloudinary_url = os.environ.get("CLOUDINARY_URL", "").strip().strip("'\"")
if _cloudinary_url and not _cloudinary_url.startswith("cloudinary://"):
    logging.warning(
        f"CLOUDINARY_URL is set but doesn't start with 'cloudinary://' (got: "
        f"{_cloudinary_url[:20]}...) — ignoring it. Uploads will fall back to "
        f"local disk until it's fixed in the Render dashboard."
    )
    os.environ.pop("CLOUDINARY_URL", None)
elif _cloudinary_url:
    os.environ["CLOUDINARY_URL"] = _cloudinary_url  # trim any accidental whitespace/quotes

import cloudinary
import cloudinary.uploader
from email.message import EmailMessage
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Annotated
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, Query, UploadFile, File
from fastapi.staticfiles import StaticFiles
from starlette.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from pydantic import BaseModel, Field, EmailStr, ConfigDict, BeforeValidator, field_validator, model_validator
from pymongo import ReturnDocument


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
    # SameSite: "lax" for same-site (default), "none" for cross-site (e.g. when
    # the frontend and backend live on separate subdomains under a Public Suffix
    # like *.onrender.com). "none" requires Secure=true.
    samesite = os.environ.get("COOKIE_SAMESITE", "lax").lower()
    if samesite == "none":
        secure = True
    response.set_cookie("access_token", access_token, httponly=True, secure=secure,
                        samesite=samesite, max_age=60 * 60 * 24, path="/")
    response.set_cookie("refresh_token", refresh_token, httponly=True, secure=secure,
                        samesite=samesite, max_age=60 * 60 * 24 * 7, path="/")


# ---------- Razorpay ----------
# Disabled by default: sellers currently get paid via their own UPI QR code
# shown at checkout instead of a payment gateway. Set RAZORPAY_ENABLED=true
# (plus RAZORPAY_KEY_ID/SECRET) to bring the gateway back.
RAZORPAY_ENABLED = os.environ.get("RAZORPAY_ENABLED", "false").lower() == "true"


def get_razorpay_client() -> Optional["razorpay.Client"]:
    if not RAZORPAY_ENABLED:
        return None
    key_id = os.environ.get("RAZORPAY_KEY_ID", "")
    key_secret = os.environ.get("RAZORPAY_KEY_SECRET", "")
    if not key_id or not key_secret:
        return None
    return razorpay.Client(auth=(key_id, key_secret))


# ---------- India states/UTs (seller location + statewise storefront filter) ----------
INDIA_STATES = [
    "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa",
    "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala",
    "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland",
    "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
    "Uttar Pradesh", "Uttarakhand", "West Bengal",
    "Andaman and Nicobar Islands", "Chandigarh",
    "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir",
    "Ladakh", "Lakshadweep", "Puducherry",
]


# ---------- GST ----------
GST_RATES = (5, 18)
GSTIN_REGEX = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$")


# ---------- Product categories ----------
# The storefront's canonical taxonomy — always offered in the admin/seller
# "Category" pickers and the nav/home dropdowns, even for a category with no
# products listed yet. `/products/categories` unions this with whatever else
# is already in the DB, so older/custom category strings still surface.
PRODUCT_CATEGORIES = [
    "Herbal Tea",
    "Grocery",
    "Super Foods",
    "Artisanal Goods",
    "Spiritual",
    "Medicinal Roots",
]


# ---------- Sequential vendor/customer codes ----------
async def _next_code(prefix: str, counter_name: str, width: int = 5) -> str:
    """Atomically increments a named counter and returns e.g. 'VEN-00001'.
    Every seller gets a unique vendor code and every other signed-up user a
    unique customer code, independent of (possibly duplicate) display names."""
    doc = await db.counters.find_one_and_update(
        {"_id": counter_name},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return f"{prefix}-{doc['seq']:0{width}d}"


# ---------- Models ----------
PyObjectId = Annotated[str, BeforeValidator(lambda v: str(v) if isinstance(v, ObjectId) else v)]


class RegisterInput(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str = Field(min_length=1, max_length=80)
    role: str = "customer"
    state: str = ""  # required for sellers — where they ship from
    city: str = ""
    gst_number: str = ""  # GSTIN — mandatory for sellers, optional for buyers

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        # Public registration may only create customer or seller accounts.
        if v not in ("customer", "seller"):
            return "customer"
        return v

    @field_validator("gst_number")
    @classmethod
    def normalize_gst_number(cls, v: str) -> str:
        return v.strip().upper()

    @model_validator(mode="after")
    def _require_seller_location_and_gst(self):
        if self.role == "seller":
            if not self.city.strip():
                raise ValueError("City is required for a seller account")
            if self.state not in INDIA_STATES:
                raise ValueError("A valid Indian state is required for a seller account")
            if not self.gst_number:
                raise ValueError("GST number is required for a seller account")
        if self.gst_number and not GSTIN_REGEX.match(self.gst_number):
            raise ValueError("GST number must be a valid 15-character GSTIN (e.g. 27AAAAA0000A1Z5)")
        return self


class LoginInput(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    email: EmailStr
    name: str
    role: str
    code: str = ""
    state: str = ""
    city: str = ""
    gst_number: str = ""


class ProductIn(BaseModel):
    title: str
    description: str = ""
    price: float = 0
    category: str = "General"
    stock: int = 100
    image_url: str = ""
    images: List[str] = []
    qr_code_url: str = ""  # seller's payment QR code (e.g. UPI QR)
    seller_id: Optional[str] = None
    # Stamped server-side from the owning seller's profile (not client-settable)
    # so the storefront's statewise filter has something to query against.
    state: str = ""
    city: str = ""
    rating: float = 4.9
    reviews_count: int = 0
    brand: str = "IWI"
    size_variants: List[dict] = []  # [{"label":"50g","price":12.0,"stock":50}]
    # What each size_variants amount is measured in — drives how the seller UI
    # labels packaging sizes: liquids in "ml", solids by weight in "g", and
    # anything else (e.g. beads, sachets) as a plain "count" of pieces.
    unit_type: str = "count"
    gst_rate: float = 5  # GST % applied at checkout — every product is either 5% or 18%

    @field_validator("unit_type")
    @classmethod
    def validate_unit_type(cls, v: str) -> str:
        return v if v in ("ml", "g", "count") else "count"

    @field_validator("gst_rate")
    @classmethod
    def validate_gst_rate(cls, v: float) -> float:
        return v if v in GST_RATES else 5


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


async def get_current_user_optional(request: Request) -> Optional[dict]:
    """Like get_current_user, but returns None instead of raising when there's
    no/invalid session — for endpoints that are public but behave differently
    for a logged-in admin/seller (e.g. product visibility by approval status)."""
    try:
        return await get_current_user(request)
    except HTTPException:
        return None


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin required")
    return user


async def require_seller(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") not in ("seller", "admin"):
        raise HTTPException(status_code=403, detail="Seller account required")
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
        "qr_code_url": doc.get("qr_code_url", ""),
        "seller_id": doc.get("seller_id"),
        "state": doc.get("state", ""),
        "city": doc.get("city", ""),
        # Seller-submitted products start "pending" and stay off the public
        # storefront until an admin approves them. Products with no stored
        # value (admin-created, or created before this field existed) are
        # treated as already approved.
        "approval_status": doc.get("approval_status") or "approved",
        "rating": float(doc.get("rating", 4.9)),
        "reviews_count": int(doc.get("reviews_count", 0)),
        "brand": doc.get("brand", "IWI"),
        "size_variants": doc.get("size_variants", []),
        "unit_type": doc.get("unit_type") or "count",
        "gst_rate": float(doc.get("gst_rate") or 5),
        "created_at": doc.get("created_at", datetime.now(timezone.utc).isoformat()),
    }


# ---------- Auth endpoints ----------
@api_router.post("/auth/register", response_model=UserOut)
async def register(payload: RegisterInput, response: Response):
    email = payload.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    role = payload.role  # already restricted to customer/seller by validator
    # Vendor codes for sellers, customer codes for everyone else — a stable,
    # unique identifier independent of (possibly duplicate) display names.
    if role == "seller":
        code = await _next_code("VEN", "seller_code")
    else:
        code = await _next_code("CUS", "customer_code")
    doc = {
        "email": email,
        "password_hash": hash_password(payload.password),
        "name": payload.name,
        "role": role,
        "code": code,
        "state": payload.state if role == "seller" else "",
        "city": payload.city.strip() if role == "seller" else "",
        "gst_number": payload.gst_number,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    res = await db.users.insert_one(doc)
    uid = str(res.inserted_id)
    access = create_access_token(uid, email, role)
    refresh = create_refresh_token(uid)
    set_auth_cookies(response, access, refresh)
    return {
        "id": uid, "email": email, "name": payload.name, "role": role, "code": code,
        "state": doc["state"], "city": doc["city"], "gst_number": doc["gst_number"],
    }


async def _ensure_user_code(uid: str, role: str, existing_code: str) -> str:
    """Backfills a vendor/customer code for accounts created before this field
    existed (e.g. the seeded admin, or pre-migration test accounts)."""
    if existing_code:
        return existing_code
    prefix, counter = ("VEN", "seller_code") if role == "seller" else ("CUS", "customer_code")
    code = await _next_code(prefix, counter)
    await db.users.update_one({"_id": ObjectId(uid)}, {"$set": {"code": code}})
    return code


@api_router.post("/auth/login", response_model=UserOut)
async def login(payload: LoginInput, response: Response):
    email = payload.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    uid = str(user["_id"])
    role = user.get("role", "customer")
    code = await _ensure_user_code(uid, role, user.get("code", ""))
    access = create_access_token(uid, email, role)
    refresh = create_refresh_token(uid)
    set_auth_cookies(response, access, refresh)
    return {
        "id": uid, "email": email, "name": user.get("name", ""), "role": role,
        "code": code, "state": user.get("state", ""), "city": user.get("city", ""),
        "gst_number": user.get("gst_number", ""),
    }


@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}


@api_router.get("/auth/me", response_model=UserOut)
async def me(user: dict = Depends(get_current_user)):
    code = await _ensure_user_code(user["id"], user["role"], user.get("code", ""))
    return {
        "id": user["id"], "email": user["email"], "name": user["name"], "role": user["role"],
        "code": code, "state": user.get("state", ""), "city": user.get("city", ""),
        "gst_number": user.get("gst_number", ""),
    }


# ---------- Password reset ----------


class ForgotPasswordInput(BaseModel):
    email: EmailStr


class ResetPasswordInput(BaseModel):
    token: str = Field(min_length=20, max_length=200)
    new_password: str = Field(min_length=6, max_length=200)


async def _send_password_reset_email(recipient_email: str, recipient_name: str, reset_url: str):
    """Send a password reset email via Gmail SMTP (or any SMTP configured via env)."""
    host = os.environ.get("SMTP_HOST", "smtp.gmail.com")
    port = int(os.environ.get("SMTP_PORT", "465"))
    smtp_user = os.environ.get("SMTP_USER", "")
    smtp_password = os.environ.get("SMTP_APP_PASSWORD", "")
    from_name = os.environ.get("SMTP_FROM_NAME", "Innovation Window India")
    from_email = os.environ.get("SMTP_FROM_EMAIL", smtp_user)

    if not smtp_user or not smtp_password:
        # No SMTP configured — log the link for local/dev use.
        logging.warning(f"[SMTP UNCONFIGURED] Password reset link for {recipient_email}: {reset_url}")
        return

    msg = EmailMessage()
    msg["Subject"] = "Reset your Innovation Window India password"
    msg["From"] = f"{from_name} <{from_email}>"
    msg["To"] = recipient_email

    text_body = (
        f"Hi {recipient_name or 'there'},\n\n"
        f"We received a request to reset your Innovation Window India password.\n"
        f"Open this link within the next 30 minutes to set a new one:\n\n"
        f"{reset_url}\n\n"
        f"If you didn't request this, you can safely ignore this email — your password won't change.\n\n"
        f"— Innovation Window India\n"
    )
    html_body = f"""
    <html><body style="font-family:Georgia,serif;background:#F7F3EA;padding:32px;color:#20241D;">
      <div style="max-width:520px;margin:0 auto;background:#FFFCF3;border:1px solid #E7DFCF;border-radius:12px;padding:32px;">
        <h1 style="font-size:22px;margin:0 0 12px;color:#20241D;">Reset your password</h1>
        <p style="color:#4B4A45;">Hi {recipient_name or 'there'}, we received a request to reset your Innovation Window India password.</p>
        <p style="color:#4B4A45;">Click the button below within the next <b>30 minutes</b> to set a new one:</p>
        <p style="margin:24px 0;"><a href="{reset_url}" style="display:inline-block;background:#DC7238;color:#FFFCF3;padding:12px 24px;border-radius:24px;text-decoration:none;font-weight:600;">Reset password</a></p>
        <p style="color:#8A8578;font-size:12px;">Or paste this URL: <br><span style="word-break:break-all;">{reset_url}</span></p>
        <hr style="border:none;border-top:1px solid #E7DFCF;margin:24px 0;" />
        <p style="color:#8A8578;font-size:12px;">Didn't request this? You can safely ignore this email — your password won't change.</p>
        <p style="color:#8A8578;font-size:12px;">— Innovation Window India · Nourish Naturally</p>
      </div>
    </body></html>
    """
    msg.set_content(text_body)
    msg.add_alternative(html_body, subtype="html")

    try:
        await aiosmtplib.send(
            msg,
            hostname=host,
            port=port,
            username=smtp_user,
            password=smtp_password,
            use_tls=(port == 465),
            start_tls=(port == 587),
            timeout=15,
        )
    except Exception as e:
        logging.error(f"Password reset email failed to {recipient_email}: {e}")


@api_router.post("/auth/forgot-password")
async def forgot_password(payload: ForgotPasswordInput):
    """Request a password reset link. Always returns the same message regardless of
    whether the email exists (prevents user enumeration)."""
    email = payload.email.lower()
    user = await db.users.find_one({"email": email})
    if user:
        token = secrets.token_urlsafe(32)
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=30)
        await db.password_reset_tokens.insert_one({
            "user_id": str(user["_id"]),
            "email": email,
            "token_hash": hash_password(token),  # store hashed to avoid leaking via DB dumps
            "expires_at": expires_at,
            "used": False,
            "created_at": datetime.now(timezone.utc),
        })
        frontend_url = os.environ.get("FRONTEND_URL", "https://www.innovationwindowindia.com").rstrip("/")
        reset_url = f"{frontend_url}/reset-password?token={token}"
        await _send_password_reset_email(email, user.get("name", ""), reset_url)
    return {"ok": True, "message": "If an account exists for that email, a reset link has been sent."}


@api_router.post("/auth/reset-password")
async def reset_password(payload: ResetPasswordInput):
    """Consume a reset token and set a new password."""
    now = datetime.now(timezone.utc)
    # Iterate candidate unused tokens and bcrypt-compare (token itself is not indexed)
    cursor = db.password_reset_tokens.find({
        "used": False,
        "expires_at": {"$gt": now},
    }).sort([("created_at", -1)]).limit(50)
    matched = None
    async for rec in cursor:
        if verify_password(payload.token, rec["token_hash"]):
            matched = rec
            break
    if not matched:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
    try:
        oid = ObjectId(matched["user_id"])
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid token")
    # `password_reset_at` also tells the admin-seed step (below) that this
    # account's password is now self-managed, so a server restart won't
    # silently overwrite it back to the ADMIN_PASSWORD env value.
    await db.users.update_one(
        {"_id": oid},
        {"$set": {"password_hash": hash_password(payload.new_password), "password_reset_at": now.isoformat()}},
    )
    await db.password_reset_tokens.update_one({"_id": matched["_id"]}, {"$set": {"used": True, "used_at": now}})
    # Invalidate all other unused tokens for this user
    await db.password_reset_tokens.update_many(
        {"user_id": matched["user_id"], "used": False},
        {"$set": {"used": True, "used_at": now}},
    )
    return {"ok": True, "message": "Your password has been reset. Please sign in with your new password."}


# ---------- Uploads ----------
# Product pictures & seller QR codes go to Cloudinary (durable, CDN-backed)
# when configured. Without a CLOUDINARY_URL, uploads fall back to local disk
# — handy for local dev, but NOT durable in production (files are lost on
# every redeploy on hosts like Render that don't persist the filesystem).
UPLOAD_DIR = ROOT_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

CLOUDINARY_URL = os.environ.get("CLOUDINARY_URL", "")
CLOUDINARY_ENABLED = bool(CLOUDINARY_URL)
if CLOUDINARY_ENABLED:
    cloudinary.config(cloudinary_url=CLOUDINARY_URL, secure=True)
else:
    logger.warning("CLOUDINARY_URL not set — uploads will be saved to local disk (non-durable).")

ALLOWED_UPLOAD_TYPES = {
    "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif",
}
MAX_UPLOAD_BYTES = 5 * 1024 * 1024  # 5MB


@api_router.post("/uploads")
async def upload_image(file: UploadFile = File(...), _: dict = Depends(get_current_user)):
    ext = ALLOWED_UPLOAD_TYPES.get(file.content_type)
    if not ext:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, WEBP or GIF images are allowed")
    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="File too large (max 5MB)")

    if CLOUDINARY_ENABLED:
        try:
            result = await run_in_threadpool(
                cloudinary.uploader.upload,
                data,
                folder="iwi-uploads",
                resource_type="image",
            )
        except Exception:
            logger.exception("Cloudinary upload failed")
            raise HTTPException(status_code=502, detail="Image upload failed, please try again")
        return {"url": result["secure_url"]}

    filename = f"{uuid.uuid4().hex}{ext}"
    (UPLOAD_DIR / filename).write_bytes(data)
    return {"url": f"/uploads/{filename}"}


# ---------- Products ----------
@api_router.get("/products")
async def list_products(
    q: Optional[str] = None,
    category: Optional[str] = None,
    state: Optional[str] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    sort: Optional[str] = None,
    limit: int = Query(60, le=200),
    skip: int = 0,
    user: Optional[dict] = Depends(get_current_user_optional),
):
    query: dict = {}
    conditions: List[dict] = []
    if q:
        conditions.append({"$or": [
            {"title": {"$regex": q, "$options": "i"}},
            {"description": {"$regex": q, "$options": "i"}},
            {"brand": {"$regex": q, "$options": "i"}},
        ]})
    if category and category.lower() != "all":
        query["category"] = category
    if state and state.lower() != "all":
        query["state"] = state
    if min_price is not None or max_price is not None:
        pr: dict = {}
        if min_price is not None:
            pr["$gte"] = min_price
        if max_price is not None:
            pr["$lte"] = max_price
        query["price"] = pr

    # Pending/rejected seller submissions stay off the public storefront —
    # admins see everything (for the review queue). Products with no stored
    # approval_status (admin-created, or pre-dating this field) stay visible.
    if not (user and user.get("role") == "admin"):
        conditions.append({"$or": [
            {"approval_status": "approved"},
            {"approval_status": {"$exists": False}},
        ]})
    if conditions:
        query["$and"] = conditions

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
    cats = set(await db.products.distinct("category"))
    cats.update(PRODUCT_CATEGORIES)
    # Canonical categories keep their curated display order; any extra/legacy
    # category strings found only in the DB are appended alphabetically after.
    extra = sorted(c for c in cats if c and c not in PRODUCT_CATEGORIES)
    return {"categories": [c for c in PRODUCT_CATEGORIES if c in cats] + extra}


@api_router.get("/products/states")
async def list_product_states():
    """Full India states/UTs list for the storefront's statewise dropdown,
    plus which of them currently have live products."""
    with_products = set(await db.products.distinct("state", {"state": {"$nin": ["", None]}}))
    return {"states": INDIA_STATES, "with_products": sorted(with_products)}


@api_router.get("/products/{product_id}")
async def get_product(product_id: str, user: Optional[dict] = Depends(get_current_user_optional)):
    try:
        doc = await db.products.find_one({"_id": ObjectId(product_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid product id")
    if not doc:
        raise HTTPException(status_code=404, detail="Product not found")
    approval_status = doc.get("approval_status") or "approved"
    is_admin = bool(user) and user.get("role") == "admin"
    is_owning_seller = bool(user) and doc.get("seller_id") == user.get("id")
    if approval_status != "approved" and not (is_admin or is_owning_seller):
        # Hide pending/rejected listings from everyone except the admin and
        # the seller who submitted them — same as a 404 for a nonexistent product.
        raise HTTPException(status_code=404, detail="Product not found")
    return product_doc_to_out(doc)


@api_router.get("/products/{product_id}/regional-options")
async def product_regional_options(product_id: str, user: Optional[dict] = Depends(get_current_user_optional)):
    """Same product name, different states. When two+ sellers list the same
    item (e.g. "Honey") out of different states, the buyer's product screen
    offers each state as a pickable option instead of showing only whichever
    listing they happened to land on."""
    try:
        oid = ObjectId(product_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid product id")
    doc = await db.products.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Product not found")
    title = (doc.get("title") or "").strip()
    if not title:
        return {"items": []}

    is_admin = bool(user) and user.get("role") == "admin"
    query: dict = {"title": {"$regex": f"^{re.escape(title)}$", "$options": "i"}}
    if not is_admin:
        query["$and"] = [{"$or": [
            {"approval_status": "approved"},
            {"approval_status": {"$exists": False}},
        ]}]

    # One listing per state (cheapest first if a state has more than one
    # matching seller) so the picker shows states, not every individual seller.
    by_state: dict = {}
    async for d in db.products.find(query).sort([("price", 1)]):
        st = (d.get("state") or "").strip() or "Other"
        if st not in by_state:
            by_state[st] = product_doc_to_out(d)
    items = sorted(by_state.values(), key=lambda p: p.get("state") or "zzz")
    return {"items": items}


@api_router.post("/products")
async def create_product(payload: ProductIn, user: dict = Depends(require_seller)):
    doc = payload.model_dump()
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    # Sellers can only ever own the products they create; admins may set seller_id explicitly.
    # Seller submissions start pending review; admin-created products are auto-approved.
    if user.get("role") == "seller":
        doc["seller_id"] = user["id"]
        doc["approval_status"] = "pending"
        doc["state"] = user.get("state", "")
        doc["city"] = user.get("city", "")
    else:
        doc["approval_status"] = "approved"
    res = await db.products.insert_one(doc)
    doc["_id"] = res.inserted_id
    return product_doc_to_out(doc)


async def _get_owned_product(product_id: str, user: dict) -> ObjectId:
    try:
        oid = ObjectId(product_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid product id")
    doc = await db.products.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Product not found")
    if user.get("role") != "admin" and doc.get("seller_id") != user["id"]:
        raise HTTPException(status_code=403, detail="You can only manage your own products")
    return oid


@api_router.get("/seller/products")
async def list_seller_products(user: dict = Depends(require_seller)):
    query = {} if user.get("role") == "admin" else {"seller_id": user["id"]}
    cursor = db.products.find(query).sort([("created_at", -1)])
    items = [product_doc_to_out(d) async for d in cursor]
    return {"items": items, "total": len(items)}


class ProductApprovalInput(BaseModel):
    approval_status: str  # "approved" | "rejected" | "pending"


@api_router.get("/admin/products/pending")
async def list_pending_products(_: dict = Depends(require_admin)):
    cursor = db.products.find({"approval_status": "pending"}).sort([("created_at", -1)])
    items = [product_doc_to_out(d) async for d in cursor]
    return {"items": items, "total": len(items)}


@api_router.patch("/products/{product_id}/approval")
async def set_product_approval(product_id: str, payload: ProductApprovalInput, _: dict = Depends(require_admin)):
    if payload.approval_status not in ("approved", "rejected", "pending"):
        raise HTTPException(status_code=400, detail="approval_status must be approved, rejected, or pending")
    try:
        oid = ObjectId(product_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid product id")
    doc = await db.products.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Product not found")
    await db.products.update_one({"_id": oid}, {"$set": {"approval_status": payload.approval_status}})
    doc["approval_status"] = payload.approval_status
    return product_doc_to_out(doc)


@api_router.put("/products/{product_id}")
async def update_product(product_id: str, payload: ProductIn, user: dict = Depends(require_seller)):
    oid = await _get_owned_product(product_id, user)
    body = payload.model_dump()
    if user.get("role") == "seller":
        body["seller_id"] = user["id"]  # ownership can't be reassigned by a seller
        body["state"] = user.get("state", "")
        body["city"] = user.get("city", "")
    await db.products.update_one({"_id": oid}, {"$set": body})
    doc = await db.products.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Product not found")
    return product_doc_to_out(doc)


@api_router.delete("/products/{product_id}")
async def delete_product(product_id: str, user: dict = Depends(require_seller)):
    oid = await _get_owned_product(product_id, user)
    await db.products.delete_one({"_id": oid})
    return {"ok": True}


class StockUpdateInput(BaseModel):
    stock: Optional[int] = None  # base stock — set this when the product has no size variants
    variant_label: Optional[str] = None
    variant_stock: Optional[int] = None  # set together with variant_label to restock one size


@api_router.patch("/products/{product_id}/stock")
async def update_product_stock(product_id: str, payload: StockUpdateInput, user: dict = Depends(require_seller)):
    """Quick inventory edit — just the stock number(s), without resubmitting
    the whole product. Used by the admin Inventory panel (and available to a
    seller for their own listings, same ownership rule as every other
    /products/{id} write)."""
    oid = await _get_owned_product(product_id, user)
    if payload.variant_label:
        if payload.variant_stock is None or payload.variant_stock < 0:
            raise HTTPException(status_code=400, detail="variant_stock must be a non-negative number")
        res = await db.products.update_one(
            {"_id": oid, "size_variants.label": payload.variant_label},
            {"$set": {"size_variants.$.stock": payload.variant_stock}},
        )
        if res.matched_count == 0:
            raise HTTPException(status_code=404, detail="Size variant not found")
    elif payload.stock is not None:
        if payload.stock < 0:
            raise HTTPException(status_code=400, detail="stock must be a non-negative number")
        await db.products.update_one({"_id": oid}, {"$set": {"stock": payload.stock}})
    else:
        raise HTTPException(status_code=400, detail="Provide stock, or variant_label with variant_stock")
    doc = await db.products.find_one({"_id": oid})
    return product_doc_to_out(doc)


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


def _compute_gst(items: List[dict]) -> float:
    """Sum each line item's own GST (5% or 18%, set per product by the
    seller) rather than one flat rate across the whole cart — items carry
    their gst_rate at checkout time so this stays accurate even if a
    product's rate changes later."""
    return round(sum(
        float(it.get("price", 0)) * int(it.get("quantity", 0)) * (float(it.get("gst_rate") or 5) / 100.0)
        for it in items
    ), 2)


# ---------- Inventory ----------
def _effective_stock(prod: Optional[dict], variant_label: str) -> int:
    """Stock for the specific size variant the buyer picked, else the
    product's base stock."""
    if not prod:
        return 0
    if variant_label:
        for v in prod.get("size_variants", []) or []:
            if v.get("label") == variant_label:
                return int(v.get("stock", 0))
        return 0  # that variant no longer exists on the product
    return int(prod.get("stock", 0))


async def _release_stock_raw(reserved: List[tuple]):
    for oid, variant_label, qty in reserved:
        if qty <= 0:
            continue
        if variant_label:
            await db.products.update_one(
                {"_id": oid, "size_variants.label": variant_label},
                {"$inc": {"size_variants.$.stock": qty}},
            )
        else:
            await db.products.update_one({"_id": oid}, {"$inc": {"stock": qty}})


async def _reserve_stock(order_items: List[dict]) -> List[dict]:
    """Atomically decrement stock for each line item so two concurrent
    checkouts can't oversell the same unit — each decrement is conditioned
    on there being enough stock left, in the same update. Returns a list of
    conflicts for items that couldn't be reserved (out of stock, not enough
    left, or the product/variant no longer exists); anything already
    reserved before a conflict was hit is rolled back so a failed checkout
    never leaves inventory short."""
    reserved: List[tuple] = []
    conflicts: List[dict] = []
    for it in order_items:
        qty = int(it.get("quantity", 0))
        variant_label = it.get("variant_label", "")
        try:
            oid = ObjectId(it["product_id"])
        except Exception:
            conflicts.append({
                "product_id": it.get("product_id", ""), "title": it.get("title", ""),
                "variant_label": variant_label, "requested": qty, "available": 0,
                "reason": "Product not found",
            })
            continue

        if variant_label:
            res = await db.products.find_one_and_update(
                {"_id": oid, "size_variants": {"$elemMatch": {"label": variant_label, "stock": {"$gte": qty}}}},
                {"$inc": {"size_variants.$.stock": -qty}},
            )
        else:
            res = await db.products.find_one_and_update(
                {"_id": oid, "stock": {"$gte": qty}},
                {"$inc": {"stock": -qty}},
            )

        if res is None:
            prod = await db.products.find_one({"_id": oid})
            available = _effective_stock(prod, variant_label)
            conflicts.append({
                "product_id": it.get("product_id", ""),
                "title": it.get("title") or (prod.get("title") if prod else ""),
                "variant_label": variant_label,
                "requested": qty,
                "available": available,
                "reason": "Out of stock" if available <= 0 else "Not enough stock left",
            })
        else:
            reserved.append((oid, variant_label, qty))

    if conflicts and reserved:
        await _release_stock_raw(reserved)
    return conflicts


async def _release_stock(order_items: List[dict]):
    """Restore stock for an order's line items — e.g. when an order (or one
    seller's part of it) is cancelled."""
    pairs = []
    for it in order_items:
        try:
            oid = ObjectId(it["product_id"])
        except Exception:
            continue
        pairs.append((oid, it.get("variant_label", ""), int(it.get("quantity", 0))))
    await _release_stock_raw(pairs)


def _stock_conflict_response(conflicts: List[dict]) -> HTTPException:
    return HTTPException(status_code=409, detail={
        "message": "Some items in your cart are no longer available in the quantity you selected.",
        "items": conflicts,
    })


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


class CartMergeInput(BaseModel):
    items: List[CartItemIn]


@api_router.post("/cart/merge")
async def merge_cart(payload: CartMergeInput, user: dict = Depends(get_current_user)):
    """Merge a guest's localStorage cart into the signed-in user's server cart.
    Existing quantities are added to, not replaced."""
    if not payload.items:
        return await get_cart(user)
    cart = await db.carts.find_one({"user_id": user["id"]})
    items = (cart or {}).get("items", [])
    for incoming in payload.items:
        variant_label = incoming.variant_label or ""
        # Confirm product still exists before merging
        try:
            prod = await db.products.find_one({"_id": ObjectId(incoming.product_id)})
        except Exception:
            continue
        if not prod:
            continue
        found = False
        for it in items:
            if it["product_id"] == incoming.product_id and it.get("variant_label", "") == variant_label:
                it["quantity"] += incoming.quantity
                found = True
                break
        if not found:
            items.append({
                "product_id": incoming.product_id,
                "quantity": incoming.quantity,
                "variant_label": variant_label,
            })
    await db.carts.update_one({"user_id": user["id"]}, {"$set": {"items": items}}, upsert=True)
    return await get_cart(user)


# ---------- Order confirmation notifications (email + WhatsApp) ----------
TWILIO_ACCOUNT_SID = os.environ.get("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "")
TWILIO_WHATSAPP_FROM = os.environ.get("TWILIO_WHATSAPP_FROM", "")  # e.g. "whatsapp:+14155238886"


def _normalize_whatsapp_number(raw_phone: str) -> Optional[str]:
    """Best-effort E.164-ish normalization. Assumes India (+91) when no
    country code is given, since that's this app's primary market."""
    digits = "".join(ch for ch in (raw_phone or "") if ch.isdigit() or ch == "+")
    if not digits:
        return None
    if not digits.startswith("+"):
        digits = "+91" + digits.lstrip("0")
    return f"whatsapp:{digits}"


def _send_whatsapp_sync(to_whatsapp: str, body: str) -> None:
    resp = requests.post(
        f"https://api.twilio.com/2010-04-01/Accounts/{TWILIO_ACCOUNT_SID}/Messages.json",
        data={"From": TWILIO_WHATSAPP_FROM, "To": to_whatsapp, "Body": body},
        auth=(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN),
        timeout=15,
    )
    resp.raise_for_status()


async def _send_order_confirmation_whatsapp(phone: str, name: str, order: dict):
    if not (TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN and TWILIO_WHATSAPP_FROM):
        logging.warning(f"[WHATSAPP UNCONFIGURED] Order confirmation for {phone}: order {order.get('order_number')}")
        return
    to_whatsapp = _normalize_whatsapp_number(phone)
    if not to_whatsapp:
        return
    frontend_url = os.environ.get("FRONTEND_URL", "").rstrip("/")
    body = (
        f"Hi {name or 'there'}! Your Innovation Window India order {order.get('order_number')} "
        f"payment is confirmed. Total: Rs.{float(order.get('total', 0)):.2f}."
        + (f" Track it: {frontend_url}/orders" if frontend_url else "")
        + "\n\nThank you for shopping with us!"
    )
    try:
        await run_in_threadpool(_send_whatsapp_sync, to_whatsapp, body)
    except Exception as e:
        logging.error(f"WhatsApp order confirmation failed to {phone}: {e}")


async def _send_order_confirmation_email(recipient_email: str, recipient_name: str, order: dict):
    host = os.environ.get("SMTP_HOST", "smtp.gmail.com")
    port = int(os.environ.get("SMTP_PORT", "465"))
    smtp_user = os.environ.get("SMTP_USER", "")
    smtp_password = os.environ.get("SMTP_APP_PASSWORD", "")
    from_name = os.environ.get("SMTP_FROM_NAME", "Innovation Window India")
    from_email = os.environ.get("SMTP_FROM_EMAIL", smtp_user)

    if not smtp_user or not smtp_password:
        logging.warning(f"[SMTP UNCONFIGURED] Order confirmation for {recipient_email}: order {order.get('order_number')}")
        return

    msg = EmailMessage()
    msg["Subject"] = f"Payment confirmed · Order {order.get('order_number')}"
    msg["From"] = f"{from_name} <{from_email}>"
    msg["To"] = recipient_email

    def _line(it):
        variant = f" ({it['variant_label']})" if it.get("variant_label") else ""
        return f"  - {it.get('title')} x{it.get('quantity')}{variant} — ₹{float(it.get('price', 0)) * int(it.get('quantity', 0)):.2f}"

    items_text = "\n".join(_line(it) for it in order.get("items", []))
    text_body = (
        f"Hi {recipient_name or 'there'},\n\n"
        f"Thanks for your order! Payment for order {order.get('order_number')} is confirmed.\n\n"
        f"Items:\n{items_text}\n\n"
        f"Total: ₹{float(order.get('total', 0)):.2f}\n\n"
        f"— Innovation Window India\n"
    )
    def _item_row_html(it):
        variant = f" ({it['variant_label']})" if it.get("variant_label") else ""
        line_total = float(it.get("price", 0)) * int(it.get("quantity", 0))
        return (
            f"<tr><td style='padding:6px 0;color:#4B4A45;'>{it.get('title')} × {it.get('quantity')}{variant}</td>"
            f"<td style='padding:6px 0;text-align:right;color:#20241D;'>₹{line_total:.2f}</td></tr>"
        )

    items_html = "".join(_item_row_html(it) for it in order.get("items", []))
    html_body = f"""
    <html><body style="font-family:Georgia,serif;background:#F7F3EA;padding:32px;color:#20241D;">
      <div style="max-width:520px;margin:0 auto;background:#FFFCF3;border:1px solid #E7DFCF;border-radius:12px;padding:32px;">
        <h1 style="font-size:22px;margin:0 0 12px;color:#20241D;">Payment confirmed</h1>
        <p style="color:#4B4A45;">Hi {recipient_name or 'there'}, thanks for your order — payment for
        <b>{order.get('order_number')}</b> is confirmed.</p>
        <table style="width:100%;border-collapse:collapse;margin:20px 0;">{items_html}</table>
        <p style="font-size:18px;font-weight:600;text-align:right;">Total: ₹{float(order.get('total', 0)):.2f}</p>
        <hr style="border:none;border-top:1px solid #E7DFCF;margin:24px 0;" />
        <p style="color:#8A8578;font-size:12px;">— Innovation Window India · Nourish Naturally</p>
      </div>
    </body></html>
    """
    msg.set_content(text_body)
    msg.add_alternative(html_body, subtype="html")

    try:
        await aiosmtplib.send(
            msg,
            hostname=host,
            port=port,
            username=smtp_user,
            password=smtp_password,
            use_tls=(port == 465),
            start_tls=(port == 587),
            timeout=15,
        )
    except Exception as e:
        logging.error(f"Order confirmation email failed to {recipient_email}: {e}")


def _notify_order_confirmed(order: dict, *, email: str = "", name: str = "", phone: str = ""):
    """Fire-and-forget payment confirmation over email + WhatsApp. Never blocks
    or raises into the calling request — failures are just logged."""
    if email:
        asyncio.create_task(_send_order_confirmation_email(email, name, order))
    if phone:
        asyncio.create_task(_send_order_confirmation_whatsapp(phone, name, order))


# ---------- Per-seller order tracking ----------
def _initial_seller_status(items: List[dict], status: str) -> dict:
    """One tracking entry per distinct seller represented in the order's
    items, so a multi-vendor cart can be tracked/fulfilled seller-by-seller
    independently of the order's own (payment-level) status."""
    now_iso = datetime.now(timezone.utc).isoformat()
    seller_ids = {it.get("seller_id") for it in items if it.get("seller_id")}
    return {
        sid: {
            "status": status,
            "tracking_number": "",
            "carrier": "",
            "updated_at": now_iso,
            "history": [{"status": status, "at": now_iso, "note": "Order placed"}],
        }
        for sid in seller_ids
    }


async def _sellers_snapshot(items: List[dict]) -> dict:
    """Denormalized {seller_id: {name, email}} snapshot stored on the order
    at checkout time, so the buyer's tracker can show "Sold by ..." without
    an extra lookup even if the seller account later changes its name."""
    seller_ids = [it.get("seller_id") for it in items if it.get("seller_id")]
    if not seller_ids:
        return {}
    out = {}
    async for u in db.users.find({"_id": {"$in": [ObjectId(sid) for sid in set(seller_ids)]}}):
        out[str(u["_id"])] = {"name": u.get("name", ""), "email": u.get("email", "")}
    return out


async def _mark_seller_statuses_confirmed(order_doc: dict):
    """Transition every pending per-seller entry to confirmed once payment
    clears (used after a Razorpay payment is verified)."""
    seller_status = order_doc.get("seller_status") or {}
    if not seller_status:
        return
    now_iso = datetime.now(timezone.utc).isoformat()
    set_fields = {}
    for sid, entry in seller_status.items():
        if entry.get("status") == "pending":
            set_fields[f"seller_status.{sid}.status"] = "confirmed"
            set_fields[f"seller_status.{sid}.updated_at"] = now_iso
    if set_fields:
        await db.orders.update_one(
            {"_id": order_doc["_id"]},
            {"$set": set_fields, "$push": {
                f"seller_status.{sid}.history": {"status": "confirmed", "at": now_iso, "note": "Payment received"}
                for sid in seller_status if seller_status[sid].get("status") == "pending"
            }},
        )


# ---------- Orders (mock checkout) ----------
@api_router.post("/orders/checkout")
async def checkout(payload: CheckoutInput, user: dict = Depends(get_current_user)):
    items = await _get_cart_items(user["id"])
    if not items:
        raise HTTPException(status_code=400, detail="Cart is empty")
    subtotal = sum((i["unit_price"] * i["quantity"]) for i in items if i["product"])
    shipping = _shipping_for(subtotal)

    order_items = [{
        "product_id": i["product_id"],
        "title": i["product"]["title"] if i["product"] else "",
        "price": i["unit_price"],
        "quantity": i["quantity"],
        "variant_label": i.get("variant_label", ""),
        "image_url": i["product"]["image_url"] if i["product"] else "",
        "seller_id": i["product"].get("seller_id") if i["product"] else None,
        "gst_rate": i["product"].get("gst_rate", 5) if i["product"] else 5,
    } for i in items]

    tax = _compute_gst(order_items)
    total = round(subtotal + tax + shipping, 2)

    conflicts = await _reserve_stock(order_items)
    if conflicts:
        raise _stock_conflict_response(conflicts)

    order = {
        "user_id": user["id"],
        "items": order_items,
        "address": payload.address,
        "payment_method": payload.payment_method,
        "subtotal": round(subtotal, 2),
        "tax": tax,
        "shipping": shipping,
        "total": total,
        "status": "confirmed",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "order_number": "IWI-" + uuid.uuid4().hex[:10].upper(),
        "status_history": [{
            "status": "confirmed",
            "at": datetime.now(timezone.utc).isoformat(),
            "note": "Order placed",
        }],
        "sellers": await _sellers_snapshot(order_items),
        "seller_status": _initial_seller_status(order_items, "confirmed"),
    }
    res = await db.orders.insert_one(order)
    await db.carts.update_one({"user_id": user["id"]}, {"$set": {"items": []}}, upsert=True)
    order["id"] = str(res.inserted_id)
    order.pop("_id", None)
    _notify_order_confirmed(order, email=user.get("email", ""), name=user.get("name", ""), phone=(payload.address or {}).get("phone", ""))
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
    query = {"_id": oid} if user.get("role") == "admin" else {"_id": oid, "user_id": user["id"]}
    o = await db.orders.find_one(query)
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


ORDER_STATUS_FLOW = ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled", "payment_failed"]


class OrderStatusUpdate(BaseModel):
    status: str
    note: str = ""
    tracking_number: str = ""
    carrier: str = ""


@api_router.patch("/admin/orders/{order_id}/status")
async def admin_update_order_status(order_id: str, payload: OrderStatusUpdate, _: dict = Depends(require_admin)):
    if payload.status not in ORDER_STATUS_FLOW:
        raise HTTPException(status_code=400, detail=f"status must be one of {ORDER_STATUS_FLOW}")
    try:
        oid = ObjectId(order_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid id")
    existing = await db.orders.find_one({"_id": oid})
    if not existing:
        raise HTTPException(status_code=404, detail="Order not found")

    now_iso = datetime.now(timezone.utc).isoformat()
    event = {
        "status": payload.status,
        "at": now_iso,
        "note": payload.note or f"Marked {payload.status} by admin",
    }
    set_fields = {"status": payload.status}
    if payload.tracking_number:
        set_fields["tracking_number"] = payload.tracking_number
    if payload.carrier:
        set_fields["carrier"] = payload.carrier
    if payload.status == "shipped":
        set_fields["shipped_at"] = now_iso
        if payload.tracking_number:
            event["note"] = f"Shipped via {payload.carrier or 'courier'} · {payload.tracking_number}"
    if payload.status == "delivered":
        set_fields["delivered_at"] = now_iso
    if payload.status == "cancelled" and existing.get("status") != "cancelled" and not existing.get("stock_released"):
        # Return the whole order's reserved stock to inventory — once, guarded
        # by stock_released so a repeat cancel call can't double-restock.
        await _release_stock(existing.get("items", []))
        set_fields["stock_released"] = True

    await db.orders.update_one(
        {"_id": oid},
        {"$set": set_fields, "$push": {"status_history": event}},
    )
    updated = await db.orders.find_one({"_id": oid})
    updated["id"] = str(updated["_id"])
    updated.pop("_id", None)
    return updated


SELLER_ORDER_STATUS_FLOW = ["confirmed", "processing", "shipped", "delivered", "cancelled"]


def _seller_order_view(order_doc: dict, seller_id: str) -> dict:
    """Scope a full order down to what one seller should see: their own line
    items and their own fulfillment entry, not other sellers' details."""
    out = dict(order_doc)
    out["id"] = str(out["_id"])
    out.pop("_id", None)
    out["items"] = [it for it in out.get("items", []) if it.get("seller_id") == seller_id]
    out["seller_subtotal"] = round(sum(float(it.get("price", 0)) * int(it.get("quantity", 0)) for it in out["items"]), 2)
    out["seller_fulfillment"] = (out.get("seller_status") or {}).get(seller_id, {})
    out.pop("seller_status", None)
    out.pop("sellers", None)
    return out


@api_router.get("/seller/orders")
async def list_seller_orders(user: dict = Depends(require_seller)):
    if user.get("role") == "admin":
        cursor = db.orders.find({}).sort([("created_at", -1)])
        out = []
        async for o in cursor:
            o["id"] = str(o["_id"])
            o.pop("_id", None)
            out.append(o)
        return {"orders": out}

    cursor = db.orders.find({"items.seller_id": user["id"]}).sort([("created_at", -1)])
    out = [_seller_order_view(o, user["id"]) async for o in cursor]
    return {"orders": out}


class SellerOrderStatusUpdate(BaseModel):
    status: str
    tracking_number: str = ""
    carrier: str = ""


@api_router.patch("/seller/orders/{order_id}/status")
async def seller_update_order_status(order_id: str, payload: SellerOrderStatusUpdate, user: dict = Depends(require_seller)):
    if payload.status not in SELLER_ORDER_STATUS_FLOW:
        raise HTTPException(status_code=400, detail=f"status must be one of {SELLER_ORDER_STATUS_FLOW}")
    try:
        oid = ObjectId(order_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid id")
    order_doc = await db.orders.find_one({"_id": oid})
    if not order_doc:
        raise HTTPException(status_code=404, detail="Order not found")

    seller_id = user["id"]
    if user.get("role") != "admin" and not any(it.get("seller_id") == seller_id for it in order_doc.get("items", [])):
        raise HTTPException(status_code=403, detail="This order doesn't contain any of your products")
    if seller_id not in (order_doc.get("seller_status") or {}):
        raise HTTPException(status_code=404, detail="No fulfillment record for this seller on this order")

    now_iso = datetime.now(timezone.utc).isoformat()
    event = {"status": payload.status, "at": now_iso, "note": f"Marked {payload.status} by seller"}
    set_fields = {
        f"seller_status.{seller_id}.status": payload.status,
        f"seller_status.{seller_id}.updated_at": now_iso,
    }
    if payload.tracking_number:
        set_fields[f"seller_status.{seller_id}.tracking_number"] = payload.tracking_number
        event["note"] = f"Shipped via {payload.carrier or 'courier'} · {payload.tracking_number}"
    if payload.carrier:
        set_fields[f"seller_status.{seller_id}.carrier"] = payload.carrier

    existing_seller_status = (order_doc.get("seller_status") or {}).get(seller_id, {})
    if payload.status == "cancelled" and existing_seller_status.get("status") != "cancelled" and not existing_seller_status.get("stock_released"):
        # Only this seller's own line items go back to inventory — the rest
        # of a multi-vendor order is unaffected. Guarded so a repeat cancel
        # can't double-restock.
        seller_items = [it for it in order_doc.get("items", []) if it.get("seller_id") == seller_id]
        await _release_stock(seller_items)
        set_fields[f"seller_status.{seller_id}.stock_released"] = True

    await db.orders.update_one(
        {"_id": oid},
        {"$set": set_fields, "$push": {f"seller_status.{seller_id}.history": event}},
    )
    updated = await db.orders.find_one({"_id": oid})
    return _seller_order_view(updated, seller_id)


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
    enabled = RAZORPAY_ENABLED and bool(key_id and os.environ.get("RAZORPAY_KEY_SECRET"))
    return {"key_id": key_id if enabled else "", "enabled": enabled}


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
    shipping = _shipping_for(discounted_subtotal)

    # Persist internal pending order first so we can bind to razorpay_order_id
    razorpay_items = [{
        "product_id": i["product_id"],
        "title": i["product"]["title"] if i["product"] else "",
        "price": i["unit_price"],
        "quantity": i["quantity"],
        "variant_label": i.get("variant_label", ""),
        "image_url": i["product"]["image_url"] if i["product"] else "",
        "seller_id": i["product"].get("seller_id") if i["product"] else None,
        "gst_rate": i["product"].get("gst_rate", 5) if i["product"] else 5,
    } for i in items]

    tax = _compute_gst(razorpay_items)
    total = round(discounted_subtotal + tax + shipping, 2)
    amount_paise = int(round(total * 100))

    order = {
        "user_id": user["id"],
        "items": razorpay_items,
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
        "status_history": [{
            "status": "pending",
            "at": datetime.now(timezone.utc).isoformat(),
            "note": "Awaiting payment",
        }],
        "sellers": await _sellers_snapshot(razorpay_items),
        "seller_status": _initial_seller_status(razorpay_items, "pending"),
    }

    conflicts = await _reserve_stock(razorpay_items)
    if conflicts:
        raise _stock_conflict_response(conflicts)

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
        await _release_stock(razorpay_items)
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
        # mark failed and return the stock it had reserved
        try:
            oid = ObjectId(payload.order_id)
            failed_order = await db.orders.find_one({"_id": oid, "user_id": user["id"]})
            if failed_order and not failed_order.get("stock_released"):
                await _release_stock(failed_order.get("items", []))
                await db.orders.update_one({"_id": oid}, {"$set": {"status": "payment_failed", "stock_released": True}})
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
        },
         "$push": {"status_history": {
            "status": "confirmed",
            "at": datetime.now(timezone.utc).isoformat(),
            "note": "Payment received",
         }}},
    )
    # empty cart on successful payment
    await db.carts.update_one({"user_id": user["id"]}, {"$set": {"items": []}}, upsert=True)
    o = await db.orders.find_one({"_id": oid})
    await _mark_seller_statuses_confirmed(o)
    o = await db.orders.find_one({"_id": oid})  # re-fetch to pick up the seller_status transition
    o["id"] = str(o["_id"])
    o.pop("_id", None)
    _notify_order_confirmed(o, email=user.get("email", ""), name=user.get("name", ""), phone=(o.get("address") or {}).get("phone", ""))
    return o


# ---------- Guest checkout ----------
import secrets as _secrets


class GuestContact(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    phone: str = Field(min_length=6, max_length=20)


class GuestAddress(BaseModel):
    line1: str = Field(min_length=1, max_length=200)
    line2: str = ""
    city: str = Field(min_length=1, max_length=120)
    state: str = Field(min_length=1, max_length=120)
    pincode: str = Field(min_length=3, max_length=20)
    country: str = "India"


class GuestCartItem(BaseModel):
    product_id: str
    quantity: int = Field(gt=0, le=99)
    variant_label: str = ""


class GuestCheckoutInput(BaseModel):
    contact: GuestContact
    shipping_address: GuestAddress
    billing_same_as_shipping: bool = True
    billing_address: Optional[GuestAddress] = None
    items: List[GuestCartItem]
    payment_method: str = "mock_card"  # "mock_card" | "mock_cod" | "seller_qr" | "razorpay"
    coupon_code: str = ""


async def _price_guest_items(items: List[GuestCartItem]) -> List[dict]:
    """Load product + variant price for each guest cart item."""
    priced = []
    for it in items:
        try:
            prod = await db.products.find_one({"_id": ObjectId(it.product_id)})
        except Exception:
            prod = None
        if not prod:
            raise HTTPException(status_code=400, detail=f"Product not found: {it.product_id}")
        unit_price = float(prod.get("price", 0))
        for v in prod.get("size_variants", []) or []:
            if v.get("label") == it.variant_label:
                unit_price = float(v.get("price", unit_price))
                break
        priced.append({
            "product_id": it.product_id,
            "title": prod.get("title", ""),
            "price": unit_price,
            "quantity": it.quantity,
            "variant_label": it.variant_label or "",
            "image_url": prod.get("image_url", ""),
            "seller_id": prod.get("seller_id"),
            "gst_rate": prod.get("gst_rate", 5),
        })
    return priced


def _build_guest_order_doc(payload: GuestCheckoutInput, priced_items: List[dict]) -> dict:
    subtotal = sum(i["price"] * i["quantity"] for i in priced_items)
    discount = 0.0
    coupon_applied = None
    contact_dict = payload.contact.model_dump()
    contact_dict["email"] = (contact_dict.get("email") or "").lower()
    return {
        "guest": True,
        "user_id": None,
        "contact": contact_dict,
        "shipping_address": payload.shipping_address.model_dump(),
        "billing_address": (
            payload.shipping_address.model_dump()
            if payload.billing_same_as_shipping or not payload.billing_address
            else payload.billing_address.model_dump()
        ),
        "billing_same_as_shipping": payload.billing_same_as_shipping,
        "items": priced_items,
        "subtotal": round(subtotal, 2),
        "discount": discount,
        "coupon_code": coupon_applied,
        "order_number": "IWI-" + uuid.uuid4().hex[:10].upper(),
        "guest_access_token": _secrets.token_urlsafe(24),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


@api_router.post("/orders/guest/checkout")
async def guest_checkout(payload: GuestCheckoutInput):
    """Guest checkout for mock_card / mock_cod (no real payment)."""
    if not payload.items:
        raise HTTPException(status_code=400, detail="Cart is empty")
    if payload.payment_method not in ("mock_card", "mock_cod", "seller_qr"):
        raise HTTPException(status_code=400, detail="Use /orders/guest/create-razorpay for Razorpay payments")

    priced = await _price_guest_items(payload.items)
    order = _build_guest_order_doc(payload, priced)

    subtotal = order["subtotal"]
    discount = 0.0
    if payload.coupon_code:
        val = await _validate_coupon(payload.coupon_code, subtotal)
        if not val.get("valid"):
            raise HTTPException(status_code=400, detail=val.get("reason", "Invalid coupon"))
        discount = float(val["discount"])
        order["coupon_code"] = val["code"]
    order["discount"] = discount
    discounted = max(0.0, round(subtotal - discount, 2))
    order["tax"] = _compute_gst(priced)
    order["shipping"] = _shipping_for(discounted)
    order["total"] = round(discounted + order["tax"] + order["shipping"], 2)
    order["payment_method"] = payload.payment_method
    order["status"] = "confirmed"
    order["status_history"] = [{
        "status": "confirmed",
        "at": datetime.now(timezone.utc).isoformat(),
        "note": "Guest order placed",
    }]
    order["sellers"] = await _sellers_snapshot(priced)
    order["seller_status"] = _initial_seller_status(priced, "confirmed")

    conflicts = await _reserve_stock(priced)
    if conflicts:
        raise _stock_conflict_response(conflicts)

    res = await db.orders.insert_one(order)
    if order["coupon_code"]:
        await db.coupons.update_one({"code": order["coupon_code"]}, {"$inc": {"uses": 1}})
    order["id"] = str(res.inserted_id)
    order.pop("_id", None)
    _notify_order_confirmed(order, email=payload.contact.email, name=payload.contact.name, phone=payload.contact.phone)
    return order


@api_router.post("/orders/guest/create-razorpay")
async def guest_create_razorpay(payload: GuestCheckoutInput):
    client_rzp = get_razorpay_client()
    if client_rzp is None:
        raise HTTPException(status_code=503, detail="Razorpay is not configured on this server.")
    if not payload.items:
        raise HTTPException(status_code=400, detail="Cart is empty")

    priced = await _price_guest_items(payload.items)
    order = _build_guest_order_doc(payload, priced)

    subtotal = order["subtotal"]
    discount = 0.0
    if payload.coupon_code:
        val = await _validate_coupon(payload.coupon_code, subtotal)
        if not val.get("valid"):
            raise HTTPException(status_code=400, detail=val.get("reason", "Invalid coupon"))
        discount = float(val["discount"])
        order["coupon_code"] = val["code"]
    order["discount"] = discount
    discounted = max(0.0, round(subtotal - discount, 2))
    order["tax"] = _compute_gst(priced)
    order["shipping"] = _shipping_for(discounted)
    order["total"] = round(discounted + order["tax"] + order["shipping"], 2)
    order["payment_method"] = "razorpay"
    order["status"] = "pending"
    order["status_history"] = [{
        "status": "pending",
        "at": datetime.now(timezone.utc).isoformat(),
        "note": "Awaiting guest payment",
    }]
    order["sellers"] = await _sellers_snapshot(priced)
    order["seller_status"] = _initial_seller_status(priced, "pending")

    conflicts = await _reserve_stock(priced)
    if conflicts:
        raise _stock_conflict_response(conflicts)

    res = await db.orders.insert_one(order)
    our_order_id = str(res.inserted_id)
    amount_paise = int(round(order["total"] * 100))
    try:
        rzp_order = client_rzp.order.create({
            "amount": amount_paise,
            "currency": "INR",
            "receipt": order["order_number"][:40],
            "payment_capture": 1,
            "notes": {"internal_order_id": our_order_id, "guest_email": payload.contact.email},
        })
    except Exception as e:
        await db.orders.delete_one({"_id": res.inserted_id})
        await _release_stock(priced)
        raise HTTPException(status_code=502, detail=f"Razorpay order creation failed: {str(e)}")

    await db.orders.update_one({"_id": res.inserted_id},
                               {"$set": {"razorpay_order_id": rzp_order["id"]}})
    if order["coupon_code"]:
        await db.coupons.update_one({"code": order["coupon_code"]}, {"$inc": {"uses": 1}})

    return {
        "order_id": our_order_id,
        "order_number": order["order_number"],
        "guest_access_token": order["guest_access_token"],
        "amount": amount_paise,
        "currency": "INR",
        "razorpay_order_id": rzp_order["id"],
        "key_id": os.environ.get("RAZORPAY_KEY_ID", ""),
    }


class GuestVerifyInput(BaseModel):
    order_id: str
    guest_access_token: str
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


@api_router.post("/orders/guest/verify-razorpay")
async def guest_verify_razorpay(payload: GuestVerifyInput):
    key_secret = os.environ.get("RAZORPAY_KEY_SECRET", "")
    if not key_secret:
        raise HTTPException(status_code=503, detail="Razorpay is not configured")
    try:
        oid = ObjectId(payload.order_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid order id")
    o = await db.orders.find_one({"_id": oid, "guest_access_token": payload.guest_access_token})
    if not o:
        raise HTTPException(status_code=404, detail="Order not found")

    body = f"{payload.razorpay_order_id}|{payload.razorpay_payment_id}".encode("utf-8")
    expected = hmac.new(key_secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, payload.razorpay_signature):
        if not o.get("stock_released"):
            await _release_stock(o.get("items", []))
            await db.orders.update_one({"_id": oid}, {"$set": {"status": "payment_failed", "stock_released": True}})
        else:
            await db.orders.update_one({"_id": oid}, {"$set": {"status": "payment_failed"}})
        raise HTTPException(status_code=400, detail="Invalid payment signature")

    now = datetime.now(timezone.utc).isoformat()
    await db.orders.update_one(
        {"_id": oid},
        {"$set": {
            "status": "confirmed",
            "razorpay_payment_id": payload.razorpay_payment_id,
            "razorpay_signature": payload.razorpay_signature,
            "paid_at": now,
        },
         "$push": {"status_history": {"status": "confirmed", "at": now, "note": "Payment received"}}},
    )
    o = await db.orders.find_one({"_id": oid})
    await _mark_seller_statuses_confirmed(o)
    o = await db.orders.find_one({"_id": oid})  # re-fetch to pick up the seller_status transition
    o["id"] = str(o["_id"])
    o.pop("_id", None)
    contact = o.get("contact") or {}
    _notify_order_confirmed(o, email=contact.get("email", ""), name=contact.get("name", ""), phone=contact.get("phone", ""))
    return o


@api_router.get("/orders/guest/{order_id}")
async def guest_get_order(order_id: str, t: str = Query(..., min_length=8, max_length=200)):
    """Return a guest order using its access token. No auth required."""
    try:
        oid = ObjectId(order_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid id")
    o = await db.orders.find_one({"_id": oid, "guest_access_token": t})
    if not o:
        raise HTTPException(status_code=404, detail="Order not found")
    o["id"] = str(o["_id"])
    o.pop("_id", None)
    return o


class GuestLookupInput(BaseModel):
    order_number: str
    email: EmailStr


@api_router.post("/orders/guest/lookup")
async def guest_lookup(payload: GuestLookupInput):
    """Guest tracks an order by (order_number, email). Returns access token + order."""
    o = await db.orders.find_one({
        "order_number": payload.order_number.strip().upper(),
        "contact.email": payload.email.lower(),
    })
    if not o:
        raise HTTPException(status_code=404, detail="No matching order found")
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
@api_router.get("/reviews/top")
async def top_reviews(limit: int = 20):
    cursor = db.reviews.find({"rating": {"$gte": 4}}).sort([("created_at", -1)]).limit(limit)
    out = []
    async for r in cursor:
        prod_title = ""
        try:
            prod = await db.products.find_one({"_id": ObjectId(r["product_id"])})
            prod_title = prod.get("title", "") if prod else ""
        except Exception:
            pass
        out.append({
            "id": str(r["_id"]),
            "user_name": r.get("user_name", "Customer"),
            "rating": r.get("rating"),
            "title": r.get("title", ""),
            "comment": r.get("comment", ""),
            "created_at": r.get("created_at"),
            "product_id": r.get("product_id"),
            "product_title": prod_title,
        })
    return {"reviews": out}


@api_router.post("/webhooks/razorpay")
async def razorpay_webhook(request: Request):
    if not RAZORPAY_ENABLED:
        raise HTTPException(status_code=503, detail="Razorpay integration is currently disabled")
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
                if o.get("user_id"):
                    await db.carts.update_one({"user_id": o["user_id"]}, {"$set": {"items": []}}, upsert=True)
                await _mark_seller_statuses_confirmed(o)
                if o.get("guest"):
                    contact = o.get("contact") or {}
                    email, name, phone = contact.get("email", ""), contact.get("name", ""), contact.get("phone", "")
                else:
                    buyer = await db.users.find_one({"_id": ObjectId(o["user_id"])}) if o.get("user_id") else None
                    email = buyer.get("email", "") if buyer else ""
                    name = buyer.get("name", "") if buyer else ""
                    phone = (o.get("address") or {}).get("phone", "")
                _notify_order_confirmed(o, email=email, name=name, phone=phone)
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


# ---------- Admin sales overview ----------
NON_REVENUE_STATUSES = {"cancelled", "payment_failed"}


@api_router.get("/admin/stats")
async def admin_stats(_: dict = Depends(require_admin)):
    total_orders = 0
    total_revenue = 0.0
    orders_by_status: dict = {}
    async for o in db.orders.find({}, {"status": 1, "total": 1}):
        total_orders += 1
        status = o.get("status") or "pending"
        orders_by_status[status] = orders_by_status.get(status, 0) + 1
        if status not in NON_REVENUE_STATUSES:
            total_revenue += float(o.get("total", 0) or 0)

    total_products = await db.products.count_documents({})
    pending_products = await db.products.count_documents({"approval_status": "pending"})
    total_sellers = await db.users.count_documents({"role": "seller"})
    total_customers = await db.users.count_documents({"role": "customer"})
    open_complaints = await db.complaints.count_documents({"status": {"$in": ["open", "in_progress"]}})

    return {
        "total_orders": total_orders,
        "total_revenue": round(total_revenue, 2),
        "orders_by_status": orders_by_status,
        "total_products": total_products,
        "pending_products": pending_products,
        "total_sellers": total_sellers,
        "total_customers": total_customers,
        "open_complaints": open_complaints,
    }


@api_router.get("/admin/stats/sellers")
async def admin_seller_stats(_: dict = Depends(require_admin)):
    """Seller-wise gist: per-seller order/item/revenue counts and how many of
    their fulfillments are still open, computed from every order's items."""
    sellers: dict = {}
    async for u in db.users.find({"role": "seller"}):
        sid = str(u["_id"])
        sellers[sid] = {
            "seller_id": sid, "name": u.get("name", ""), "email": u.get("email", ""),
            "orders": 0, "items_sold": 0, "revenue": 0.0, "pending_fulfillments": 0,
        }

    async for o in db.orders.find({}, {"items": 1, "seller_status": 1, "status": 1}):
        order_status = o.get("status") or "pending"
        seller_status = o.get("seller_status") or {}
        sellers_in_order = set()
        for it in o.get("items", []):
            sid = it.get("seller_id")
            if not sid or sid not in sellers:
                continue
            sellers_in_order.add(sid)
            if order_status not in NON_REVENUE_STATUSES:
                sellers[sid]["items_sold"] += int(it.get("quantity", 0))
                sellers[sid]["revenue"] += float(it.get("price", 0)) * int(it.get("quantity", 0))
        for sid in sellers_in_order:
            sellers[sid]["orders"] += 1
            fulfillment_status = seller_status.get(sid, {}).get("status")
            if fulfillment_status and fulfillment_status not in ("delivered", "cancelled"):
                sellers[sid]["pending_fulfillments"] += 1

    out = sorted(sellers.values(), key=lambda s: s["revenue"], reverse=True)
    for s in out:
        s["revenue"] = round(s["revenue"], 2)
    return {"items": out}


# ---------- Complaints / issues (raised by buyers & sellers) ----------
COMPLAINT_STATUSES = ["open", "in_progress", "resolved", "closed"]


class ComplaintIn(BaseModel):
    subject: str = Field(min_length=1, max_length=200)
    message: str = Field(min_length=1, max_length=2000)
    order_id: Optional[str] = None
    product_id: Optional[str] = None


class ComplaintStatusUpdate(BaseModel):
    status: str
    admin_response: str = ""


def complaint_doc_to_out(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "user_id": doc.get("user_id", ""),
        "user_name": doc.get("user_name", ""),
        "user_email": doc.get("user_email", ""),
        "role": doc.get("role", "customer"),
        "subject": doc.get("subject", ""),
        "message": doc.get("message", ""),
        "order_id": doc.get("order_id"),
        "product_id": doc.get("product_id"),
        "status": doc.get("status", "open"),
        "admin_response": doc.get("admin_response", ""),
        "created_at": doc.get("created_at", ""),
        "updated_at": doc.get("updated_at", doc.get("created_at", "")),
    }


@api_router.post("/complaints")
async def create_complaint(payload: ComplaintIn, user: dict = Depends(get_current_user)):
    now_iso = datetime.now(timezone.utc).isoformat()
    doc = {
        "user_id": user["id"],
        "user_name": user.get("name", ""),
        "user_email": user.get("email", ""),
        "role": user.get("role", "customer"),
        "subject": payload.subject.strip(),
        "message": payload.message.strip(),
        "order_id": payload.order_id or None,
        "product_id": payload.product_id or None,
        "status": "open",
        "admin_response": "",
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    res = await db.complaints.insert_one(doc)
    doc["_id"] = res.inserted_id
    return complaint_doc_to_out(doc)


@api_router.get("/complaints/mine")
async def list_my_complaints(user: dict = Depends(get_current_user)):
    cursor = db.complaints.find({"user_id": user["id"]}).sort([("created_at", -1)])
    items = [complaint_doc_to_out(d) async for d in cursor]
    return {"items": items}


@api_router.get("/admin/complaints")
async def admin_list_complaints(status: Optional[str] = None, _: dict = Depends(require_admin)):
    query = {}
    if status:
        if status not in COMPLAINT_STATUSES:
            raise HTTPException(status_code=400, detail=f"status must be one of {COMPLAINT_STATUSES}")
        query["status"] = status
    cursor = db.complaints.find(query).sort([("created_at", -1)])
    items = [complaint_doc_to_out(d) async for d in cursor]
    return {"items": items}


@api_router.patch("/admin/complaints/{complaint_id}")
async def admin_update_complaint(complaint_id: str, payload: ComplaintStatusUpdate, _: dict = Depends(require_admin)):
    if payload.status not in COMPLAINT_STATUSES:
        raise HTTPException(status_code=400, detail=f"status must be one of {COMPLAINT_STATUSES}")
    try:
        oid = ObjectId(complaint_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid id")
    doc = await db.complaints.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Complaint not found")
    update = {"status": payload.status, "updated_at": datetime.now(timezone.utc).isoformat()}
    if payload.admin_response:
        update["admin_response"] = payload.admin_response
    await db.complaints.update_one({"_id": oid}, {"$set": update})
    doc.update(update)
    return complaint_doc_to_out(doc)


# ---------- Root ----------
@api_router.get("/")
async def root():
    return {"message": "Innovation Window India API", "version": "1.0"}


app.include_router(api_router)
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

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
    await db.complaints.create_index("user_id")
    await db.complaints.create_index("status")
    # TTL: MongoDB purges expired reset tokens automatically
    await db.password_reset_tokens.create_index("expires_at", expireAfterSeconds=0)
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
    elif not existing.get("password_reset_at") and not verify_password(admin_password, existing["password_hash"]):
        # Keeps the admin account in sync with ADMIN_PASSWORD on restart —
        # but only until the admin sets their own password via "Forgot
        # password?", after which self-service resets are never clobbered.
        await db.users.update_one({"email": admin_email},
                                  {"$set": {"password_hash": hash_password(admin_password),
                                            "role": "admin"}})


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
