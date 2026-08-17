import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCart } from "@/context/CartContext";
import { Trash2, Plus, Minus } from "lucide-react";
import api, { resolveUploadUrl } from "@/lib/api";

export default function Cart() {
  const { cart, updateQty, removeItem, isGuest } = useCart();
  const navigate = useNavigate();
  const [shippingCfg, setShippingCfg] = useState({ flat_fee: 6.99, free_threshold: 75 });

  useEffect(() => {
    api.get("/config/shipping").then((r) => setShippingCfg(r.data));
  }, []);

  const shipping = cart.subtotal === 0 ? 0 : (cart.subtotal >= shippingCfg.free_threshold ? 0 : shippingCfg.flat_fee);
  // Each product carries its own GST rate (5% or 18%) set by its seller —
  // sum per line item rather than applying one flat rate to the cart.
  const tax = +cart.items.reduce((sum, it) => sum + it.unit_price * it.quantity * ((it.product?.gst_rate ?? 5) / 100), 0).toFixed(2);
  const total = +(cart.subtotal + tax + shipping).toFixed(2);
  const remaining = Math.max(0, shippingCfg.free_threshold - cart.subtotal);

  return (
    <div className="max-w-screen-xl mx-auto px-4 md:px-6 py-8 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8">
      <section className="bg-surface border border-warm rounded-lg p-6">
        <div className="text-[11px] tracking-[0.3em] uppercase text-sage mb-1">Your basket</div>
        <h1 className="font-heading text-3xl font-semibold">Cart</h1>

        {cart.items.length === 0 ? (
          <div className="py-16 text-center">
            <div className="font-heading text-xl">Your basket is empty.</div>
            <p className="text-sm text-muted-warm mt-2">A moment of pause. Then browse the shelf.</p>
            <Link
              to="/products"
              data-testid="cart-shop-link"
              className="mt-4 inline-block bg-ink text-cream text-sm px-5 py-2.5 rounded-full hover:bg-terracotta transition-colors"
            >
              Continue shopping
            </Link>
          </div>
        ) : (
          <ul className="mt-6 divide-y divide-warm">
            {cart.items.map((it) => {
              const key = `${it.product_id}::${it.variant_label || ""}`;
              return (
                <li key={key} className="py-5 flex gap-4" data-testid={`cart-item-${it.product_id}`}>
                  <Link to={`/product/${it.product_id}`} className="w-24 h-24 shrink-0 bg-parchment/40 border border-warm rounded flex items-center justify-center">
                    <img src={resolveUploadUrl(it.product?.image_url)} className="max-w-full max-h-full object-contain" alt={it.product?.title} />
                  </Link>
                  <div className="flex-1 min-w-0">
                    <Link to={`/product/${it.product_id}`} className="font-heading text-base font-semibold text-ink line-clamp-2 hover:text-terracotta transition-colors">
                      {it.product?.title}
                    </Link>
                    <div className="text-xs text-muted-warm mt-1">
                      {it.product?.category}
                      {it.variant_label && <> · <span className="text-ink">{it.variant_label}</span></>}
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <div className="inline-flex items-center border border-warm rounded-full bg-cream">
                        <button
                          onClick={() => updateQty(it.product_id, it.quantity - 1, it.variant_label)}
                          data-testid={`cart-qty-dec-${it.product_id}`}
                          className="w-8 h-8 rounded-l-full hover:bg-parchment"
                        >
                          <Minus size={12} className="mx-auto" />
                        </button>
                        <span className="px-3 text-sm" data-testid={`cart-qty-${it.product_id}`}>{it.quantity}</span>
                        <button
                          onClick={() => updateQty(it.product_id, it.quantity + 1, it.variant_label)}
                          data-testid={`cart-qty-inc-${it.product_id}`}
                          className="w-8 h-8 rounded-r-full hover:bg-parchment"
                        >
                          <Plus size={12} className="mx-auto" />
                        </button>
                      </div>
                      <button
                        onClick={() => removeItem(it.product_id, it.variant_label)}
                        data-testid={`cart-remove-${it.product_id}`}
                        className="text-xs text-muted-warm hover:text-terracotta transition-colors flex items-center gap-1"
                      >
                        <Trash2 size={12} /> Remove
                      </button>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-heading text-lg font-semibold text-ink">
                      ₹{(it.unit_price * it.quantity).toFixed(2)}
                    </div>
                    <div className="text-xs text-muted-warm">₹{it.unit_price.toFixed(2)} each</div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <aside className="bg-surface border border-warm rounded-lg p-6 h-fit">
        <div className="font-heading text-xl font-semibold mb-4">Order summary</div>
        {cart.items.length > 0 && (
          <div className="mb-4" data-testid="free-shipping-progress">
            {remaining > 0 ? (
              <>
                <div className="text-xs text-sage mb-2">
                  Add <span className="font-semibold">₹{remaining.toFixed(2)}</span> more for complimentary shipping.
                </div>
                <div className="h-1.5 bg-parchment rounded-full overflow-hidden">
                  <div
                    className="h-full bg-sage transition-[width] duration-500 ease-out"
                    style={{ width: `${Math.min(100, (cart.subtotal / shippingCfg.free_threshold) * 100)}%` }}
                  />
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2 text-xs text-sage bg-sage/10 border border-sage/20 rounded-md px-3 py-2">
                <span className="text-base">✓</span>
                <span>You've unlocked <span className="font-semibold">complimentary shipping</span>.</span>
              </div>
            )}
          </div>
        )}
        <div className="text-sm space-y-2">
          <div className="flex justify-between"><span className="text-muted-warm">Subtotal</span><span data-testid="cart-subtotal">₹{cart.subtotal.toFixed(2)}</span></div>
          <div className="flex justify-between"><span className="text-muted-warm">Shipping</span><span>{shipping === 0 && cart.subtotal > 0 ? <span className="text-sage">Free</span> : `₹${shipping.toFixed(2)}`}</span></div>
          <div className="flex justify-between"><span className="text-muted-warm">GST</span><span>₹{tax.toFixed(2)}</span></div>
          <div className="flex justify-between font-heading text-lg font-semibold border-t border-warm pt-3 mt-3">
            <span>Total</span><span data-testid="cart-total">₹{total.toFixed(2)}</span>
          </div>
        </div>
        <button
          onClick={() => navigate(isGuest ? "/guest-checkout" : "/checkout")}
          disabled={cart.items.length === 0}
          data-testid="cart-checkout-btn"
          className="w-full mt-5 bg-ink text-cream text-sm font-medium rounded-full py-3 hover:bg-terracotta transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isGuest ? "Continue as guest" : "Proceed to checkout"}
        </button>
        {isGuest && cart.items.length > 0 && (
          <div className="text-[11px] text-muted-warm text-center mt-3">
            Have an account? <Link to="/login" className="text-terracotta hover:underline" data-testid="cart-signin-link">Sign in to save your order.</Link>
          </div>
        )}
      </aside>
    </div>
  );
}
