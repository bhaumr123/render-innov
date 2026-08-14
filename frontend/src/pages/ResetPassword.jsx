import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") || "";

  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (pw.length < 6) return setError("Password must be at least 6 characters.");
    if (pw !== confirm) return setError("Passwords do not match.");
    if (!token) return setError("Missing reset token. Please open the link from your email again.");
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, new_password: pw });
      setDone(true);
      toast.success("Password updated");
      setTimeout(() => navigate("/login", { replace: true }), 2500);
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="max-w-md mx-auto px-4 py-14 text-center">
        <h1 className="font-heading text-2xl font-semibold text-terracotta">Missing reset token</h1>
        <p className="text-sm text-muted-warm mt-2">
          This page needs a token from the reset email link. If you clicked the link and still see this, request a new one:
        </p>
        <Link to="/forgot-password" className="inline-block mt-4 text-terracotta hover:underline" data-testid="reset-request-new">
          Send a new reset link →
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-14">
      <div className="text-[11px] tracking-[0.3em] uppercase text-sage mb-1">Set a new password</div>
      <h1 className="font-heading text-3xl font-semibold mb-2">Reset your password</h1>
      <p className="text-sm text-muted-warm mb-6">
        Pick a new password for your Innovation Window India account.
      </p>
      {done ? (
        <div className="bg-surface border border-warm rounded-lg p-6" data-testid="reset-done-card">
          <div className="flex items-center gap-2 text-sage">
            <CheckCircle2 size={20} />
            <span className="font-heading text-lg font-semibold">All set</span>
          </div>
          <p className="text-sm text-ink mt-2">
            Your password has been updated. Redirecting you to sign in…
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="bg-surface border border-warm rounded-lg p-6 space-y-4" data-testid="reset-form">
          <div>
            <Label htmlFor="new-pw">New password</Label>
            <div className="relative">
              <Input
                id="new-pw"
                data-testid="reset-new-password"
                type={reveal ? "text" : "password"}
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                minLength={6}
                required
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setReveal((r) => !r)}
                data-testid="reset-reveal-toggle"
                aria-label={reveal ? "Hide password" : "Show password"}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-warm hover:text-ink"
              >
                {reveal ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <div className="text-[11px] text-muted-warm mt-1">At least 6 characters.</div>
          </div>
          <div>
            <Label htmlFor="confirm-pw">Confirm new password</Label>
            <Input
              id="confirm-pw"
              data-testid="reset-confirm-password"
              type={reveal ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </div>
          {error && <div className="text-sm text-terracotta" data-testid="reset-error">{error}</div>}
          <button
            type="submit"
            disabled={loading}
            data-testid="reset-submit"
            className="w-full bg-ink text-cream text-sm font-medium rounded-full py-3 hover:bg-terracotta transition-colors disabled:opacity-50"
          >
            {loading ? "Updating…" : "Update password"}
          </button>
        </form>
      )}
    </div>
  );
}
