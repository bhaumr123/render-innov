import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";

export default function Orders() {
  const [orders, setOrders] = useState(null);

  useEffect(() => {
    api.get("/orders").then((r) => setOrders(r.data.orders || []));
  }, []);

  if (orders === null) return <div className="p-6">Loading…</div>;

  return (
    <div className="max-w-screen-2xl mx-auto px-4 py-4">
      <h1 className="font-heading text-2xl font-semibold mb-4">Your orders</h1>
      {orders.length === 0 ? (
        <div className="bg-white border border-neutral-200 rounded-md p-8 text-center">
          <div className="font-heading text-lg font-semibold">No orders yet.</div>
          <Link to="/products" className="link-blue hover:underline text-sm mt-2 inline-block">Start shopping →</Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {orders.map((o) => (
            <li key={o.id} data-testid={`order-item-${o.id}`} className="bg-white border border-neutral-200 rounded-md overflow-hidden">
              <div className="bg-neutral-100 border-b border-neutral-200 px-4 py-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <div><div className="text-neutral-500">ORDER PLACED</div><div className="font-medium">{new Date(o.created_at).toLocaleDateString()}</div></div>
                <div><div className="text-neutral-500">TOTAL</div><div className="font-medium">${o.total.toFixed(2)}</div></div>
                <div><div className="text-neutral-500">SHIP TO</div><div className="font-medium truncate">{o.address?.full_name}</div></div>
                <div className="text-right"><div className="text-neutral-500">ORDER #</div><div className="font-mono">{o.order_number}</div></div>
              </div>
              <div className="p-4">
                <div className="font-heading font-semibold mb-2 text-[#067D62]">{(o.status || "confirmed").toUpperCase()}</div>
                <ul className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {o.items.map((it, i) => (
                    <li key={i} className="flex gap-3">
                      <img src={it.image_url} className="w-16 h-16 object-contain" alt="" />
                      <div className="text-sm">
                        <Link to={`/product/${it.product_id}`} className="link-blue hover:underline line-clamp-2">{it.title}</Link>
                        <div className="text-xs text-neutral-500">Qty {it.quantity} · ${it.price.toFixed(2)}</div>
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
