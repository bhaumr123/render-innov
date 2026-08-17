import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import api, { resolveUploadUrl } from "@/lib/api";
import { CheckCircle2, Package, Store } from "lucide-react";
import OrderTimeline from "@/components/OrderTimeline";

const PLATFORM_KEY = "__platform__";

function SellerGroup({ sellerKey, items, sellerInfo, fulfillment, overallOrder }) {
  const subtotal = items.reduce((sum, it) => sum + it.price * it.quantity, 0);
  const isPlatform = sellerKey === PLATFORM_KEY;
  const status = isPlatform ? overallOrder.status : fulfillment?.status;
  const history = isPlatform ? overallOrder.status_history : fulfillment?.history;
  const trackingNumber = isPlatform ? overallOrder.tracking_number : fulfillment?.tracking_number;
  const carrier = isPlatform ? overallOrder.carrier : fulfillment?.carrier;

  return (
    <div className="border border-warm rounded-lg overflow-hidden" data-testid={`order-seller-group-${sellerKey}`}>
      <div className="bg-cream/60 border-b border-warm px-5 py-3 flex items-center gap-2">
        <Store size={14} className="text-sage" />
        <span className="text-sm font-medium text-ink">
          {isPlatform ? "Sold by Innovation Window India" : `Sold by ${sellerInfo?.name || "seller"}`}
        </span>
        <span className="text-xs text-muted-warm ml-auto">₹{subtotal.toFixed(2)}</span>
      </div>
      <ul className="divide-y divide-warm px-5">
        {items.map((it, i) => (
          <li key={i} className="py-3 flex items-center gap-3">
            <img src={resolveUploadUrl(it.image_url)} className="w-14 h-14 object-contain" alt="" />
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
      <div className="p-5 pt-2">
        <OrderTimeline
          status={status}
          history={history}
          trackingNumber={trackingNumber}
          carrier={carrier}
          testIdSuffix={sellerKey}
          label={isPlatform ? "Order status" : "Seller status"}
        />
      </div>
    </div>
  );
}

export default function OrderConfirmation() {
  const { id } = useParams();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const guestToken = searchParams.get("t");
  const [order, setOrder] = useState(location.state?.order || null);

  useEffect(() => {
    if (order) return;
    // Guest orders come with ?t=<access_token>. Otherwise assume authenticated.
    const fetcher = guestToken
      ? api.get(`/orders/guest/${id}`, { params: { t: guestToken } })
      : api.get(`/orders/${id}`);
    fetcher.then((r) => setOrder(r.data)).catch(() => setOrder(false));
  }, [id, order, guestToken]);

  // Group items by seller so a multi-vendor order can be tracked seller-by-seller.
  // Items with no seller_id (admin/platform-sold) fall under a "platform" group.
  const groups = useMemo(() => {
    if (!order || !order.items) return [];
    const map = new Map();
    for (const it of order.items) {
      const key = it.seller_id || PLATFORM_KEY;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(it);
    }
    return Array.from(map.entries());
  }, [order]);

  const hasSellerGroups = groups.length > 0 && !(groups.length === 1 && groups[0][0] === PLATFORM_KEY);

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
            <div className="text-sm text-ink leading-relaxed" data-testid="order-ship-address">
              {order.guest ? (
                <>
                  {order.contact?.name}<br />
                  {order.shipping_address?.line1}
                  {order.shipping_address?.line2 && <>, {order.shipping_address.line2}</>}<br />
                  {order.shipping_address?.city}, {order.shipping_address?.state} {order.shipping_address?.pincode}<br />
                  {order.shipping_address?.country}
                </>
              ) : (
                <>
                  {order.address?.full_name}<br />
                  {order.address?.street}<br />
                  {order.address?.city}, {order.address?.state} {order.address?.zip}<br />
                  {order.address?.country}
                </>
              )}
            </div>
            {order.guest && (
              <div className="text-[11px] text-muted-warm mt-2" data-testid="order-guest-contact">
                Updates will be sent to <span className="text-ink">{order.contact?.email}</span>
              </div>
            )}
          </div>
          <div>
            <div className="text-[11px] tracking-widest uppercase text-muted-warm mb-1">Payment</div>
            <div className="text-sm text-ink">{
              order.payment_method === "mock_cod" ? "Cash on delivery" :
              order.payment_method === "seller_qr" ? "Seller UPI QR" :
              order.payment_method === "razorpay" ? "Razorpay" : "Card (mock)"
            }</div>
            {order.payment_method !== "razorpay" && (
              <div className="text-[11px] text-muted-warm mt-1">No real charges were made.</div>
            )}
          </div>
          <div>
            <div className="text-[11px] tracking-widest uppercase text-muted-warm mb-1">Total</div>
            <div className="font-heading text-2xl font-semibold text-ink">₹{order.total.toFixed(2)}</div>
          </div>
        </div>

        {hasSellerGroups ? (
          <div className="mt-8 border-t border-warm pt-6 space-y-5">
            <div className="text-[11px] tracking-widest uppercase text-muted-warm flex items-center gap-1">
              <Package size={12} /> Tracked per seller
            </div>
            {groups.map(([sellerKey, items]) => (
              <SellerGroup
                key={sellerKey}
                sellerKey={sellerKey}
                items={items}
                sellerInfo={order.sellers?.[sellerKey]}
                fulfillment={order.seller_status?.[sellerKey]}
                overallOrder={order}
              />
            ))}
          </div>
        ) : (
          <>
            <div className="mt-8 border-t border-warm pt-6">
              <OrderTimeline status={order.status} history={order.status_history} trackingNumber={order.tracking_number} carrier={order.carrier} />
            </div>

            <div className="mt-8 border-t border-warm pt-6">
              <div className="text-[11px] tracking-widest uppercase text-muted-warm mb-3 flex items-center gap-1">
                <Package size={12} /> Items on their way
              </div>
              <ul className="divide-y divide-warm">
                {order.items.map((it, i) => (
                  <li key={i} className="py-3 flex items-center gap-3">
                    <img src={resolveUploadUrl(it.image_url)} className="w-14 h-14 object-contain" alt="" />
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
          </>
        )}

        <div className="mt-6 border-t border-warm pt-6 text-sm space-y-1">
          <div className="flex justify-between text-muted-warm"><span>Subtotal</span><span>₹{order.subtotal.toFixed(2)}</span></div>
          <div className="flex justify-between text-muted-warm"><span>Shipping</span><span>{order.shipping === 0 ? <span className="text-sage">Free</span> : `₹${order.shipping.toFixed(2)}`}</span></div>
          <div className="flex justify-between text-muted-warm"><span>GST</span><span>₹{order.tax.toFixed(2)}</span></div>
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
