import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import api, { resolveUploadUrl } from "@/lib/api";
import { toast } from "sonner";
import { Leaf, Package, ShieldCheck, ChevronLeft, Star, MapPin } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { useAuth } from "@/context/AuthContext";
import Reviews from "@/components/Reviews";
import SellerQrCard from "@/components/SellerQrCard";

export default function ProductDetail() {
  const { id } = useParams();
  const [p, setP] = useState(null);
  const [qty, setQty] = useState(1);
  const [selectedVariant, setSelectedVariant] = useState("");
  const [activePhoto, setActivePhoto] = useState(0);
  const [regionalOptions, setRegionalOptions] = useState([]);
  const { addToCart } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    api.get(`/products/${id}`).then((r) => {
      setP(r.data);
      setActivePhoto(0);
      const variants = r.data.size_variants || [];
      if (variants.length > 0) setSelectedVariant(variants[0].label);
    }).catch(() => setP(false));
    setRegionalOptions([]);
    // Same product name, sold out of different states — offer state as a
    // pickable option (e.g. two sellers both list "Honey", one from Kerala,
    // one from Rajasthan) instead of only ever showing whichever one the
    // buyer happened to land on.
    api.get(`/products/${id}/regional-options`).then((r) => setRegionalOptions(r.data.items || [])).catch(() => setRegionalOptions([]));
  }, [id]);

  const photos = useMemo(() => {
    if (!p) return [];
    return [p.image_url, ...(p.images || [])].filter(Boolean);
  }, [p]);

  const variantPrice = useMemo(() => {
    if (!p) return 0;
    const v = (p.size_variants || []).find((x) => x.label === selectedVariant);
    return v ? Number(v.price) : Number(p.price);
  }, [p, selectedVariant]);

  const variantStock = useMemo(() => {
    if (!p) return 0;
    const v = (p.size_variants || []).find((x) => x.label === selectedVariant);
    return v ? Number(v.stock ?? p.stock) : Number(p.stock);
  }, [p, selectedVariant]);

  if (p === null) return <div className="max-w-screen-xl mx-auto p-6 text-muted-warm">Loading…</div>;
  if (p === false) return <div className="max-w-screen-xl mx-auto p-6">Product not found.</div>;

  const hasVariants = (p.size_variants || []).length > 0;

  const handleAdd = async () => {
    if (hasVariants && !selectedVariant) {
      toast.error("Please select a size");
      return;
    }
    await addToCart(p.id, qty, selectedVariant || "");
    toast.success(`Added ${qty} × ${p.title}${selectedVariant ? ` (${selectedVariant})` : ""}`);
  };

  const handleBuy = async () => {
    if (hasVariants && !selectedVariant) return toast.error("Please select a size");
    await addToCart(p.id, qty, selectedVariant || "");
    navigate(user ? "/checkout" : "/guest-checkout");
  };

  return (
    <div className="max-w-screen-xl mx-auto px-4 md:px-6 py-6">
      <Link to="/products" className="inline-flex items-center gap-1 text-sm text-muted-warm hover:text-ink mb-4 transition-colors">
        <ChevronLeft size={16} /> Back to shop
      </Link>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
        <div>
          <div className="bg-surface border border-warm rounded-lg p-6 flex items-center justify-center aspect-square">
            <img src={resolveUploadUrl(photos[activePhoto] || p.image_url)} alt={p.title} className="max-w-full max-h-full object-contain" />
          </div>
          {photos.length > 1 && (
            <div className="flex gap-2 mt-3" data-testid="product-photo-thumbs">
              {photos.map((photo, i) => (
                <button
                  key={photo + i}
                  type="button"
                  onClick={() => setActivePhoto(i)}
                  data-testid={`product-photo-thumb-${i}`}
                  className={`w-16 h-16 rounded-md border p-1 bg-surface transition-colors ${
                    activePhoto === i ? "border-ink" : "border-warm hover:border-ink/50"
                  }`}
                >
                  <img src={resolveUploadUrl(photo)} alt={`${p.title} view ${i + 1}`} className="w-full h-full object-contain" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="text-[11px] tracking-[0.3em] uppercase text-sage mb-2">{p.category}</div>
          <h1 className="font-heading text-3xl md:text-4xl font-semibold text-ink leading-tight">
            {p.title}
          </h1>
          {p.brand && <div className="text-sm text-muted-warm mt-1">by {p.brand}</div>}

          <div className="mt-5 flex items-baseline gap-2">
            <span className="font-heading text-3xl font-semibold text-ink">₹{variantPrice.toFixed(2)}</span>
            {selectedVariant && <span className="text-sm text-muted-warm">/ {selectedVariant}</span>}
          </div>

          <p className="text-sm text-muted-warm leading-relaxed mt-5 max-w-md">
            {p.description}
          </p>

          {regionalOptions.length > 1 && (
            <div className="mt-6" data-testid="product-state-options">
              <div className="text-xs uppercase tracking-widest text-muted-warm mb-2 flex items-center gap-1.5">
                <MapPin size={13} className="text-sage" /> Available from
              </div>
              <div className="flex flex-wrap gap-2">
                {regionalOptions.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    data-testid={`product-state-option-${opt.state}`}
                    onClick={() => opt.id !== p.id && navigate(`/product/${opt.id}`)}
                    className={`px-4 py-2 rounded-full text-sm border transition-colors ${
                      opt.id === p.id
                        ? "bg-ink text-cream border-ink"
                        : "bg-surface border-warm text-ink hover:border-ink"
                    }`}
                  >
                    {opt.state || "Other"} · ₹{Number(opt.price).toFixed(2)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {hasVariants && (
            <div className="mt-6">
              <div className="text-xs uppercase tracking-widest text-muted-warm mb-2">Choose a size</div>
              <div className="flex flex-wrap gap-2">
                {(p.size_variants || []).map((v) => (
                  <button
                    key={v.label}
                    data-testid={`variant-${v.label}`}
                    onClick={() => setSelectedVariant(v.label)}
                    className={`px-4 py-2 rounded-full text-sm border transition-colors ${
                      selectedVariant === v.label
                        ? "bg-ink text-cream border-ink"
                        : "bg-surface border-warm text-ink hover:border-ink"
                    }`}
                  >
                    {v.label} · ₹{Number(v.price).toFixed(2)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 flex items-center gap-3">
            <div className="text-xs uppercase tracking-widest text-muted-warm">Qty</div>
            <div className="inline-flex items-center border border-warm rounded-full bg-surface">
              <button
                onClick={() => setQty(Math.max(1, qty - 1))}
                data-testid="qty-dec"
                className="w-9 h-9 rounded-l-full hover:bg-parchment transition-colors"
              >−</button>
              <span className="w-8 text-center text-sm" data-testid="qty-value">{qty}</span>
              <button
                onClick={() => setQty(qty + 1)}
                data-testid="qty-inc"
                className="w-9 h-9 rounded-r-full hover:bg-parchment transition-colors"
              >+</button>
            </div>
          </div>

          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleAdd}
              data-testid="detail-add-btn"
              disabled={variantStock <= 0}
              className="flex-1 bg-ink text-cream text-sm font-medium rounded-full py-3.5 px-6 hover:bg-terracotta transition-colors disabled:opacity-50"
            >
              Add to cart
            </button>
            <button
              onClick={handleBuy}
              data-testid="detail-buy-btn"
              disabled={variantStock <= 0}
              className="flex-1 border border-ink text-ink text-sm font-medium rounded-full py-3.5 px-6 hover:bg-ink hover:text-cream transition-colors disabled:opacity-50"
            >
              Buy now
            </button>
          </div>

          {p.qr_code_url && (
            <div className="mt-6">
              <SellerQrCard
                qrUrl={p.qr_code_url}
                title="Pay this seller directly via UPI"
                subtitle={`Scan to pay for ${p.title}`}
                testId="product-seller-qr"
              />
            </div>
          )}

          <div className="mt-8 border-t border-warm pt-6 space-y-2 text-sm text-muted-warm">
            <div className="flex items-center gap-2"><Package size={14} className="text-sage" /> Flat ₹6.99 shipping · free above ₹75</div>
            <div className="flex items-center gap-2"><Leaf size={14} className="text-sage" /> Ethically sourced · small-batch</div>
            <div className="flex items-center gap-2"><ShieldCheck size={14} className="text-sage" /> 14-day easy returns</div>
          </div>
        </div>
      </div>

      <Reviews productId={p.id} />
    </div>
  );
}
