import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const CartContext = createContext(null);
const GUEST_CART_KEY = "iwi_guest_cart_v1";

/**
 * Cart works in two modes:
 *  - Authed user  → server-side cart via /api/cart/*
 *  - Guest user   → localStorage cart, with product details hydrated from /api/products/:id
 */
export function CartProvider({ children }) {
  const { user } = useAuth();
  const [cart, setCart] = useState({ items: [], subtotal: 0 });
  const [loading, setLoading] = useState(false);
  const hydratingRef = useRef(false);

  const isGuest = !user; // user === false → logged out, null → still loading

  // ---------- Guest cart helpers ----------
  const readGuestCart = () => {
    try {
      const raw = localStorage.getItem(GUEST_CART_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  };
  const writeGuestCart = (items) => {
    try { localStorage.setItem(GUEST_CART_KEY, JSON.stringify(items)); } catch {}
  };

  const hydrateGuestCart = useCallback(async () => {
    if (hydratingRef.current) return;
    hydratingRef.current = true;
    try {
      const raw = readGuestCart();
      const items = [];
      for (const it of raw) {
        try {
          const { data: p } = await api.get(`/products/${it.product_id}`);
          let unit_price = p.price;
          for (const v of p.size_variants || []) {
            if (v.label === it.variant_label) { unit_price = v.price; break; }
          }
          items.push({
            product_id: it.product_id,
            quantity: it.quantity,
            variant_label: it.variant_label || "",
            unit_price,
            product: p,
          });
        } catch {
          // product missing / deleted → drop from cart
        }
      }
      const subtotal = items.reduce((s, i) => s + i.unit_price * i.quantity, 0);
      setCart({ items, subtotal: +subtotal.toFixed(2) });
    } finally {
      hydratingRef.current = false;
    }
  }, []);

  // ---------- Server cart refresh (authed only) ----------
  const refresh = useCallback(async () => {
    if (user === null) return; // auth still loading
    if (isGuest) {
      await hydrateGuestCart();
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.get("/cart");
      setCart(data);
    } catch {
      setCart({ items: [], subtotal: 0 });
    } finally {
      setLoading(false);
    }
  }, [user, isGuest, hydrateGuestCart]);

  useEffect(() => { refresh(); }, [refresh]);

  // ---------- Mutations ----------
  const addToCart = async (product_id, quantity = 1, variant_label = "") => {
    if (isGuest) {
      const raw = readGuestCart();
      const idx = raw.findIndex((it) => it.product_id === product_id && (it.variant_label || "") === (variant_label || ""));
      if (idx >= 0) raw[idx].quantity += quantity;
      else raw.push({ product_id, quantity, variant_label });
      writeGuestCart(raw);
      await hydrateGuestCart();
      return;
    }
    const { data } = await api.post("/cart/add", { product_id, quantity, variant_label });
    setCart(data);
    return data;
  };

  const updateQty = async (product_id, quantity, variant_label = "") => {
    if (isGuest) {
      let raw = readGuestCart();
      if (quantity <= 0) {
        raw = raw.filter((it) => !(it.product_id === product_id && (it.variant_label || "") === (variant_label || "")));
      } else {
        const idx = raw.findIndex((it) => it.product_id === product_id && (it.variant_label || "") === (variant_label || ""));
        if (idx >= 0) raw[idx].quantity = quantity;
      }
      writeGuestCart(raw);
      await hydrateGuestCart();
      return;
    }
    const { data } = await api.post("/cart/update", { product_id, quantity, variant_label });
    setCart(data);
  };

  const removeItem = async (product_id, variant_label = "") => {
    if (isGuest) {
      const raw = readGuestCart().filter((it) => !(it.product_id === product_id && (it.variant_label || "") === (variant_label || "")));
      writeGuestCart(raw);
      await hydrateGuestCart();
      return;
    }
    const { data } = await api.post("/cart/remove", { product_id, quantity: 0, variant_label });
    setCart(data);
  };

  const clear = async () => {
    if (isGuest) {
      writeGuestCart([]);
      setCart({ items: [], subtotal: 0 });
      return;
    }
    const { data } = await api.post("/cart/clear");
    setCart(data);
  };

  // Wipe the guest cart once user logs in (avoid stale duplicate items).
  useEffect(() => {
    if (user && localStorage.getItem(GUEST_CART_KEY)) {
      localStorage.removeItem(GUEST_CART_KEY);
    }
  }, [user]);

  const itemCount = cart.items.reduce((s, i) => s + i.quantity, 0);

  return (
    <CartContext.Provider value={{ cart, loading, isGuest, addToCart, updateQty, removeItem, clear, refresh, itemCount }}>
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => useContext(CartContext);
