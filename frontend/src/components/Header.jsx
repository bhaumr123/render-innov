import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, ShoppingCart, MapPin, ChevronDown, User as UserIcon } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import api from "@/lib/api";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";

export default function Header() {
  const { user, logout } = useAuth();
  const { itemCount } = useCart();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    api.get("/products/categories").then((r) => setCategories(r.data.categories || []));
  }, []);

  const onSearch = (e) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (cat && cat !== "all") params.set("category", cat);
    navigate(`/products?${params.toString()}`);
  };

  return (
    <header className="w-full sticky top-0 z-40">
      {/* Top bar - Navy */}
      <div className="navy text-white">
        <div className="max-w-screen-2xl mx-auto flex items-center gap-2 md:gap-4 px-3 md:px-4 py-2">
          <Link to="/" data-testid="header-logo" className="shrink-0 px-2 py-1 border border-transparent hover:border-white rounded">
            <span className="font-heading text-xl md:text-2xl font-bold">
              Shop<span style={{ color: "#FF9900" }}>Kart</span>
            </span>
            <div className="text-[10px] leading-none">.com</div>
          </Link>

          {/* Deliver-to */}
          <div className="hidden md:flex items-center gap-1 px-2 py-1 rounded border border-transparent hover:border-white cursor-default">
            <MapPin size={16} />
            <div className="leading-tight text-xs">
              <div className="text-neutral-300">Deliver to</div>
              <div className="font-semibold text-sm">All India</div>
            </div>
          </div>

          {/* Search bar */}
          <form onSubmit={onSearch} data-testid="header-search-form" className="flex-1 flex items-stretch rounded-md overflow-hidden search-bar-focus">
            <div className="bg-neutral-100 text-black">
              <Select value={cat} onValueChange={setCat}>
                <SelectTrigger data-testid="header-category-select" className="h-full min-w-[80px] md:min-w-[110px] rounded-none border-0 bg-neutral-100 focus:ring-0 text-xs">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" data-testid="cat-opt-all">All</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c} data-testid={`cat-opt-${c}`}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <input
              data-testid="header-search-input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              type="text"
              placeholder="Search ShopKart"
              className="flex-1 px-3 py-2 text-black text-sm outline-none min-w-0"
            />
            <button
              type="submit"
              data-testid="header-search-btn"
              aria-label="Search"
              className="amazon-orange hover:brightness-95 text-black px-3 md:px-4 flex items-center justify-center transition-colors"
            >
              <Search size={20} />
            </button>
          </form>

          {/* Account */}
          <DropdownMenu>
            <DropdownMenuTrigger data-testid="header-account-btn" className="hidden md:flex items-center px-2 py-1 rounded border border-transparent hover:border-white text-left">
              <div className="leading-tight text-xs">
                <div className="text-neutral-300">Hello, {user ? user.name.split(" ")[0] : "sign in"}</div>
                <div className="font-semibold text-sm flex items-center gap-1">
                  Account & Lists <ChevronDown size={12} />
                </div>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {!user ? (
                <>
                  <DropdownMenuItem asChild>
                    <Link to="/login" data-testid="menu-login">Sign in</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/register" data-testid="menu-register">Create account</Link>
                  </DropdownMenuItem>
                </>
              ) : (
                <>
                  <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/orders" data-testid="menu-orders">Your orders</Link>
                  </DropdownMenuItem>
                  {user.role === "admin" && (
                    <DropdownMenuItem asChild>
                      <Link to="/admin" data-testid="menu-admin">Admin panel</Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout} data-testid="menu-logout">Sign out</DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Orders */}
          <Link
            to={user ? "/orders" : "/login"}
            data-testid="header-orders-link"
            className="hidden lg:block px-2 py-1 rounded border border-transparent hover:border-white leading-tight text-xs"
          >
            <div className="text-neutral-300">Returns</div>
            <div className="font-semibold text-sm">& Orders</div>
          </Link>

          {/* Cart */}
          <Link
            to="/cart"
            data-testid="header-cart-link"
            className="flex items-end gap-1 px-2 py-1 rounded border border-transparent hover:border-white relative"
          >
            <div className="relative">
              <ShoppingCart size={26} />
              <span
                data-testid="header-cart-count"
                className="absolute -top-1 -right-2 amazon-orange text-black text-xs font-bold rounded-full px-1.5 min-w-[20px] text-center leading-4"
              >
                {itemCount}
              </span>
            </div>
            <span className="hidden md:inline font-semibold text-sm">Cart</span>
          </Link>

          {/* Mobile account icon */}
          <Link to={user ? "/orders" : "/login"} className="md:hidden">
            <UserIcon size={22} />
          </Link>
        </div>

        {/* Sub-nav */}
        <div className="navy-2 text-white text-xs md:text-sm">
          <div className="max-w-screen-2xl mx-auto flex items-center gap-1 md:gap-3 px-3 md:px-4 py-1.5 overflow-x-auto">
            <Link data-testid="subnav-all" to="/products" className="px-2 py-1 rounded border border-transparent hover:border-white whitespace-nowrap font-semibold">All</Link>
            {categories.slice(0, 8).map((c) => (
              <Link
                key={c}
                to={`/products?category=${encodeURIComponent(c)}`}
                data-testid={`subnav-${c}`}
                className="px-2 py-1 rounded border border-transparent hover:border-white whitespace-nowrap"
              >
                {c}
              </Link>
            ))}
            {user?.role === "admin" && (
              <Link to="/admin" data-testid="subnav-admin" className="px-2 py-1 rounded border border-transparent hover:border-white whitespace-nowrap ml-auto font-semibold" style={{ color: "#FF9900" }}>
                Admin
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
