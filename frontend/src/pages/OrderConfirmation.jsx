import React, { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import api from "@/lib/api";
import { CheckCircle2, Package } from "lucide-react";

export default function OrderConfirmation() {
  const { id } = useParams();
  const location = useLocation();
  const [order, setOrder] = useState(location.state?.order || null);

  useEffect(() => {
    if (!order) api.get(`/orders/${id}`).then((r) => setOrder(r.data)).catch(() => setOrder(false));
  }, [id, order]);

  if (order === null) return <div className="p-8">Loading…</div>;
  if (order === false) return <div className="p-8">Order not found.</div>;

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-10">
      <div className="bg-surface border border-warm rounded-lg p-8">
        <div className="flex items-start gap-4">
          <div className="bg-sage/10 border border-sage/30 rounded-full p-2">
            <CheckCircle2 className="text-sage" size={28} />
          </div>
          <div>
            <div className="text-[11px] tracking-[0.3em] uppercase text-sage mb-1">Order placed</div>
            <h1 className="font-heading text-3xl font-semibold text-ink">Thank you.</h1>
            <div className="text-sm text-muted-warm mt-1">
              Your order is confirmed · <span className="font-mono font-semibold text-ink" data-testid="order-number">{order.order_number}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8 border-t border-warm pt-6">
          <div>
            <div className="text-[11px] tracking-widest uppercase text-muted-warm mb-1">Shipping to</div>
            <div className="text-sm text-ink leading-relaxed">
              {order.address?.full_name}<br />
              {order.address?.street}<br />
              {order.address?.city}, {order.address?.state} {order.address?.zip}<br />
              {order.address?.country}
            </div>
          </div>
          <div>
            <div className="text-[11px] tracking-widest uppercase text-muted-warm mb-1">Payment</div>
            <div className="text-sm text-ink">{order.payment_method === "mock_cod" ? "Cash on delivery" : "Card (mock)"}</div>
            <div className="text-[11px] text-muted-warm mt-1">No real charges were made.</div>
          </div>
          <div>
            <div className="text-[11px] tracking-widest uppercase text-muted-warm mb-1">Total</div>
            <div className="font-heading text-2xl font-semibold text-ink">₹{order.total.toFixed(2)}</div>
          </div>
        </div>

        <div className="mt-8 border-t border-warm pt-6">
          <div className="text-[11px] tracking-widest uppercase text-muted-warm mb-3 flex items-center gap-1">
            <Package size={12} /> Items on their way
          </div>
          <ul className="divide-y divide-warm">
            {order.items.map((it, i) => (
              <li key={i} className="py-3 flex items-center gap-3">
                <img src={it.image_url} className="w-14 h-14 object-contain" alt="" />
                <div className="flex-1 text-sm">
                  <div className="font-medium">{it.title}</div>
                  <div className="text-xs text-muted-warm">
                    Qty {it.quantity}{it.variant_label && ` · ${it.variant_label}`}
                  </div>
                </div>
                <div className="font-semibold">₹{(it.price * it.quantity).toFixed(2)}</div>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-6 border-t border-warm pt-6 text-sm space-y-1">
          <div className="flex justify-between text-muted-warm"><span>Subtotal</span><span>₹{order.subtotal.toFixed(2)}</span></div>
          <div className="flex justify-between text-muted-warm"><span>Shipping</span><span>{order.shipping === 0 ? <span className="text-sage">Free</span> : `₹${order.shipping.toFixed(2)}`}</span></div>
          <div className="flex justify-between text-muted-warm"><span>Tax</span><span>₹{order.tax.toFixed(2)}</span></div>
          <div className="flex justify-between font-heading text-lg font-semibold text-ink pt-2 border-t border-warm mt-2"><span>Total</span><span>₹{order.total.toFixed(2)}</span></div>
        </div>

        <div className="mt-8 flex gap-4">
          <Link to="/orders" data-testid="conf-orders-btn" className="text-sm text-ink hover:text-terracotta transition-colors border-b border-ink/30 hover:border-terracotta pb-0.5">View your orders →</Link>
          <Link to="/products" data-testid="conf-shop-btn" className="text-sm text-ink hover:text-terracotta transition-colors border-b border-ink/30 hover:border-terracotta pb-0.5">Continue shopping →</Link>
        </div>
      </div>
    </div>
  );
}
