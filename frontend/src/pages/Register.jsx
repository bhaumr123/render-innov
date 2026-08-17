import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LOGO } from "@/lib/assets";

export default function Register() {
  const { register, error, setError } = useAuth();
  const [searchParams] = useSearchParams();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState(searchParams.get("role") === "seller" ? "seller" : "customer");
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    const ok = await register(email, password, name, role);
    if (ok) navigate(role === "seller" ? "/seller/dashboard" : "/", { replace: true });
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
        <h1 className="font-heading text-2xl font-semibold mb-1">Join the apothecary</h1>
        <p className="text-sm text-muted-warm mb-5">Save orders, track shipments and check out faster.</p>

        <div className="grid grid-cols-2 gap-2 mb-5">
          <button
            type="button"
            data-testid="reg-role-buyer"
            onClick={() => setRole("customer")}
            className={`text-sm rounded-full py-2 border transition-colors ${role === "customer" ? "bg-ink text-cream border-ink" : "border-warm text-ink hover:bg-parchment"}`}
          >
            I'm a buyer
          </button>
          <button
            type="button"
            data-testid="reg-role-seller"
            onClick={() => setRole("seller")}
            className={`text-sm rounded-full py-2 border transition-colors ${role === "seller" ? "bg-ink text-cream border-ink" : "border-warm text-ink hover:bg-parchment"}`}
          >
            I'm a seller
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4" data-testid="register-form">
          <div>
            <Label htmlFor="name">Your name</Label>
            <Input id="name" data-testid="reg-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" data-testid="reg-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input id="password" data-testid="reg-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            <div className="text-xs text-muted-warm mt-1">At least 6 characters.</div>
          </div>
          {error && <div className="text-sm text-terracotta" data-testid="reg-error">{error}</div>}
          <button
            type="submit"
            data-testid="reg-submit"
            className="w-full bg-ink text-cream text-sm font-medium rounded-full py-3 hover:bg-terracotta transition-colors"
          >
            {role === "seller" ? "Create seller account" : "Create account"}
          </button>
        </form>
        <div className="text-xs text-muted-warm text-center mt-4">
          Already have an account? <Link to="/login" className="text-terracotta hover:underline">Sign in</Link>
        </div>
      </div>
    </div>
  );
}
