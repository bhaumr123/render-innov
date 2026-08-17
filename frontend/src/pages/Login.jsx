import React, { useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { LOGO } from "@/lib/assets";
import { AlertTriangle } from "lucide-react";

export default function Login() {
  const { login, error, setError } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const from = location.state?.from || "/";
  const sessionReplaced = searchParams.get("reason") === "session_replaced";

  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <Link to="/" className="flex items-center gap-3 justify-center mb-6">
        <img src={LOGO} alt="IWI" className="h-12 w-12 rounded-full bg-white object-cover border border-warm" />
        <div className="leading-tight">
          <div className="font-heading text-lg font-semibold">Innovation Window India</div>
          <div className="text-[10px] tracking-[0.25em] uppercase text-sage">Nourish Naturally</div>
        </div>
      </Link>
      {sessionReplaced && (
        <div
          className="max-w-md mx-auto mb-4 flex items-start gap-2 text-sm text-terracotta bg-terracotta/5 border border-terracotta/30 rounded-lg px-4 py-3"
          data-testid="login-session-replaced-notice"
        >
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span>You were signed out because this account was signed in from another device. Only one session is allowed at a time.</span>
        </div>
      )}
      <div className="bg-surface border border-warm rounded-lg p-8">
        <Tabs defaultValue="buyer" onValueChange={() => setError("")}>
          <TabsList className="w-full grid grid-cols-2 mb-5">
            <TabsTrigger value="buyer" data-testid="login-tab-buyer">Buyer</TabsTrigger>
            <TabsTrigger value="seller" data-testid="login-tab-seller">Seller</TabsTrigger>
          </TabsList>

          {/* Buyer: plain, simple sign-in form */}
          <TabsContent value="buyer">
            <h1 className="font-heading text-2xl font-semibold mb-1">Welcome back</h1>
            <p className="text-sm text-muted-warm mb-5">Sign in to view orders and manage your basket.</p>
            <BuyerLoginForm login={login} error={error} setError={setError} onSuccess={() => navigate(from, { replace: true })} />
            <div className="text-xs text-muted-warm text-center mt-4">
              New here? <Link to="/register" data-testid="login-to-register" className="text-terracotta hover:underline">Create an account</Link>
            </div>
          </TabsContent>

          {/* Seller: dedicated sign-in section */}
          <TabsContent value="seller">
            <h1 className="font-heading text-2xl font-semibold mb-1">Seller sign in</h1>
            <p className="text-sm text-muted-warm mb-5">Sign in to list products and manage your storefront.</p>
            <SellerLoginForm login={login} error={error} setError={setError} onSuccess={() => navigate("/seller/dashboard", { replace: true })} />
            <div className="text-xs text-muted-warm text-center mt-4">
              New seller? <Link to="/register?role=seller" data-testid="login-to-seller-register" className="text-terracotta hover:underline">Create a seller account</Link>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function BuyerLoginForm({ login, error, setError, onSuccess }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    const ok = await login(email, password);
    if (ok) onSuccess();
  };

  return (
    <form onSubmit={submit} className="space-y-4" data-testid="login-form">
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" data-testid="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div>
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Link to="/forgot-password" data-testid="login-forgot-link" className="text-xs text-terracotta hover:underline">
            Forgot password?
          </Link>
        </div>
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
  );
}

function SellerLoginForm({ login, error, setError, onSuccess }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    const ok = await login(email, password);
    if (ok) onSuccess();
  };

  return (
    <form onSubmit={submit} className="space-y-4" data-testid="seller-login-form">
      <div>
        <Label htmlFor="seller-email">Email</Label>
        <Input id="seller-email" data-testid="seller-login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div>
        <div className="flex items-center justify-between">
          <Label htmlFor="seller-password">Password</Label>
          <Link to="/forgot-password" data-testid="seller-login-forgot-link" className="text-xs text-terracotta hover:underline">
            Forgot password?
          </Link>
        </div>
        <Input id="seller-password" data-testid="seller-login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </div>
      {error && <div className="text-sm text-terracotta" data-testid="seller-login-error">{error}</div>}
      <button
        type="submit"
        data-testid="seller-login-submit"
        className="w-full bg-ink text-cream text-sm font-medium rounded-full py-3 hover:bg-terracotta transition-colors"
      >
        Sign in as seller
      </button>
    </form>
  );
}
