import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Register() {
  const { register, error, setError } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    const ok = await register(email, password, name);
    if (ok) navigate("/", { replace: true });
  };

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <div className="text-center mb-4">
        <span className="font-heading text-2xl font-bold">
          Shop<span style={{ color: "#FF9900" }}>Kart</span>
        </span>
      </div>
      <div className="bg-white border border-neutral-300 rounded-md p-6">
        <h1 className="font-heading text-2xl font-semibold mb-4">Create account</h1>
        <form onSubmit={submit} className="space-y-3" data-testid="register-form">
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
            <div className="text-xs text-neutral-500 mt-1">Passwords must be at least 6 characters.</div>
          </div>
          {error && <div className="text-sm text-[#B12704]" data-testid="reg-error">{error}</div>}
          <button
            type="submit"
            data-testid="reg-submit"
            className="w-full amazon-orange text-black font-semibold text-sm rounded-full py-2 hover:brightness-95 transition-colors"
          >
            Create your ShopKart account
          </button>
        </form>
        <div className="text-xs text-neutral-600 mt-3">
          Already have an account? <Link to="/login" className="link-blue hover:underline">Sign in</Link>
        </div>
      </div>
    </div>
  );
}
