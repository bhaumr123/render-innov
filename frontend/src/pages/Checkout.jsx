import React, { useState } from "react";
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
    full_name: "", street: "", city: "", state: "", zip: "", country: "USA", phone: "",
  });
  const [payment, setPayment] = useState("mock_card");
  const [placing, setPlacing] = useState(false);

  const shipping = cart.subtotal >= 35 || cart.subtotal === 0 ? 0 : 4.99;
  const tax = +(cart.subtotal * 0.08).toFixed(2);
  const total = +(cart.subtotal + tax + shipping).toFixed(2);

  const placeOrder = async () => {
    if (!address.full_name || !address.street || !address.city || !address.zip) {
      toast.error("Please complete the shipping address");
      return;
    }
    if (cart.items.length === 0) {
      toast.error("Cart is empty");
      return;
    }
    setPlacing(true);
    try {
      const { data } = await api.post("/orders/checkout", { address, payment_method: payment });
      await refresh();
      toast.success("Order placed!");
      navigate(`/order-confirmation/${data.id}`, { state: { order: data } });
    } catch (e) {
      toast.error("Failed to place order");
    } finally {
      setPlacing(false);
    }
  };

  return (
    <div className="max-w-screen-2xl mx-auto px-4 py-4 grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4">
      <section className="space-y-4">
        <div className="bg-white border border-neutral-200 rounded-md p-5">
          <h2 className="font-heading text-lg font-semibold mb-3">1 · Shipping address</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <Label htmlFor="full_name">Full name</Label>
              <Input id="full_name" data-testid="chk-full-name" value={address.full_name}
                onChange={(e) => setAddress({ ...address, full_name: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="street">Street address</Label>
              <Input id="street" data-testid="chk-street" value={address.street}
                onChange={(e) => setAddress({ ...address, street: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="city">City</Label>
              <Input id="city" data-testid="chk-city" value={address.city}
                onChange={(e) => setAddress({ ...address, city: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="state">State</Label>
              <Input id="state" data-testid="chk-state" value={address.state}
                onChange={(e) => setAddress({ ...address, state: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="zip">ZIP</Label>
              <Input id="zip" data-testid="chk-zip" value={address.zip}
                onChange={(e) => setAddress({ ...address, zip: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" data-testid="chk-phone" value={address.phone}
                onChange={(e) => setAddress({ ...address, phone: e.target.value })} />
            </div>
          </div>
        </div>

        <div className="bg-white border border-neutral-200 rounded-md p-5">
          <h2 className="font-heading text-lg font-semibold mb-3">2 · Payment method (mock)</h2>
          <RadioGroup value={payment} onValueChange={setPayment} className="space-y-2">
            <label className="flex items-center gap-2 border border-neutral-200 rounded-md p-3 cursor-pointer">
              <RadioGroupItem value="mock_card" id="mock_card" data-testid="chk-pay-card" />
              <span className="font-medium">Credit/Debit card</span>
              <span className="text-xs text-neutral-500 ml-auto">Simulated — no real charges</span>
            </label>
            <label className="flex items-center gap-2 border border-neutral-200 rounded-md p-3 cursor-pointer">
              <RadioGroupItem value="mock_cod" id="mock_cod" data-testid="chk-pay-cod" />
              <span className="font-medium">Cash on delivery</span>
            </label>
          </RadioGroup>
        </div>

        <div className="bg-white border border-neutral-200 rounded-md p-5">
          <h2 className="font-heading text-lg font-semibold mb-3">3 · Review items</h2>
          <ul className="divide-y divide-neutral-200">
            {cart.items.map((it) => (
              <li key={it.product_id} className="py-3 flex items-center gap-3">
                <img src={it.product?.image_url} className="w-14 h-14 object-contain" alt="" />
                <div className="flex-1 text-sm">
                  <div className="line-clamp-1 font-medium">{it.product?.title}</div>
                  <div className="text-xs text-neutral-500">Qty {it.quantity}</div>
                </div>
                <div className="font-semibold">${(it.product?.price * it.quantity).toFixed(2)}</div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <aside className="bg-white border border-neutral-200 rounded-md p-5 h-fit">
        <button
          onClick={placeOrder}
          disabled={placing || cart.items.length === 0}
          data-testid="chk-place-order"
          className="w-full amazon-orange text-black font-semibold text-sm rounded-full py-2.5 hover:brightness-95 transition-colors disabled:opacity-50"
        >
          {placing ? "Placing order…" : `Place order`}
        </button>
        <div className="text-xs text-neutral-500 mt-2">By placing your order, you agree to ShopKart's mock demo terms.</div>
        <hr className="my-3 border-neutral-200" />
        <div className="font-heading font-semibold mb-2">Order summary</div>
        <div className="text-sm space-y-1">
          <div className="flex justify-between"><span>Items:</span><span>${cart.subtotal.toFixed(2)}</span></div>
          <div className="flex justify-between"><span>Shipping:</span><span>${shipping.toFixed(2)}</span></div>
          <div className="flex justify-between"><span>Tax:</span><span>${tax.toFixed(2)}</span></div>
          <div className="flex justify-between text-price text-lg font-bold border-t border-neutral-200 pt-2 mt-2">
            <span>Order total:</span><span data-testid="chk-total">${total.toFixed(2)}</span>
          </div>
        </div>
      </aside>
    </div>
  );
}
