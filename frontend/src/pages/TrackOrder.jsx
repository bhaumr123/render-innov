import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search } from "lucide-react";

export default function TrackOrder() {
  const navigate = useNavigate();
  const [orderNumber, setOrderNumber] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!orderNumber.trim() || !email.trim()) {
      setError("Please enter your order number and email.");
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post("/orders/guest/lookup", {
        order_number: orderNumber.trim(),
        email: email.trim().toLowerCase(),
      });
      navigate(`/order-confirmation/${data.id}?t=${encodeURIComponent(data.guest_access_token)}`);
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-14">
      <div className="text-[11px] tracking-[0.3em] uppercase text-sage mb-1 text-center">Guest order lookup</div>
      <h1 className="font-heading text-3xl font-semibold text-center mb-2">Track your order</h1>
      <p className="text-sm text-muted-warm text-center mb-6">
        Enter the order number from your confirmation email along with the email you used at checkout.
      </p>
      <form onSubmit={submit} className="bg-surface border border-warm rounded-lg p-6 space-y-4" data-testid="track-form">
        <div>
          <Label htmlFor="order-number">Order number</Label>
          <Input
            id="order-number"
            data-testid="track-order-number"
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value.toUpperCase())}
            placeholder="IWI-XXXXXXXXXX"
          />
        </div>
        <div>
          <Label htmlFor="track-email">Email</Label>
          <Input
            id="track-email"
            type="email"
            data-testid="track-email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
        {error && <div className="text-sm text-terracotta" data-testid="track-error">{error}</div>}
        <button
          type="submit"
          disabled={loading}
          data-testid="track-submit"
          className="w-full bg-ink text-cream text-sm font-medium rounded-full py-3 hover:bg-terracotta transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
        >
          <Search size={14} /> {loading ? "Searching…" : "Find my order"}
        </button>
      </form>
    </div>
  );
}
