import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LOGO } from "@/lib/assets";

export default function Login() {
  const { login, error, setError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from || "/";

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    const ok = await login(email, password);
    if (ok) navigate(from, { replace: true });
  };

  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <Link to="/" className="flex items-center gap-3 justify-center mb-6">
        <img src={LOGO} alt="IWI" className="h-12 w-12 rounded-full bg-white object-cover border border-warm" />
        <div className="leading-tight">
          <div className="font-heading text-lg font-semibold">Innovation Window India</div>
          <div className="text-[10px] tracking-[0.25em] uppercase text-sage">Nourish Naturally</div>
        </div>
      </Link>
      <div className="bg-surface border border-warm rounded-lg p-8">
        <h1 className="font-heading text-2xl font-semibold mb-1">Welcome back</h1>
        <p className="text-sm text-muted-warm mb-5">Sign in to view orders and manage your basket.</p>
        <form onSubmit={submit} className="space-y-4" data-testid="login-form">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" data-testid="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input id="password" data-testid="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <div className="text-sm text-terracotta" data-testid="login-error">{error}</div>}
          <button
            type="submit"
            data-testid="login-submit"
            className="w-full bg-ink text-cream text-sm font-medium rounded-full py-3 hover:bg-terracotta transition-colors"
          >
            Sign in
          </button>
        </form>
        <div className="text-xs text-muted-warm text-center mt-4">
          New here? <Link to="/register" data-testid="login-to-register" className="text-terracotta hover:underline">Create an account</Link>
        </div>
      </div>
    </div>
  );
}
