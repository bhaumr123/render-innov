import React, { useState } from "react";
import { Link } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, ChevronLeft } from "lucide-react";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setError("");
    setLoading(true);
    try {
      await api.post("/auth/forgot-password", { email: email.trim().toLowerCase() });
      setSent(true);
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-14">
      <Link to="/login" className="inline-flex items-center gap-1 text-sm text-muted-warm hover:text-terracotta transition-colors mb-6" data-testid="forgot-back-to-login">
        <ChevronLeft size={14} /> Back to sign in
      </Link>
      <div className="text-[11px] tracking-[0.3em] uppercase text-sage mb-1">Password reset</div>
      <h1 className="font-heading text-3xl font-semibold mb-2">Forgot your password?</h1>
      <p className="text-sm text-muted-warm mb-6">
        Enter the email you signed up with and we'll send you a link to set a new password.
      </p>
      {sent ? (
        <div className="bg-surface border border-warm rounded-lg p-6 space-y-3" data-testid="forgot-sent-card">
          <div className="flex items-center gap-2 text-sage">
            <Mail size={18} />
            <span className="font-heading text-lg font-semibold">Check your inbox</span>
          </div>
          <p className="text-sm text-ink">
            If an account exists for <span className="font-mono">{email}</span>, we've sent a reset link. It expires in <b>30 minutes</b>.
          </p>
          <p className="text-xs text-muted-warm">
            Didn't receive it? Check your spam folder, or{" "}
            <button
              className="text-terracotta hover:underline"
              onClick={() => { setSent(false); setError(""); }}
              data-testid="forgot-try-again"
            >
              try a different email
            </button>.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="bg-surface border border-warm rounded-lg p-6 space-y-4" data-testid="forgot-form">
          <div>
            <Label htmlFor="forgot-email">Email</Label>
            <Input
              id="forgot-email"
              data-testid="forgot-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>
          {error && <div className="text-sm text-terracotta" data-testid="forgot-error">{error}</div>}
          <button
            type="submit"
            disabled={loading}
            data-testid="forgot-submit"
            className="w-full bg-ink text-cream text-sm font-medium rounded-full py-3 hover:bg-terracotta transition-colors disabled:opacity-50"
          >
            {loading ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}
    </div>
  );
}
