"""Setu Bridge KYC verification client — PAN, GSTIN, and bank account
(penny drop) verification.

Setu provisions each Bridge product (PAN Verification, GST Verification,
Bank Account Verification) separately in their dashboard
(https://bridge.setu.co) and issues one product-instance-id per product;
client-id/client-secret are shared across all products under the same org.
Sign up / request sandbox access at https://setu.co/data/kyc.

Endpoints, headers and payload shapes below are Setu's documented Bridge
KYC APIs as of when this was written:
  - PAN:          https://docs.setu.co/data/pan/api-reference
  - GST:          https://docs.setu.co/data/gst/quickstart
  - Bank account: https://docs.setu.co/data/bav/penny-drop/api-integration/sync
Re-check those pages against your dashboard before going live — Setu can
revise paths/payloads, and sandbox vs. production product instances are
configured independently.

All calls here are synchronous (`requests`) — callers on the FastAPI side
should wrap them in `starlette.concurrency.run_in_threadpool`, same as the
existing Twilio integration in server.py.
"""
import os
import requests

SETU_BASE_URL = os.environ.get("SETU_BASE_URL", "https://dg-sandbox.setu.co").rstrip("/")
SETU_CLIENT_ID = os.environ.get("SETU_CLIENT_ID", "")
SETU_CLIENT_SECRET = os.environ.get("SETU_CLIENT_SECRET", "")
# Each Bridge product has its own product-instance-id — set only the ones
# you've actually provisioned; the corresponding verify_* call is disabled
# (raises SetuNotConfigured) until its ID is set.
SETU_PAN_PRODUCT_INSTANCE_ID = os.environ.get("SETU_PAN_PRODUCT_INSTANCE_ID", "")
SETU_GST_PRODUCT_INSTANCE_ID = os.environ.get("SETU_GST_PRODUCT_INSTANCE_ID", "")
SETU_BAV_PRODUCT_INSTANCE_ID = os.environ.get("SETU_BAV_PRODUCT_INSTANCE_ID", "")

_REQUEST_TIMEOUT = 15  # seconds


class SetuNotConfigured(RuntimeError):
    """Raised when the env vars for the requested verification aren't set."""


def _headers(product_instance_id: str) -> dict:
    return {
        "x-client-id": SETU_CLIENT_ID,
        "x-client-secret": SETU_CLIENT_SECRET,
        "x-product-instance-id": product_instance_id,
        "Content-Type": "application/json",
    }


def pan_configured() -> bool:
    return bool(SETU_CLIENT_ID and SETU_CLIENT_SECRET and SETU_PAN_PRODUCT_INSTANCE_ID)


def gst_configured() -> bool:
    return bool(SETU_CLIENT_ID and SETU_CLIENT_SECRET and SETU_GST_PRODUCT_INSTANCE_ID)


def bank_account_configured() -> bool:
    return bool(SETU_CLIENT_ID and SETU_CLIENT_SECRET and SETU_BAV_PRODUCT_INSTANCE_ID)


def verify_pan_sync(pan: str, reason: str = "Seller KYC verification for marketplace onboarding") -> dict:
    """POST /api/verify/pan. Returns the parsed response body — check
    body["verification"] == "success" and body["data"]["full_name"] etc.
    Raises SetuNotConfigured if unset, requests.HTTPError on non-2xx."""
    if not pan_configured():
        raise SetuNotConfigured("SETU_CLIENT_ID / SETU_CLIENT_SECRET / SETU_PAN_PRODUCT_INSTANCE_ID not set")
    resp = requests.post(
        f"{SETU_BASE_URL}/api/verify/pan",
        json={"pan": pan, "consent": "Y", "reason": reason},
        headers=_headers(SETU_PAN_PRODUCT_INSTANCE_ID),
        timeout=_REQUEST_TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json()


def verify_gst_sync(gstin: str) -> dict:
    """POST /api/verify/gst. Returns the parsed response body — check
    body["verification"] == "success" and body["data"]["company"]["status"]."""
    if not gst_configured():
        raise SetuNotConfigured("SETU_CLIENT_ID / SETU_CLIENT_SECRET / SETU_GST_PRODUCT_INSTANCE_ID not set")
    resp = requests.post(
        f"{SETU_BASE_URL}/api/verify/gst",
        json={"gstin": gstin},
        headers=_headers(SETU_GST_PRODUCT_INSTANCE_ID),
        timeout=_REQUEST_TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json()


def verify_bank_account_sync(account_number: str, ifsc: str) -> dict:
    """POST /api/verify/ban (synchronous penny drop). Returns the parsed
    response body — check body["verification"] == "success" and
    body["data"]["name"] (account holder name, for a manual name-match)."""
    if not bank_account_configured():
        raise SetuNotConfigured("SETU_CLIENT_ID / SETU_CLIENT_SECRET / SETU_BAV_PRODUCT_INSTANCE_ID not set")
    resp = requests.post(
        f"{SETU_BASE_URL}/api/verify/ban",
        json={"ifsc": ifsc, "accountNumber": account_number},
        headers=_headers(SETU_BAV_PRODUCT_INSTANCE_ID),
        timeout=_REQUEST_TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json()
