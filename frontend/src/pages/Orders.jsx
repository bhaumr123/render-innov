import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { resolveUploadUrl } from "@/lib/api";

export default function Orders() {
  const [orders, setOrders] = useState(null);

  useEffect(() => {
    api.get("/orders").then((r) => setOrders(r.data.orders || []));
  }, []);

  if (orders === null) return <div className="p-8">Loading…</div>;

  return (
    <div className="max-w-screen-xl mx-auto px-4 md:px-6 py-8">
      <div className="text-[11px] tracking-[0.3em] uppercase text-sage mb-1">Your orders</div>
      <h1 className="font-heading text-3xl font-semibold mb-6">Order history</h1>
      {orders.length === 0 ? (
        <div className="bg-surface border border-warm rounded-lg p-10 text-center">
          <div className="font-heading text-xl">No orders yet.</div>
          <Link to="/products" className="text-terracotta hover:underline text-sm mt-2 inline-block">Start shopping →</Link>
        </div>
      ) : (
        <ul className="space-y-4">
          {orders.map((o) => (
            <li key={o.id} data-testid={`order-item-${o.id}`} className="bg-surface border border-warm rounded-lg overflow-hidden">
              <div className="bg-cream border-b border-warm px-5 py-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <div><div className="uppercase tracking-widest text-muted-warm text-[10px]">Placed</div><div className="font-medium">{new Date(o.created_at).toLocaleDateString()}</div></div>
                <div><div className="uppercase tracking-widest text-muted-warm text-[10px]">Total</div><div className="font-medium">₹{o.total.toFixed(2)}</div></div>
                <div><div className="uppercase tracking-widest text-muted-warm text-[10px]">Ship to</div><div className="font-medium truncate">{o.address?.full_name}</div></div>
                <div className="text-right"><div className="uppercase tracking-widest text-muted-warm text-[10px]">Order</div><div className="font-mono text-ink">{o.order_number}</div></div>
              </div>
              <div className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs uppercase tracking-widest text-sage capitalize" data-testid={`order-status-${o.id}`}>{(o.status || "confirmed").replace("_", " ")}</div>
                  <Link
                    to={`/order-confirmation/${o.id}`}
                    data-testid={`track-order-${o.id}`}
                    className="text-xs text-terracotta hover:underline"
                  >
                    Track order →
                  </Link>
                </div>
                <ul className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {o.items.map((it, i) => (
                    <li key={i} className="flex gap-3">
                      <img src={resolveUploadUrl(it.image_url)} className="w-16 h-16 object-contain bg-parchment/30 rounded" alt="" />
                      <div className="text-sm">
                        <Link to={`/product/${it.product_id}`} className="font-medium hover:text-terracotta line-clamp-2 transition-colors">{it.title}</Link>
                        <div className="text-xs text-muted-warm mt-0.5">
                          Qty {it.quantity}{it.variant_label && ` · ${it.variant_label}`} · ₹{it.price.toFixed(2)}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
