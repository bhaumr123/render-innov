import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCart } from "@/context/CartContext";
import api from "@/lib/api";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export default function Checkout() {
  const { cart, refresh } = useCart();
  const navigate = useNavigate();
  const [address, setAddress] = useState({
    full_name: "", street: "", city: "", state: "", zip: "", country: "India", phone: "",
  });
  const [payment, setPayment] = useState("mock_card");
  const [placing, setPlacing] = useState(false);
  const [shippingCfg, setShippingCfg] = useState({ flat_fee: 6.99, free_threshold: 75 });

  useEffect(() => {
    api.get("/config/shipping").then((r) => setShippingCfg(r.data));
  }, []);

  const shipping = cart.subtotal === 0 ? 0 : (cart.subtotal >= shippingCfg.free_threshold ? 0 : shippingCfg.flat_fee);
  const tax = +(cart.subtotal * 0.05).toFixed(2);
  const total = +(cart.subtotal + tax + shipping).toFixed(2);

  const placeOrder = async () => {
    if (!address.full_name || !address.street || !address.city || !address.zip) {
      toast.error("Please complete the shipping address");
      return;
    }
    if (cart.items.length === 0) return toast.error("Cart is empty");
    setPlacing(true);
    try {
      const { data } = await api.post("/orders/checkout", { address, payment_method: payment });
      await refresh();
      toast.success("Order placed · thank you!");
      navigate(`/order-confirmation/${data.id}`, { state: { order: data } });
    } catch {
      toast.error("Failed to place order");
    } finally {
      setPlacing(false);
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
          <h2 className="font-heading text-lg font-semibold mb-4">2 · Payment (mock)</h2>
          <RadioGroup value={payment} onValueChange={setPayment} className="space-y-2">
            <label className="flex items-center gap-3 border border-warm rounded-md p-3 cursor-pointer bg-cream/40 hover:border-terracotta transition-colors">
              <RadioGroupItem value="mock_card" id="mock_card" data-testid="chk-pay-card" />
              <div className="flex-1">
                <div className="font-medium">Credit / debit card</div>
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
        <div className="text-sm space-y-2 mb-5">
          <div className="flex justify-between"><span className="text-muted-warm">Items</span><span>₹{cart.subtotal.toFixed(2)}</span></div>
          <div className="flex justify-between">
            <span className="text-muted-warm">Shipping</span>
            <span>{shipping === 0 && cart.subtotal > 0 ? <span className="text-sage">Free</span> : `₹${shipping.toFixed(2)}`}</span>
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
          {placing ? "Placing order…" : "Place order"}
        </button>
        <div className="text-[11px] text-muted-warm mt-3">
          By placing your order, you agree to the demo terms.
        </div>
      </aside>
    </div>
  );
}
