import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useCart } from "@/context/CartContext";
import { useAuth } from "@/context/AuthContext";
import WishlistButton from "@/components/WishlistButton";

export default function ProductCard({ product }) {
  const { addToCart } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();

  const hasVariants = product.size_variants && product.size_variants.length > 0;
  const startingPrice = hasVariants
    ? Math.min(...product.size_variants.map((v) => Number(v.price)))
    : product.price;

  const handleAdd = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      toast.error("Please sign in to add items");
      navigate("/login");
      return;
    }
    if (hasVariants) {
      // Go to detail so a size is chosen
      navigate(`/product/${product.id}`);
      return;
    }
    try {
      await addToCart(product.id, 1, "");
      toast.success(`Added to cart · ${product.title}`);
    } catch {
      toast.error("Failed to add to cart");
    }
  };

  return (
    <Link
      to={`/product/${product.id}`}
      data-testid={`product-card-${product.id}`}
      className="group bg-surface border border-warm rounded-lg overflow-hidden flex flex-col hover:shadow-sm transition-shadow"
    >
      <div className="aspect-square bg-parchment/40 flex items-center justify-center p-4 overflow-hidden relative">
        <WishlistButton productId={product.id} size={16} className="absolute top-2 right-2 h-8 w-8" />
        <img
          src={product.image_url}
          alt={product.title}
          className="max-h-full max-w-full object-contain group-hover:scale-[1.02] transition-transform"
          loading="lazy"
        />
      </div>
      <div className="p-4 flex-1 flex flex-col">
        <div className="text-[10px] tracking-widest uppercase text-sage mb-1">{product.category}</div>
        <h3 className="font-heading text-base font-semibold text-ink line-clamp-2 leading-snug min-h-[2.5rem]">
          {product.title}
        </h3>
        <div className="mt-auto pt-3 flex items-end justify-between gap-2">
          <div>
            {hasVariants && <div className="text-[10px] text-muted-warm uppercase tracking-wider">from</div>}
            <div className="font-heading text-xl font-semibold text-ink">
              ₹{startingPrice.toFixed(2)}
            </div>
          </div>
          <button
            onClick={handleAdd}
            data-testid={`product-add-btn-${product.id}`}
            className="text-xs font-medium uppercase tracking-widest text-terracotta hover:text-ink transition-colors border-b border-terracotta/40 hover:border-ink pb-0.5"
          >
            {hasVariants ? "Choose size" : "Add · Cart"}
          </button>
        </div>
      </div>
    </Link>
  );
}
