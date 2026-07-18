import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, ShoppingBag, Menu, X, User as UserIcon } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import api from "@/lib/api";
import { LOGO } from "@/lib/assets";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

export default function Header() {
  const { user, logout } = useAuth();
  const { itemCount } = useCart();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [categories, setCategories] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    api.get("/products/categories").then((r) => setCategories(r.data.categories || []));
  }, []);

  const onSearch = (e) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    navigate(`/products?${params.toString()}`);
    setMenuOpen(false);
  };

  return (
    <header className="w-full sticky top-0 z-40 bg-cream/95 backdrop-blur-sm border-b border-warm">
      {/* Announcement strip */}
      <div className="bg-ink text-cream text-xs tracking-widest uppercase">
        <div className="max-w-screen-xl mx-auto px-4 py-1.5 text-center">
          Complimentary shipping on orders above ₹75 · Free returns within 14 days
        </div>
      </div>

      {/* Main bar */}
      <div className="max-w-screen-xl mx-auto flex items-center gap-4 px-4 md:px-6 py-3">
        <Link to="/" data-testid="header-logo" className="flex items-center gap-3 shrink-0">
          <img src={LOGO} alt="Innovation Window India" className="h-10 w-10 rounded-full object-cover bg-white border border-warm" />
          <div className="leading-tight hidden sm:block">
            <div className="font-heading text-lg font-semibold text-ink">Innovation Window India</div>
            <div className="text-[10px] tracking-[0.2em] uppercase text-sage">Nourish Naturally</div>
          </div>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-6 ml-4 text-sm">
          <Link to="/products" data-testid="nav-shop-all" className="text-ink hover:text-terracotta transition-colors">Shop all</Link>
          {categories.slice(0, 4).map((c) => (
            <Link
              key={c}
              to={`/products?category=${encodeURIComponent(c)}`}
              data-testid={`nav-${c}`}
              className="text-ink hover:text-terracotta transition-colors"
            >
              {c}
            </Link>
          ))}
        </nav>

        {/* Right */}
        <div className="ml-auto flex items-center gap-2">
          <form onSubmit={onSearch} data-testid="header-search-form" className="hidden lg:flex items-center gap-2 bg-white border border-warm rounded-full px-3 py-1.5 focus-within:border-terracotta">
            <Search size={16} className="text-muted-warm" />
            <input
              data-testid="header-search-input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              type="text"
              placeholder="Search teas, spices…"
              className="bg-transparent outline-none text-sm w-52"
            />
          </form>

          <DropdownMenu>
            <DropdownMenuTrigger data-testid="header-account-btn" className="p-2 rounded-full hover:bg-parchment transition-colors">
              <UserIcon size={20} className="text-ink" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {!user ? (
                <>
                  <DropdownMenuItem asChild><Link to="/login" data-testid="menu-login">Sign in</Link></DropdownMenuItem>
                  <DropdownMenuItem asChild><Link to="/register" data-testid="menu-register">Create account</Link></DropdownMenuItem>
                </>
              ) : (
                <>
                  <DropdownMenuLabel className="font-normal">
                    <div className="text-xs text-muted-warm">Signed in as</div>
                    <div className="text-sm font-medium truncate">{user.email}</div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild><Link to="/orders" data-testid="menu-orders">Your orders</Link></DropdownMenuItem>
                  {user.role === "admin" && (
                    <DropdownMenuItem asChild><Link to="/admin" data-testid="menu-admin">Admin panel</Link></DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout} data-testid="menu-logout">Sign out</DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <Link
            to="/cart"
            data-testid="header-cart-link"
            className="relative p-2 rounded-full hover:bg-parchment transition-colors"
          >
            <ShoppingBag size={20} className="text-ink" />
            {itemCount > 0 && (
              <span
                data-testid="header-cart-count"
                className="absolute -top-0.5 -right-0.5 bg-terracotta text-white text-[10px] font-semibold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center"
              >
                {itemCount}
              </span>
            )}
          </Link>

          <button
            data-testid="mobile-menu-btn"
            onClick={() => setMenuOpen(!menuOpen)}
            className="md:hidden p-2 rounded-full hover:bg-parchment"
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-warm bg-cream px-4 py-4">
          <form onSubmit={onSearch} className="flex items-center gap-2 bg-white border border-warm rounded-full px-3 py-2 mb-3">
            <Search size={16} className="text-muted-warm" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              type="text"
              placeholder="Search…"
              className="bg-transparent outline-none text-sm flex-1"
            />
          </form>
          <nav className="flex flex-col text-sm">
            <Link to="/products" onClick={() => setMenuOpen(false)} className="py-2 border-b border-warm">Shop all</Link>
            {categories.map((c) => (
              <Link key={c} to={`/products?category=${encodeURIComponent(c)}`} onClick={() => setMenuOpen(false)} className="py-2 border-b border-warm">
                {c}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
