import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCart } from "@/context/CartContext";
import { useAuth } from "@/context/AuthContext";
import api, { formatApiErrorDetail } from "@/lib/api";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { loadRazorpay } from "@/lib/razorpay";
import SellerQrCard from "@/components/SellerQrCard";

export default function Checkout() {
  const { cart, refresh } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [address, setAddress] = useState({
    full_name: "", street: "", city: "", state: "", zip: "", country: "India", phone: "",
  });
  const [payment, setPayment] = useState("mock_card");
  const [placing, setPlacing] = useState(false);
  const [shippingCfg, setShippingCfg] = useState({ flat_fee: 6.99, free_threshold: 75 });
  const [razorpayCfg, setRazorpayCfg] = useState({ enabled: false, key_id: "" });
  const [couponInput, setCouponInput] = useState("");
  const [couponApplied, setCouponApplied] = useState(null); // { code, discount }
  const [couponError, setCouponError] = useState("");

  useEffect(() => {
    api.get("/config/shipping").then((r) => setShippingCfg(r.data));
    api.get("/config/razorpay").then((r) => setRazorpayCfg(r.data));
  }, []);

  const discount = couponApplied?.discount || 0;
  const discountedSubtotal = Math.max(0, +(cart.subtotal - discount).toFixed(2));
  const shipping = discountedSubtotal === 0 ? 0 : (discountedSubtotal >= shippingCfg.free_threshold ? 0 : shippingCfg.flat_fee);
  const tax = +(discountedSubtotal * 0.05).toFixed(2);
  const total = +(discountedSubtotal + tax + shipping).toFixed(2);

  // Distinct sellers in the cart that have uploaded a payment QR code.
  const sellerQrs = useMemo(() => {
    const seen = new Map();
    for (const it of cart.items) {
      const url = it.product?.qr_code_url;
      if (!url || seen.has(url)) continue;
      seen.set(url, it.product?.title || "this item");
    }
    return Array.from(seen, ([url, title]) => ({ url, title }));
  }, [cart.items]);

  const applyCoupon = async () => {
    const code = couponInput.trim();
    if (!code) return;
    setCouponError("");
    try {
      const { data } = await api.post("/coupons/validate", { code });
      if (data.valid) {
        setCouponApplied({ code: data.code, discount: data.discount });
        toast.success(`Coupon applied · ₹${data.discount.toFixed(2)} off`);
      } else {
        setCouponApplied(null);
        setCouponError(data.reason || "Invalid coupon");
      }
    } catch (e) {
      setCouponError(formatApiErrorDetail(e.response?.data?.detail) || "Could not validate coupon");
    }
  };

  const removeCoupon = () => {
    setCouponApplied(null);
    setCouponInput("");
    setCouponError("");
  };

  const validate = () => {
    if (!address.full_name || !address.street || !address.city || !address.zip) {
      toast.error("Please complete the shipping address");
      return false;
    }
    if (cart.items.length === 0) {
      toast.error("Cart is empty");
      return false;
    }
    return true;
  };

  const placeMockOrder = async () => {
    setPlacing(true);
    try {
      const { data } = await api.post("/orders/checkout", {
        address,
        payment_method: payment,
        coupon_code: couponApplied?.code || "",
      });
      await refresh();
      toast.success("Order placed · thank you!");
      navigate(`/order-confirmation/${data.id}`, { state: { order: data } });
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Failed to place order");
    } finally {
      setPlacing(false);
    }
  };

  const placeRazorpayOrder = async () => {
    setPlacing(true);
    try {
      const ok = await loadRazorpay();
      if (!ok) {
        toast.error("Could not load Razorpay. Check your internet connection.");
        setPlacing(false);
        return;
      }
      const { data } = await api.post("/orders/create-razorpay", {
        address,
        payment_method: "razorpay",
        coupon_code: couponApplied?.code || "",
      });

      const options = {
        key: data.key_id,
        amount: data.amount,
        currency: data.currency,
        name: "Innovation Window India",
        description: `Order ${data.order_number}`,
        order_id: data.razorpay_order_id,
        prefill: {
          name: user?.name || address.full_name,
          email: user?.email || "",
          contact: address.phone || "",
        },
        notes: { order_number: data.order_number },
        theme: { color: "#DC7238" },
        handler: async (rsp) => {
          try {
            const { data: verified } = await api.post("/orders/verify-razorpay", {
              order_id: data.order_id,
              razorpay_order_id: rsp.razorpay_order_id,
              razorpay_payment_id: rsp.razorpay_payment_id,
              razorpay_signature: rsp.razorpay_signature,
            });
            await refresh();
            toast.success("Payment successful · thank you!");
            navigate(`/order-confirmation/${verified.id}`, { state: { order: verified } });
          } catch (err) {
            toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Payment verification failed");
          } finally {
            setPlacing(false);
          }
        },
        modal: {
          ondismiss: () => {
            toast.message("Payment cancelled. You can try again anytime.");
            setPlacing(false);
          },
        },
      };
      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", (resp) => {
        toast.error(resp.error?.description || "Payment failed");
        setPlacing(false);
      });
      rzp.open();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Could not start payment");
      setPlacing(false);
    }
  };

  const placeOrder = async () => {
    if (!validate()) return;
    if (payment === "razorpay") {
      await placeRazorpayOrder();
    } else {
      await placeMockOrder();
    }
  };

  return (
    <div className="max-w-screen-xl mx-auto px-4 md:px-6 py-8 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8">
      <section className="space-y-6">
        <div className="text-[11px] tracking-[0.3em] uppercase text-sage">Checkout</div>
        <h1 className="font-heading text-3xl font-semibold">Complete your order</h1>

        <div className="bg-surface border border-warm rounded-lg p-6">
          <h2 className="font-heading text-lg font-semibold mb-4">1 · Shipping address</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <Label htmlFor="full_name">Full name</Label>
              <Input id="full_name" data-testid="chk-full-name" value={address.full_name} onChange={(e) => setAddress({ ...address, full_name: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="street">Street address</Label>
              <Input id="street" data-testid="chk-street" value={address.street} onChange={(e) => setAddress({ ...address, street: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="city">City</Label>
              <Input id="city" data-testid="chk-city" value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="state">State</Label>
              <Input id="state" data-testid="chk-state" value={address.state} onChange={(e) => setAddress({ ...address, state: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="zip">PIN / ZIP</Label>
              <Input id="zip" data-testid="chk-zip" value={address.zip} onChange={(e) => setAddress({ ...address, zip: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" data-testid="chk-phone" value={address.phone} onChange={(e) => setAddress({ ...address, phone: e.target.value })} />
            </div>
          </div>
        </div>

        <div className="bg-surface border border-warm rounded-lg p-6">
          <h2 className="font-heading text-lg font-semibold mb-4">2 · Payment</h2>
          <RadioGroup value={payment} onValueChange={setPayment} className="space-y-2">
            <label className={`flex items-center gap-3 border rounded-md p-3 cursor-pointer bg-cream/40 transition-colors ${sellerQrs.length > 0 ? "border-warm hover:border-terracotta" : "border-warm opacity-60"}`}>
              <RadioGroupItem value="seller_qr" id="seller_qr" data-testid="chk-pay-seller-qr" disabled={sellerQrs.length === 0} />
              <div className="flex-1">
                <div className="font-medium flex items-center gap-2">
                  Scan & pay seller UPI QR
                  {sellerQrs.length > 0 ? (
                    <span className="text-[10px] uppercase tracking-widest text-sage bg-sage/10 border border-sage/30 rounded-full px-2 py-0.5">Recommended</span>
                  ) : (
                    <span className="text-[10px] uppercase tracking-widest text-muted-warm bg-warm/40 border border-warm rounded-full px-2 py-0.5">Unavailable</span>
                  )}
                </div>
                <div className="text-xs text-muted-warm">
                  {sellerQrs.length > 0
                    ? "Scan the seller's QR code with any UPI app, then place your order."
                    : "No sellers in your cart have added a QR code yet."}
                </div>
              </div>
            </label>
            {payment === "seller_qr" && sellerQrs.length > 0 && (
              <div className="pl-9 space-y-2">
                {sellerQrs.map((s) => (
                  <SellerQrCard key={s.url} qrUrl={s.url} title="Scan & pay via UPI" subtitle={s.title} testId={`chk-seller-qr-${s.url}`} />
                ))}
              </div>
            )}
            <label className="flex items-center gap-3 border border-warm rounded-md p-3 cursor-pointer bg-cream/40 hover:border-terracotta transition-colors">
              <RadioGroupItem value="mock_card" id="mock_card" data-testid="chk-pay-card" />
              <div className="flex-1">
                <div className="font-medium">Mock card (demo)</div>
                <div className="text-xs text-muted-warm">Simulated — no real charges will be made.</div>
              </div>
            </label>
            <label className="flex items-center gap-3 border border-warm rounded-md p-3 cursor-pointer bg-cream/40 hover:border-terracotta transition-colors">
              <RadioGroupItem value="mock_cod" id="mock_cod" data-testid="chk-pay-cod" />
              <div className="flex-1">
                <div className="font-medium">Cash on delivery</div>
                <div className="text-xs text-muted-warm">Pay when your order arrives.</div>
              </div>
            </label>
            <label className={`flex items-center gap-3 border rounded-md p-3 cursor-pointer bg-cream/40 transition-colors ${razorpayCfg.enabled ? "border-warm hover:border-terracotta" : "border-warm opacity-60"}`}>
              <RadioGroupItem value="razorpay" id="razorpay" data-testid="chk-pay-razorpay" disabled={!razorpayCfg.enabled} />
              <div className="flex-1">
                <div className="font-medium flex items-center gap-2">
                  Razorpay · UPI / Cards / Netbanking
                  {!razorpayCfg.enabled && (
                    <span className="text-[10px] uppercase tracking-widest text-muted-warm bg-warm/40 border border-warm rounded-full px-2 py-0.5">Currently disabled</span>
                  )}
                </div>
                <div className="text-xs text-muted-warm">
                  {razorpayCfg.enabled
                    ? "Secure payment via Razorpay. Test-mode uses card 4111 1111 1111 1111."
                    : "Disabled for now — sellers are paid directly via their UPI QR code above."}
                </div>
              </div>
            </label>
          </RadioGroup>
        </div>

        <div className="bg-surface border border-warm rounded-lg p-6">
          <h2 className="font-heading text-lg font-semibold mb-4">3 · Review items</h2>
          <ul className="divide-y divide-warm">
            {cart.items.map((it) => {
              const key = `${it.product_id}::${it.variant_label || ""}`;
              return (
                <li key={key} className="py-3 flex items-center gap-3">
                  <img src={it.product?.image_url} className="w-14 h-14 object-contain" alt="" />
                  <div className="flex-1 text-sm">
                    <div className="line-clamp-1 font-medium">{it.product?.title}</div>
                    <div className="text-xs text-muted-warm">
                      Qty {it.quantity}{it.variant_label && ` · ${it.variant_label}`}
                    </div>
                  </div>
                  <div className="font-semibold">₹{(it.unit_price * it.quantity).toFixed(2)}</div>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <aside className="bg-surface border border-warm rounded-lg p-6 h-fit">
        <div className="font-heading text-xl font-semibold mb-4">Summary</div>

        {/* Coupon */}
        <div className="mb-4">
          {couponApplied ? (
            <div className="flex items-center justify-between bg-sage/10 border border-sage/30 rounded-md px-3 py-2 text-sm">
              <div>
                <div className="font-heading font-semibold text-ink">{couponApplied.code}</div>
                <div className="text-xs text-sage">−₹{couponApplied.discount.toFixed(2)} applied</div>
              </div>
              <button
                onClick={removeCoupon}
                data-testid="chk-remove-coupon"
                className="text-xs text-muted-warm hover:text-terracotta"
              >
                Remove
              </button>
            </div>
          ) : (
            <>
              <div className="text-[11px] tracking-widest uppercase text-muted-warm mb-1">Promo code</div>
              <div className="flex gap-2">
                <Input
                  data-testid="chk-coupon-input"
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                  placeholder="WELCOME10"
                  className="h-9 text-sm"
                />
                <button
                  onClick={applyCoupon}
                  data-testid="chk-apply-coupon"
                  className="text-xs bg-ink text-cream rounded-full px-4 hover:bg-terracotta transition-colors"
                >
                  Apply
                </button>
              </div>
              {couponError && <div className="text-xs text-terracotta mt-1" data-testid="chk-coupon-error">{couponError}</div>}
            </>
          )}
        </div>

        <div className="text-sm space-y-2 mb-5">
          <div className="flex justify-between"><span className="text-muted-warm">Items</span><span>₹{cart.subtotal.toFixed(2)}</span></div>
          {couponApplied && (
            <div className="flex justify-between text-sage">
              <span>Discount ({couponApplied.code})</span>
              <span data-testid="chk-discount">−₹{discount.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-warm">Shipping</span>
            <span>{shipping === 0 && discountedSubtotal > 0 ? <span className="text-sage">Free</span> : `₹${shipping.toFixed(2)}`}</span>
          </div>
          <div className="text-[11px] text-muted-warm">
            Flat ₹{shippingCfg.flat_fee.toFixed(2)} shipping · Free above ₹{shippingCfg.free_threshold.toFixed(0)}
          </div>
          <div className="flex justify-between"><span className="text-muted-warm">Tax (5%)</span><span>₹{tax.toFixed(2)}</span></div>
          <div className="flex justify-between font-heading text-xl font-semibold text-ink border-t border-warm pt-3 mt-2">
            <span>Total</span><span data-testid="chk-total">₹{total.toFixed(2)}</span>
          </div>
        </div>
        <button
          onClick={placeOrder}
          disabled={placing || cart.items.length === 0}
          data-testid="chk-place-order"
          className="w-full bg-terracotta text-white text-sm font-medium rounded-full py-3 hover:brightness-95 transition-colors disabled:opacity-50"
        >
          {placing
            ? "Processing…"
            : payment === "razorpay"
            ? `Pay ₹${total.toFixed(2)} securely`
            : payment === "seller_qr"
            ? "I've paid — place order"
            : "Place order"}
        </button>
        <div className="text-[11px] text-muted-warm mt-3">
          By placing your order, you agree to the demo terms.
          {payment === "seller_qr" && " Make sure you've completed the UPI payment before placing your order — sellers confirm receipt manually."}
        </div>
      </aside>
    </div>
  );
}
