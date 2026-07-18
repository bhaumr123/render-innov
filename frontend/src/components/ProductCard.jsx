import React from "react";
import { Link } from "react-router-dom";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { useCart } from "@/context/CartContext";
import { useAuth } from "@/context/AuthContext";
import { useNavigate } from "react-router-dom";

export default function ProductCard({ product }) {
  const { addToCart } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!user) {
      toast.error("Please sign in to add items");
      navigate("/login");
      return;
    }
    try {
      await addToCart(product.id, 1);
      toast.success(`Added to cart: ${product.title}`);
    } catch (err) {
      toast.error("Failed to add to cart");
    }
  };

  return (
    <Link
      to={`/product/${product.id}`}
      data-testid={`product-card-${product.id}`}
      className="bg-white border border-neutral-200 rounded-md p-3 flex flex-col hover:shadow-sm transition-shadow group"
    >
      <div className="aspect-square bg-white flex items-center justify-center overflow-hidden mb-2">
        <img
          src={product.image_url || "https://via.placeholder.com/300"}
          alt={product.title}
          className="max-h-full max-w-full object-contain group-hover:scale-[1.02] transition-transform"
          loading="lazy"
        />
      </div>
      <div className="font-heading text-sm font-semibold text-neutral-900 line-clamp-2 leading-snug min-h-[2.5rem]">
        {product.title}
      </div>
      <div className="flex items-center gap-1 mt-1 text-xs">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            size={14}
            className={i < Math.round(product.rating) ? "fill-yellow-400 text-yellow-400" : "text-neutral-300"}
          />
        ))}
        <span className="link-blue ml-1">{product.reviews_count || 0}</span>
      </div>
      <div className="mt-1">
        <span className="text-xs align-top">$</span>
        <span className="text-xl font-bold">{Math.floor(product.price)}</span>
        <span className="text-xs align-top">
          {(product.price % 1).toFixed(2).slice(1)}
        </span>
      </div>
      {product.stock > 0 ? (
        <div className="text-xs text-neutral-600 mt-0.5">In stock</div>
      ) : (
        <div className="text-xs text-red-700 mt-0.5">Out of stock</div>
      )}
      <button
        onClick={handleAdd}
        data-testid={`product-add-btn-${product.id}`}
        disabled={product.stock <= 0}
        className="mt-3 amazon-orange text-black font-semibold text-sm rounded-full py-1.5 hover:brightness-95 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Add to Cart
      </button>
    </Link>
  );
}
