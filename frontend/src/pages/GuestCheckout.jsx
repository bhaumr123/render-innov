import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCart } from "@/context/CartContext";
import api, { formatApiError, resolveUploadUrl } from "@/lib/api";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { loadRazorpay } from "@/lib/razorpay";
import { ChevronLeft } from "lucide-react";
import SellerQrCard from "@/components/SellerQrCard";

const EMPTY_ADDRESS = { line1: "", line2: "", city: "", state: "", pincode: "", country: "India" };
const EMPTY_CONTACT = { name: "", email: "", phone: "" };

function AddressFields({ prefix, value, onChange, testIdPrefix }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div className="md:col-span-2">
        <Label htmlFor={`${prefix}-line1`}>Address line 1</Label>
        <Input id={`${prefix}-line1`} data-testid={`${testIdPrefix}-line1`} value={value.line1} onChange={(e) => set("line1", e.target.value)} placeholder="House/flat no., street" />
      </div>
      <div className="md:col-span-2">
        <Label htmlFor={`${prefix}-line2`}>Address line 2 <span className="text-muted-warm text-xs">(optional)</span></Label>
        <Input id={`${prefix}-line2`} data-testid={`${testIdPrefix}-line2`} value={value.line2} onChange={(e) => set("line2", e.target.value)} placeholder="Landmark, area" />
      </div>
      <div>
        <Label htmlFor={`${prefix}-city`}>City</Label>
        <Input id={`${prefix}-city`} data-testid={`${testIdPrefix}-city`} value={value.city} onChange={(e) => set("city", e.target.value)} />
      </div>
      <div>
        <Label htmlFor={`${prefix}-state`}>State</Label>
        <Input id={`${prefix}-state`} data-testid={`${testIdPrefix}-state`} value={value.state} onChange={(e) => set("state", e.target.value)} />
      </div>
      <div>
        <Label htmlFor={`${prefix}-pincode`}>PIN code</Label>
        <Input id={`${prefix}-pincode`} data-testid={`${testIdPrefix}-pincode`} value={value.pincode} onChange={(e) => set("pincode", e.target.value)} />
      </div>
      <div>
        <Label htmlFor={`${prefix}-country`}>Country</Label>
        <Input id={`${prefix}-country`} data-testid={`${testIdPrefix}-country`} value={value.country} onChange={(e) => set("country", e.target.value)} />
      </div>
    </div>
  );
}

export default function GuestCheckout() {
  const { cart, refresh } = useCart();
  const navigate = useNavigate();

  const [contact, setContact] = useState(EMPTY_CONTACT);
  const [shipping, setShipping] = useState(EMPTY_ADDRESS);
  const [billingSame, setBillingSame] = useState(true);
  const [billing, setBilling] = useState(EMPTY_ADDRESS);
  const [payment, setPayment] = useState("mock_card");
  const [placing, setPlacing] = useState(false);
  const [shippingCfg, setShippingCfg] = useState({ flat_fee: 6.99, free_threshold: 75 });
  const [razorpayCfg, setRazorpayCfg] = useState({ enabled: false, key_id: "" });
  const [couponInput, setCouponInput] = useState("");
  const [couponApplied, setCouponApplied] = useState(null);
  const [couponError, setCouponError] = useState("");

  useEffect(() => {
    api.get("/config/shipping").then((r) => setShippingCfg(r.data)).catch(() => {});
    api.get("/config/razorpay").then((r) => setRazorpayCfg(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!cart.items?.length) return;
  }, [cart.items]);

  const subtotal = cart.subtotal;
  const discount = couponApplied?.discount || 0;
  const discountedSubtotal = Math.max(0, +(subtotal - discount).toFixed(2));
  const shippingFee = discountedSubtotal === 0 ? 0 : (discountedSubtotal >= shippingCfg.free_threshold ? 0 : shippingCfg.flat_fee);
  const tax = +(discountedSubtotal * 0.05).toFixed(2);
  const total = +(discountedSubtotal + tax + shippingFee).toFixed(2);

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
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    setCouponError("");
    // For guest, we validate coupon by computing subtotal client-side and letting the checkout
    // endpoint enforce it server-side. Show local validation for UX.
    if (code.length < 2) { setCouponError("Enter a valid code"); return; }
    setCouponApplied({ code, discount: 0 }); // provisional; real discount applied server-side
    toast.message(`Coupon ${code} will be validated at checkout`);
  };
  const removeCoupon = () => { setCouponApplied(null); setCouponInput(""); setCouponError(""); };

  const validate = () => {
    if (cart.items.length === 0) { toast.error("Your cart is empty"); return false; }
    if (!contact.name.trim() || !contact.email.trim() || !contact.phone.trim()) {
      toast.error("Please fill in your contact details"); return false;
    }
    const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact.email);
    if (!emailOk) { toast.error("Please enter a valid email address"); return false; }
    const phoneOk = /^[0-9+\-\s()]{7,20}$/.test(contact.phone);
    if (!phoneOk) { toast.error("Please enter a valid phone number"); return false; }
    if (!shipping.line1 || !shipping.city || !shipping.state || !shipping.pincode) {
      toast.error("Please complete the shipping address"); return false;
    }
    if (!billingSame && (!billing.line1 || !billing.city || !billing.state || !billing.pincode)) {
      toast.error("Please complete the billing address"); return false;
    }
    return true;
  };

  const guestPayload = () => ({
    contact,
    shipping_address: shipping,
    billing_same_as_shipping: billingSame,
    billing_address: billingSame ? null : billing,
    items: cart.items.map((it) => ({
      product_id: it.product_id,
      quantity: it.quantity,
      variant_label: it.variant_label || "",
    })),
    coupon_code: couponApplied?.code || "",
  });

  const goToConfirmation = (orderId, token) => {
    navigate(`/order-confirmation/${orderId}?t=${encodeURIComponent(token)}`);
  };

  const placeMock = async () => {
    setPlacing(true);
    try {
      const { data } = await api.post("/orders/guest/checkout", {
        ...guestPayload(),
        payment_method: payment,
      });
      toast.success("Order placed · confirmation on the next screen");
      await refresh();
      goToConfirmation(data.id, data.guest_access_token);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setPlacing(false);
    }
  };

  const placeRazorpay = async () => {
    setPlacing(true);
    try {
      const ok = await loadRazorpay();
      if (!ok) { toast.error("Could not load Razorpay."); setPlacing(false); return; }
      const { data } = await api.post("/orders/guest/create-razorpay", {
        ...guestPayload(),
        payment_method: "razorpay",
      });
      const options = {
        key: data.key_id,
        amount: data.amount,
        currency: data.currency,
        name: "Innovation Window India",
        description: `Order ${data.order_number}`,
        order_id: data.razorpay_order_id,
        prefill: { name: contact.name, email: contact.email, contact: contact.phone },
        notes: { order_number: data.order_number, guest: "true" },
        theme: { color: "#DC7238" },
        handler: async (rsp) => {
          try {
            const { data: verified } = await api.post("/orders/guest/verify-razorpay", {
              order_id: data.order_id,
              guest_access_token: data.guest_access_token,
              razorpay_order_id: rsp.razorpay_order_id,
              razorpay_payment_id: rsp.razorpay_payment_id,
              razorpay_signature: rsp.razorpay_signature,
            });
            toast.success("Payment successful");
            await refresh();
            goToConfirmation(verified.id, data.guest_access_token);
          } catch (err) {
            toast.error(formatApiError(err));
          } finally {
            setPlacing(false);
          }
        },
        modal: {
          ondismiss: () => { toast.message("Payment cancelled."); setPlacing(false); },
        },
      };
      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", (r) => { toast.error(r.error?.description || "Payment failed"); setPlacing(false); });
      rzp.open();
    } catch (e) {
      toast.error(formatApiError(e));
      setPlacing(false);
    }
  };

  const place = () => {
    if (!validate()) return;
    if (payment === "razorpay") placeRazorpay();
    else placeMock();
  };

  return (
    <div className="max-w-screen-xl mx-auto px-4 md:px-6 py-8 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8">
      <section className="space-y-6">
        <Link to="/cart" className="inline-flex items-center gap-1 text-sm text-muted-warm hover:text-terracotta transition-colors" data-testid="guest-back-link">
          <ChevronLeft size={14} /> Back to cart
        </Link>
        <div className="text-[11px] tracking-[0.3em] uppercase text-sage">Guest checkout</div>
        <h1 className="font-heading text-3xl font-semibold">Check out without an account</h1>
        <p className="text-sm text-muted-warm -mt-4">
          You will receive your order confirmation and tracking link on the email you provide.{" "}
          <Link to="/login" className="text-terracotta hover:underline">Sign in instead →</Link>
        </p>

        {/* Contact */}
        <div className="bg-surface border border-warm rounded-lg p-6">
          <h2 className="font-heading text-lg font-semibold mb-4">1 · Contact details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <Label htmlFor="g-name">Full name</Label>
              <Input id="g-name" data-testid="guest-name" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="g-email">Email</Label>
              <Input id="g-email" type="email" data-testid="guest-email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} placeholder="you@example.com" />
            </div>
            <div>
              <Label htmlFor="g-phone">Phone</Label>
              <Input id="g-phone" data-testid="guest-phone" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} placeholder="10-digit mobile" />
            </div>
          </div>
        </div>

        {/* Shipping */}
        <div className="bg-surface border border-warm rounded-lg p-6">
          <h2 className="font-heading text-lg font-semibold mb-4">2 · Shipping address</h2>
          <AddressFields prefix="ship" value={shipping} onChange={setShipping} testIdPrefix="guest-ship" />
        </div>

        {/* Billing */}
        <div className="bg-surface border border-warm rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-heading text-lg font-semibold">3 · Billing address</h2>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                data-testid="guest-billing-same"
                checked={billingSame}
                onCheckedChange={(v) => setBillingSame(!!v)}
              />
              Same as shipping
            </label>
          </div>
          {billingSame ? (
            <p className="text-sm text-muted-warm">Billing will use your shipping address.</p>
          ) : (
            <AddressFields prefix="bill" value={billing} onChange={setBilling} testIdPrefix="guest-bill" />
          )}
        </div>

        {/* Payment */}
        <div className="bg-surface border border-warm rounded-lg p-6">
          <h2 className="font-heading text-lg font-semibold mb-4">4 · Payment</h2>
          <RadioGroup value={payment} onValueChange={setPayment} className="space-y-2">
            <label className={`flex items-center gap-3 border rounded-md p-3 cursor-pointer bg-cream/40 transition-colors ${sellerQrs.length > 0 ? "border-warm hover:border-terracotta" : "border-warm opacity-60"}`}>
              <RadioGroupItem value="seller_qr" data-testid="guest-pay-seller-qr" disabled={sellerQrs.length === 0} />
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
                  {sellerQrs.length > 0 ? "Scan the seller's QR code with any UPI app, then place your order." : "No sellers in your cart have added a QR code yet."}
                </div>
              </div>
            </label>
            {payment === "seller_qr" && sellerQrs.length > 0 && (
              <div className="pl-9 space-y-2">
                {sellerQrs.map((s) => (
                  <SellerQrCard key={s.url} qrUrl={s.url} title="Scan & pay via UPI" subtitle={s.title} testId={`guest-seller-qr-${s.url}`} />
                ))}
              </div>
            )}
            <label className="flex items-center gap-3 border border-warm rounded-md p-3 cursor-pointer bg-cream/40 hover:border-terracotta transition-colors">
              <RadioGroupItem value="mock_card" data-testid="guest-pay-card" />
              <div className="flex-1">
                <div className="font-medium">Mock card (demo)</div>
                <div className="text-xs text-muted-warm">Simulated — no real charges.</div>
              </div>
            </label>
            <label className="flex items-center gap-3 border border-warm rounded-md p-3 cursor-pointer bg-cream/40 hover:border-terracotta transition-colors">
              <RadioGroupItem value="mock_cod" data-testid="guest-pay-cod" />
              <div className="flex-1">
                <div className="font-medium">Cash on delivery</div>
                <div className="text-xs text-muted-warm">Pay when your order arrives.</div>
              </div>
            </label>
            <label className={`flex items-center gap-3 border rounded-md p-3 cursor-pointer bg-cream/40 transition-colors ${razorpayCfg.enabled ? "border-warm hover:border-terracotta" : "border-warm opacity-60"}`}>
              <RadioGroupItem value="razorpay" data-testid="guest-pay-razorpay" disabled={!razorpayCfg.enabled} />
              <div className="flex-1">
                <div className="font-medium flex items-center gap-2">
                  Razorpay · UPI / Cards / Netbanking
                  {!razorpayCfg.enabled && (
                    <span className="text-[10px] uppercase tracking-widest text-muted-warm bg-warm/40 border border-warm rounded-full px-2 py-0.5">Currently disabled</span>
                  )}
                </div>
                <div className="text-xs text-muted-warm">
                  {razorpayCfg.enabled ? "Secure. Test card 4111 1111 1111 1111." : "Disabled for now — sellers are paid directly via their UPI QR code above."}
                </div>
              </div>
            </label>
          </RadioGroup>
        </div>

        {/* Review items */}
        <div className="bg-surface border border-warm rounded-lg p-6">
          <h2 className="font-heading text-lg font-semibold mb-4">5 · Review items</h2>
          {cart.items.length === 0 ? (
            <div className="text-sm text-muted-warm">Your cart is empty. <Link to="/products" className="text-terracotta hover:underline">Continue shopping →</Link></div>
          ) : (
            <ul className="divide-y divide-warm">
              {cart.items.map((it) => (
                <li key={`${it.product_id}::${it.variant_label || ""}`} className="py-3 flex items-center gap-3">
                  <img src={resolveUploadUrl(it.product?.image_url)} className="w-14 h-14 object-contain" alt="" />
                  <div className="flex-1 text-sm">
                    <div className="line-clamp-1 font-medium">{it.product?.title}</div>
                    <div className="text-xs text-muted-warm">
                      Qty {it.quantity}{it.variant_label && ` · ${it.variant_label}`}
                    </div>
                  </div>
                  <div className="font-semibold">₹{(it.unit_price * it.quantity).toFixed(2)}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Summary */}
      <aside className="bg-surface border border-warm rounded-lg p-6 h-fit">
        <div className="font-heading text-xl font-semibold mb-4">Summary</div>

        <div className="mb-4">
          {couponApplied ? (
            <div className="flex items-center justify-between bg-sage/10 border border-sage/30 rounded-md px-3 py-2 text-sm">
              <div>
                <div className="font-heading font-semibold text-ink">{couponApplied.code}</div>
                <div className="text-xs text-sage">Will apply at checkout</div>
              </div>
              <button onClick={removeCoupon} data-testid="guest-remove-coupon" className="text-xs text-muted-warm hover:text-terracotta">Remove</button>
            </div>
          ) : (
            <>
              <div className="text-[11px] tracking-widest uppercase text-muted-warm mb-1">Promo code</div>
              <div className="flex gap-2">
                <Input data-testid="guest-coupon-input" value={couponInput} onChange={(e) => setCouponInput(e.target.value.toUpperCase())} placeholder="WELCOME10" className="h-9 text-sm" />
                <button onClick={applyCoupon} data-testid="guest-apply-coupon" className="text-xs bg-ink text-cream rounded-full px-4 hover:bg-terracotta transition-colors">Apply</button>
              </div>
              {couponError && <div className="text-xs text-terracotta mt-1">{couponError}</div>}
            </>
          )}
        </div>

        <div className="text-sm space-y-2 mb-5">
          <div className="flex justify-between"><span className="text-muted-warm">Items</span><span>₹{subtotal.toFixed(2)}</span></div>
          {couponApplied && (
            <div className="flex justify-between text-sage">
              <span>Discount ({couponApplied.code})</span>
              <span>−₹{discount.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-warm">Shipping</span>
            <span>{shippingFee === 0 && discountedSubtotal > 0 ? <span className="text-sage">Free</span> : `₹${shippingFee.toFixed(2)}`}</span>
          </div>
          <div className="text-[11px] text-muted-warm">
            Flat ₹{shippingCfg.flat_fee.toFixed(2)} · Free above ₹{shippingCfg.free_threshold.toFixed(0)}
          </div>
          <div className="flex justify-between"><span className="text-muted-warm">Tax (5%)</span><span>₹{tax.toFixed(2)}</span></div>
          <div className="flex justify-between font-heading text-xl font-semibold text-ink border-t border-warm pt-3 mt-2">
            <span>Total</span><span data-testid="guest-total">₹{total.toFixed(2)}</span>
          </div>
        </div>

        <button
          onClick={place}
          disabled={placing || cart.items.length === 0}
          data-testid="guest-place-order"
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
          By placing your order you agree to our terms. A confirmation and tracking link will be sent to your email.
          {payment === "seller_qr" && " Make sure you've completed the UPI payment before placing your order."}
        </div>
      </aside>
    </div>
  );
}
