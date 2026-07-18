import React from "react";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useWishlist } from "@/context/WishlistContext";

export default function WishlistButton({ productId, size = 18, className = "" }) {
  const { user } = useAuth();
  const { has, toggle } = useWishlist();
  const navigate = useNavigate();
  const active = has(productId);

  const onClick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      toast.error("Please sign in to save items");
      navigate("/login");
      return;
    }
    const inWishlist = await toggle(productId);
    toast.success(inWishlist ? "Saved to wishlist" : "Removed from wishlist");
  };

  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`wishlist-btn-${productId}`}
      aria-label={active ? "Remove from wishlist" : "Add to wishlist"}
      className={`inline-flex items-center justify-center rounded-full bg-white/95 backdrop-blur border border-warm hover:border-terracotta transition-colors ${className}`}
    >
      <Heart
        size={size}
        style={active ? { fill: "#DC7238", color: "#DC7238" } : { color: "#4A5568" }}
      />
    </button>
  );
}
