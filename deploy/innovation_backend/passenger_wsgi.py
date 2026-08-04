"""
Passenger WSGI entrypoint for cPanel hosting.

cPanel's Phusion Passenger speaks WSGI, but FastAPI is an ASGI framework.
We use `a2wsgi` to bridge the two so the same `app` instance used in
development (via uvicorn) can be served in production via Passenger.

cPanel > Setup Python App > Application startup file: passenger_wsgi.py
                          > Application Entry point: application
"""
import os
import sys

# Ensure the backend directory is on the import path so `server` resolves
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

# Load environment variables from .env sitting next to this file.
# Passenger does NOT automatically read .env, so we load it explicitly.
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(BASE_DIR, ".env"))
except Exception:
    pass

from a2wsgi import ASGIMiddleware  # noqa: E402
from server import app as asgi_app  # noqa: E402

# Passenger looks for `application` by default
application = ASGIMiddleware(asgi_app)
