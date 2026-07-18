import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { toast } from "sonner";
import { Star, Truck, ShieldCheck } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { useAuth } from "@/context/AuthContext";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

export default function ProductDetail() {
  const { id } = useParams();
  const [p, setP] = useState(null);
  const [qty, setQty] = useState(1);
  const [selectedImg, setSelectedImg] = useState(0);
  const { addToCart } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    api.get(`/products/${id}`).then((r) => setP(r.data)).catch(() => setP(false));
  }, [id]);

  if (p === null) return <div className="max-w-screen-2xl mx-auto p-6 text-neutral-500">Loading…</div>;
  if (p === false) return <div className="max-w-screen-2xl mx-auto p-6">Product not found.</div>;

  const images = p.images?.length ? p.images : [p.image_url].filter(Boolean);
  const mainImg = images[selectedImg] || p.image_url;

  const handleAdd = async () => {
    if (!user) {
      navigate("/login");
      return;
    }
    await addToCart(p.id, qty);
    toast.success(`Added ${qty} to cart`);
  };

  const handleBuy = async () => {
    if (!user) {
      navigate("/login");
      return;
    }
    await addToCart(p.id, qty);
    navigate("/checkout");
  };

  return (
    <div className="max-w-screen-2xl mx-auto px-4 py-4">
      <div className="bg-white border border-neutral-200 rounded-md p-4 md:p-6 grid grid-cols-1 md:grid-cols-[100px_1fr_320px] gap-4">
        {/* Thumbnails */}
        <div className="flex md:flex-col gap-2 order-2 md:order-1">
          {images.map((src, i) => (
            <button
              key={i}
              onClick={() => setSelectedImg(i)}
              data-testid={`product-thumb-${i}`}
              className={`w-16 h-16 border rounded overflow-hidden ${selectedImg === i ? "border-[#FF9900] border-2" : "border-neutral-300"}`}
            >
              <img src={src} className="w-full h-full object-contain" alt="" />
            </button>
          ))}
        </div>

        {/* Main image */}
        <div className="order-1 md:order-2">
          <div className="aspect-square bg-white rounded flex items-center justify-center">
            <img src={mainImg} alt={p.title} className="max-h-full max-w-full object-contain" />
          </div>
        </div>

        {/* Info & buy box */}
        <div className="order-3 flex flex-col gap-3">
          <div>
            {p.brand && <div className="link-blue text-xs">{p.brand}</div>}
            <h1 className="font-heading text-xl md:text-2xl font-semibold leading-tight">{p.title}</h1>
            <div className="flex items-center gap-2 mt-1 text-sm">
              <div className="flex items-center">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} size={16} className={i < Math.round(p.rating) ? "fill-yellow-400 text-yellow-400" : "text-neutral-300"} />
                ))}
              </div>
              <span className="link-blue">{p.reviews_count || 0} ratings</span>
            </div>
          </div>

          <hr className="border-neutral-200" />

          <div>
            <div className="text-xs text-neutral-600">Price:</div>
            <div className="text-price">
              <span className="text-sm align-top">$</span>
              <span className="text-3xl font-bold">{Math.floor(p.price)}</span>
              <span className="text-sm align-top">{(p.price % 1).toFixed(2).slice(1)}</span>
            </div>
            <div className="text-xs text-neutral-600 mt-1">FREE delivery on orders over $35</div>
          </div>

          <div className="text-sm text-neutral-800">{p.description}</div>

          {/* Buy box */}
          <div className="border border-neutral-200 rounded-md p-3 space-y-2 mt-2">
            {p.stock > 0 ? (
              <div className="text-lg font-semibold text-[#067D62]">In Stock</div>
            ) : (
              <div className="text-lg font-semibold text-[#B12704]">Out of Stock</div>
            )}
            <div className="flex items-center gap-2 text-xs text-neutral-700">
              <Truck size={14} /> Fast, free shipping
            </div>
            <div className="flex items-center gap-2 text-xs text-neutral-700">
              <ShieldCheck size={14} /> Secure transaction
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm">Qty:</span>
              <Select value={String(qty)} onValueChange={(v) => setQty(Number(v))}>
                <SelectTrigger data-testid="qty-select" className="w-20 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: Math.min(10, p.stock || 10) }).map((_, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>{i + 1}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <button
              onClick={handleAdd}
              data-testid="detail-add-btn"
              disabled={p.stock <= 0}
              className="w-full amazon-orange text-black font-semibold text-sm rounded-full py-2 hover:brightness-95 transition-colors disabled:opacity-50"
            >
              Add to Cart
            </button>
            <button
              onClick={handleBuy}
              data-testid="detail-buy-btn"
              disabled={p.stock <= 0}
              className="w-full text-black font-semibold text-sm rounded-full py-2 hover:brightness-95 transition-colors disabled:opacity-50"
              style={{ backgroundColor: "#F7CA00" }}
            >
              Buy Now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
