import React from "react";
import { Link } from "react-router-dom";
import { useWishlist } from "@/context/WishlistContext";
import { useAuth } from "@/context/AuthContext";
import ProductCard from "@/components/ProductCard";

export default function Wishlist() {
  const { user } = useAuth();
  const { products } = useWishlist();

  if (!user) {
    return (
      <div className="max-w-md mx-auto py-16 text-center">
        <h1 className="font-heading text-3xl font-semibold">Your wishlist</h1>
        <p className="text-sm text-muted-warm mt-2">Sign in to see the items you've saved.</p>
        <Link to="/login" className="mt-4 inline-block bg-ink text-cream text-sm rounded-full px-5 py-2 hover:bg-terracotta transition-colors">
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-screen-xl mx-auto px-4 md:px-6 py-8">
      <div className="text-[11px] tracking-[0.3em] uppercase text-sage mb-1">Saved for later</div>
      <h1 className="font-heading text-3xl font-semibold mb-6">Wishlist</h1>
      {products.length === 0 ? (
        <div className="bg-surface border border-warm rounded-lg p-10 text-center">
          <div className="font-heading text-xl">Nothing saved yet.</div>
          <p className="text-sm text-muted-warm mt-2">Tap the heart on any product to save it here.</p>
          <Link to="/products" className="mt-4 inline-block text-terracotta hover:underline text-sm">
            Browse the shop →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {products.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      )}
    </div>
  );
}
