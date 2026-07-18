import React, { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import api from "@/lib/api";
import { CheckCircle2 } from "lucide-react";

export default function OrderConfirmation() {
  const { id } = useParams();
  const location = useLocation();
  const [order, setOrder] = useState(location.state?.order || null);

  useEffect(() => {
    if (!order) {
      api.get(`/orders/${id}`).then((r) => setOrder(r.data)).catch(() => setOrder(false));
    }
  }, [id, order]);

  if (order === null) return <div className="p-6">Loading…</div>;
  if (order === false) return <div className="p-6">Order not found.</div>;

  return (
    <div className="max-w-screen-2xl mx-auto px-4 py-6">
      <div className="bg-white border border-neutral-200 rounded-md p-6">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="text-[#067D62] mt-1" size={32} />
          <div>
            <h1 className="font-heading text-2xl font-semibold">Thank you, your order has been placed!</h1>
            <div className="text-sm text-neutral-600 mt-1">
              Confirmation number: <span className="font-mono font-semibold" data-testid="order-number">{order.order_number}</span>
            </div>
          </div>
        </div>
        <hr className="my-4 border-neutral-200" />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <div className="font-heading font-semibold mb-1">Shipping to</div>
            <div className="text-sm text-neutral-700">
              {order.address?.full_name}<br />
              {order.address?.street}<br />
              {order.address?.city}, {order.address?.state} {order.address?.zip}<br />
              {order.address?.country}
            </div>
          </div>
          <div>
            <div className="font-heading font-semibold mb-1">Payment</div>
            <div className="text-sm text-neutral-700">{order.payment_method === "mock_cod" ? "Cash on delivery" : "Card (mock)"}</div>
          </div>
          <div>
            <div className="font-heading font-semibold mb-1">Total</div>
            <div className="text-price text-2xl font-bold">${order.total.toFixed(2)}</div>
          </div>
        </div>

        <hr className="my-4 border-neutral-200" />

        <div className="font-heading font-semibold mb-2">Items</div>
        <ul className="divide-y divide-neutral-200">
          {order.items.map((it, i) => (
            <li key={i} className="py-3 flex items-center gap-3">
              <img src={it.image_url} alt="" className="w-16 h-16 object-contain" />
              <div className="flex-1 text-sm">
                <div className="font-medium">{it.title}</div>
                <div className="text-xs text-neutral-500">Qty {it.quantity}</div>
              </div>
              <div className="font-semibold">${(it.price * it.quantity).toFixed(2)}</div>
            </li>
          ))}
        </ul>

        <div className="mt-6 flex gap-3">
          <Link to="/orders" data-testid="conf-orders-btn" className="link-blue hover:underline text-sm">View your orders →</Link>
          <Link to="/products" data-testid="conf-shop-btn" className="link-blue hover:underline text-sm">Continue shopping →</Link>
        </div>
      </div>
    </div>
  );
}
