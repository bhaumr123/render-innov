import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCart } from "@/context/CartContext";
import { Trash2, Plus, Minus } from "lucide-react";

export default function Cart() {
  const { cart, updateQty, removeItem } = useCart();
  const navigate = useNavigate();

  const shipping = cart.subtotal >= 35 || cart.subtotal === 0 ? 0 : 4.99;
  const tax = +(cart.subtotal * 0.08).toFixed(2);
  const total = +(cart.subtotal + tax + shipping).toFixed(2);

  return (
    <div className="max-w-screen-2xl mx-auto px-4 py-4 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
      <section className="bg-white border border-neutral-200 rounded-md p-4">
        <h1 className="font-heading text-2xl font-semibold">Shopping Cart</h1>
        <div className="text-xs link-blue hover:underline mt-1">Deselect all items</div>
        <hr className="my-3 border-neutral-200" />

        {cart.items.length === 0 ? (
          <div className="py-8 text-center text-neutral-600">
            <div className="font-heading text-lg font-semibold">Your ShopKart Cart is empty.</div>
            <Link to="/products" data-testid="cart-shop-link" className="link-blue hover:underline text-sm mt-2 inline-block">
              Continue shopping
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-neutral-200">
            {cart.items.map((it) => (
              <li key={it.product_id} className="py-4 flex gap-4" data-testid={`cart-item-${it.product_id}`}>
                <Link to={`/product/${it.product_id}`} className="w-24 h-24 shrink-0 bg-white border border-neutral-100 rounded flex items-center justify-center">
                  <img src={it.product?.image_url} className="max-w-full max-h-full object-contain" alt={it.product?.title} />
                </Link>
                <div className="flex-1 min-w-0">
                  <Link to={`/product/${it.product_id}`} className="font-heading font-semibold text-base line-clamp-2 hover:link-blue">
                    {it.product?.title}
                  </Link>
                  <div className="text-xs text-[#067D62] mt-1">In Stock</div>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="flex items-center border border-neutral-300 rounded-full">
                      <button
                        onClick={() => updateQty(it.product_id, it.quantity - 1)}
                        data-testid={`cart-qty-dec-${it.product_id}`}
                        className="px-2 py-1 hover:bg-neutral-100 rounded-l-full"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="px-3 text-sm" data-testid={`cart-qty-${it.product_id}`}>{it.quantity}</span>
                      <button
                        onClick={() => updateQty(it.product_id, it.quantity + 1)}
                        data-testid={`cart-qty-inc-${it.product_id}`}
                        className="px-2 py-1 hover:bg-neutral-100 rounded-r-full"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    <button
                      onClick={() => removeItem(it.product_id)}
                      data-testid={`cart-remove-${it.product_id}`}
                      className="link-blue text-sm hover:underline flex items-center gap-1"
                    >
                      <Trash2 size={14} /> Delete
                    </button>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-lg">${(it.product?.price * it.quantity).toFixed(2)}</div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {cart.items.length > 0 && (
          <div className="text-right pt-3">
            <span className="text-neutral-700">Subtotal ({cart.items.reduce((s, i) => s + i.quantity, 0)} items): </span>
            <span className="font-bold" data-testid="cart-subtotal">${cart.subtotal.toFixed(2)}</span>
          </div>
        )}
      </section>

      <aside className="bg-white border border-neutral-200 rounded-md p-4 h-fit">
        {cart.items.length > 0 && cart.subtotal < 35 && (
          <div className="text-sm text-[#067D62] mb-2">
            Add ${(35 - cart.subtotal).toFixed(2)} more for FREE shipping
          </div>
        )}
        <div className="text-lg mb-3">
          <span>Subtotal ({cart.items.reduce((s, i) => s + i.quantity, 0)} items): </span>
          <span className="font-bold">${cart.subtotal.toFixed(2)}</span>
        </div>
        <div className="text-xs text-neutral-600 space-y-1 mb-3">
          <div className="flex justify-between"><span>Shipping</span><span>${shipping.toFixed(2)}</span></div>
          <div className="flex justify-between"><span>Tax (est.)</span><span>${tax.toFixed(2)}</span></div>
          <div className="flex justify-between font-semibold text-black text-sm pt-1 border-t border-neutral-200"><span>Total</span><span>${total.toFixed(2)}</span></div>
        </div>
        <button
          onClick={() => navigate("/checkout")}
          disabled={cart.items.length === 0}
          data-testid="cart-checkout-btn"
          className="w-full amazon-orange text-black font-semibold text-sm rounded-full py-2 hover:brightness-95 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Proceed to checkout
        </button>
      </aside>
    </div>
  );
}
