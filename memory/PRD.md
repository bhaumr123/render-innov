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

## Test Coverage
- Iteration 1 (Amazon prototype): 100% (retired).
- Iteration 2 (IWI apothecary pivot): backend 23/23 pytest, frontend all flows PASS.

## Prioritized Backlog
### P0 — Ready for production polish
- Explicit `CORS_ORIGINS` list (currently `*` with credentials).
- `secure=True` cookies for HTTPS deployments.
- Pydantic `AddressModel` at API layer.

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
