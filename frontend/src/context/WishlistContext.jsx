import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const WishlistContext = createContext(null);

export function WishlistProvider({ children }) {
  const { user } = useAuth();
  const [ids, setIds] = useState([]);
  const [products, setProducts] = useState([]);

  const refresh = useCallback(async () => {
    if (!user) {
      setIds([]);
      setProducts([]);
      return;
    }
    try {
      const { data } = await api.get("/wishlist");
      setIds(data.product_ids || []);
      setProducts(data.products || []);
    } catch {
      setIds([]);
      setProducts([]);
    }
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  const toggle = async (product_id) => {
    const { data } = await api.post("/wishlist/toggle", { product_id });
    setIds(data.product_ids || []);
    // refresh products list lazily
    refresh();
    return data.in_wishlist;
  };

  const has = (product_id) => ids.includes(product_id);

  return (
    <WishlistContext.Provider value={{ ids, products, toggle, has, refresh, count: ids.length }}>
      {children}
    </WishlistContext.Provider>
  );
}

export const useWishlist = () => useContext(WishlistContext);
