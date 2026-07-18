import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Home, Store, Heart, ShoppingBag, User } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { useWishlist } from "@/context/WishlistContext";
import { useAuth } from "@/context/AuthContext";

const items = [
  { to: "/", label: "Home", icon: Home, exact: true },
  { to: "/products", label: "Shop", icon: Store },
  { to: "/wishlist", label: "Wishlist", icon: Heart, badge: "wishlist" },
  { to: "/cart", label: "Cart", icon: ShoppingBag, badge: "cart" },
  { to: "/account", label: "Account", icon: User, isAuth: true },
];

export default function MobileNav() {
  const { pathname } = useLocation();
  const { itemCount } = useCart();
  const { count: wishlistCount } = useWishlist();
  const { user } = useAuth();

  // Hide on auth pages to avoid double-bottom navigation
  if (["/login", "/register"].includes(pathname)) return null;

  const isActive = (item) => {
    if (item.exact) return pathname === item.to;
    if (item.isAuth) return pathname.startsWith("/orders") || pathname === "/account";
    return pathname.startsWith(item.to);
  };

  return (
    <nav
      data-testid="mobile-bottom-nav"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-warm"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="grid grid-cols-5">
        {items.map((it) => {
          const active = isActive(it);
          const badge =
            it.badge === "cart" ? itemCount :
            it.badge === "wishlist" ? wishlistCount : 0;
          const to = it.isAuth ? (user ? "/orders" : "/login") : it.to;
          return (
            <li key={it.label} className="flex">
              <NavLink
                to={to}
                data-testid={`mnav-${it.label.toLowerCase()}`}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 relative transition-colors ${
                  active ? "text-terracotta" : "text-ink"
                }`}
              >
                <it.icon size={20} strokeWidth={active ? 2.2 : 1.7} />
                <span className="text-[10px] font-dot tracking-wider uppercase">{it.label}</span>
                {!!badge && (
                  <span className="absolute top-1 right-1/2 translate-x-4 bg-terracotta text-white font-dot text-[9px] rounded-full min-w-[15px] h-[15px] px-1 flex items-center justify-center tabular-nums">
                    {String(badge).padStart(2, "0")}
                  </span>
                )}
                {active && <span className="absolute -top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-terracotta" />}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
