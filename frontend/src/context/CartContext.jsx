import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const { user } = useAuth();
  const [cart, setCart] = useState({ items: [], subtotal: 0 });
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setCart({ items: [], subtotal: 0 });
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
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addToCart = async (product_id, quantity = 1) => {
    const { data } = await api.post("/cart/add", { product_id, quantity });
    setCart(data);
    return data;
  };

  const updateQty = async (product_id, quantity) => {
    const { data } = await api.post("/cart/update", { product_id, quantity });
    setCart(data);
  };

  const removeItem = async (product_id) => {
    const { data } = await api.post("/cart/remove", { product_id, quantity: 0 });
    setCart(data);
  };

  const clear = async () => {
    const { data } = await api.post("/cart/clear");
    setCart(data);
  };

  const itemCount = cart.items.reduce((s, i) => s + i.quantity, 0);

  return (
    <CartContext.Provider value={{ cart, loading, addToCart, updateQty, removeItem, clear, refresh, itemCount }}>
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => useContext(CartContext);
