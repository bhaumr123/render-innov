import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
    <div className="max-w-md mx-auto px-4 py-8">
      <div className="text-center mb-4">
        <span className="font-heading text-2xl font-bold">
          Shop<span style={{ color: "#FF9900" }}>Kart</span>
        </span>
      </div>
      <div className="bg-white border border-neutral-300 rounded-md p-6">
        <h1 className="font-heading text-2xl font-semibold mb-4">Sign in</h1>
        <form onSubmit={submit} className="space-y-3" data-testid="login-form">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" data-testid="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input id="password" data-testid="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <div className="text-sm text-[#B12704]" data-testid="login-error">{error}</div>}
          <button
            type="submit"
            data-testid="login-submit"
            className="w-full amazon-orange text-black font-semibold text-sm rounded-full py-2 hover:brightness-95 transition-colors"
          >
            Sign in
          </button>
        </form>
        <hr className="my-4 border-neutral-200" />
        <p className="text-xs text-neutral-600">
          By continuing, you agree to ShopKart's demo Conditions of Use.
        </p>
      </div>
      <div className="text-center text-sm mt-4">
        New to ShopKart?
      </div>
      <Link
        to="/register"
        data-testid="login-to-register"
        className="mt-2 block text-center border border-neutral-300 bg-neutral-100 hover:bg-neutral-200 rounded-full py-2 text-sm font-medium transition-colors"
      >
        Create your ShopKart account
      </Link>
    </div>
  );
}
