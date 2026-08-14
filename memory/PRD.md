# Innovation Window India — PRD

## Original Problem Statement
> "Build an e-commerce web app for an artisanal wellness brand. Create a product catalogue with categories like Teas, Spices, and Artisanal Goods. Each product should have a name, price, description, and an option to select different sizes. Include a shopping cart and a checkout flow that adds a flat-rate shipping fee to every order."

Brand: **Innovation Window India** — Tagline: *Nourish Naturally*

## User Personas
- **Wellness Buyer** — browses teas/spices/artisanal goods, chooses a size, checks out.
- **Admin (owner)** — signs in at `/admin`, creates products with size variants, sees all orders.

## Static Requirements
- Categories: Teas, Spices, Artisanal Goods.
- Per-product: name, brand, description, category, image, base price, size variants (label + price + stock).
- Flat-rate shipping ₹6.99 with FREE above ₹75 (env-driven `FLAT_SHIPPING_FEE`, `FREE_SHIPPING_THRESHOLD`).
- Tax 5%.
- Mock checkout (no real payment gateway).
- Apothecary design (cream + deep forest ink + terracotta accent; Fraunces + DM Sans).

## Implemented (2026-07-18)
- **Auth**: JWT (24h) via httpOnly cookies. Admin seeded from `.env` at startup.
- **Products**: CRUD, size_variants, categories, search (q), filter (category, price), sort (price/rating).
- **Cart**: variant-aware (product_id + variant_label composite key), qty controls, unit_price reflects chosen variant.
- **Checkout**: address form, mock card / COD, tax + shipping math, order confirmation with `IWI-XXXXXXXXXX` number.
- **Orders**: customer history + admin all-orders view.
- **Admin panel**: add/edit/delete products, manage size variants inline, tab for orders, "Seed 8 demo products" button.
- **UI/UX**: apothecary palette, Fraunces serif headings, DM Sans body, IWI logo integrated in header/footer/auth screens.
- **Seed catalog (8 products)**: Butterfly Pea Flower Tea, Marigold Petals, TRJU Coriander Powder, Marwar Red Chilli Powder, Tata Cold-Pressed Mustard Oil, Ashwagandhadi Churna, Himalayan Forest Honey, Tulsi Japa Mala — all with size variants and user-provided imagery.

## Implemented (2026-08+)
- Razorpay checkout + `payment.captured` webhook (HMAC verified).
- Coupons (admin CRUD + `/api/coupons/apply`).
- Product reviews with rating aggregation.
- Wishlist context + page.
- Mobile sticky bottom nav (MobileNav.jsx).
- Animated customer testimonials marquee on home.
- Tiranga soft background + Nothing OS dot-matrix header clock.

## Implemented (2026-02-XX) — Guest Cart Merge
- New `POST /api/cart/merge` — accepts an array of `{product_id, quantity, variant_label}` and merges into the signed-in user's server cart (existing quantities are added to, not replaced).
- `CartContext.mergeGuestCartToServer()` fires automatically on the guest → authed transition; localStorage guest cart is wiped only after a successful merge (retained on failure so nothing is lost).
- Verified E2E: guest cart with 2 items → register a fresh user → server cart has both items, localStorage cleared, "Continue as guest" replaced by "Proceed to checkout".

## Implemented (2026-02-XX) — Guest Checkout + Better Errors
- `POST /api/orders/guest/checkout` — mock_card / mock_cod path for guests.
- `POST /api/orders/guest/create-razorpay` + `POST /api/orders/guest/verify-razorpay` — Razorpay flow for guests, HMAC verified.
- `GET /api/orders/guest/{id}?t=<token>` — order fetch by access token (no auth).
- `POST /api/orders/guest/lookup` — order tracking by `(order_number, email)`; returns the order + access token.
- Guest orders have `guest: True`, `contact: {name, email, phone}`, `shipping_address`, `billing_address`, `guest_access_token`.
- Frontend: new `GuestCheckout.jsx` (contact + shipping + billing-same-as-shipping toggle + Razorpay/mock/COD), new `TrackOrder.jsx` (order # + email → tracking timeline), refactored `CartContext` so **guests** can add to cart (localStorage-backed) with automatic hydration on refresh.
- Better API error messaging via new `formatApiError` helper (distinguishes "cannot reach server" from a JSON API error) — fixes the confusing "Something went wrong" on the live cPanel site when the backend is not running.
- ProductCard + ProductDetail no longer force sign-in before add-to-cart; buy-now sends guests straight to `/guest-checkout`.

## Implemented (2026-02-XX) — Order Tracking Timeline
- Order status flow: `pending → confirmed → processing → shipped → delivered` (+ `cancelled`, `payment_failed`).
- Every order stores a `status_history[]` array with `{status, at, note}` events.
- `checkout` and `create-razorpay` seed the history; `verify-razorpay` appends `confirmed` on payment success.
- `PATCH /api/admin/orders/{id}/status` — admin sets status + optional `tracking_number` + `carrier`; auto-stamps `shipped_at` / `delivered_at`.
- `GET /api/orders/{id}` now accessible to admins for any order (owner-only for regular users).
- `frontend/src/components/OrderTimeline.jsx` — animated 4-step timeline with connector lines, event notes and tracking chip.
- Order confirmation page renders the timeline; Orders history page has a "Track order →" deep link.
- Admin › Orders tab now has per-row status Select + tracking # + carrier inputs + Save with toast feedback.

## Implemented (2026-02-XX) — cPanel deployment prep
- `backend/passenger_wsgi.py` bridging FastAPI (ASGI) to Passenger (WSGI) via `a2wsgi`.
- `frontend/public/.htaccess` — HTTPS redirect, SPA rewrite, gzip, immutable asset caching, security headers.
- `backend/.env.production.example` + `frontend/.env.production.example`.
- `CPANEL_DEPLOYMENT.md` — end-to-end step-by-step for `innovationwindowindia.com`.
- `a2wsgi==1.10.7` added to `requirements.txt` (verified `application` object loads).

## Test Coverage
- Iteration 1 (Amazon prototype): 100% (retired).
- Iteration 2 (IWI apothecary pivot): backend 23/23 pytest, frontend all flows PASS.
- Iteration 3 (Razorpay + mobile nav + testimonials): PASS.

## Prioritized Backlog
### P0 — Ready for production polish
- Rotate `JWT_SECRET` and `ADMIN_PASSWORD` before going live on cPanel.
- Switch Razorpay keys from TEST to LIVE after KYC.
- Provision MongoDB Atlas and whitelist the cPanel outbound IP.

### P1 — Business growth
- Product reviews (customer written) + review moderation in admin.
- Wishlist / save-for-later.
- Coupon codes and gift cards.
- Real payment gateway (Razorpay recommended for India, Stripe otherwise).
- Order status transitions (confirmed → shipped → delivered) + tracking.

### P2 — Nice-to-have
- Related products on detail page.
- Newsletter capture (with Resend or similar).
- Multi-image gallery per product.
- SEO metadata & sitemap.

## Credentials
- Admin: `admin@shop.com` / `admin123` (auto-seeded)
