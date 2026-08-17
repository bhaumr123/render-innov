import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import ProductCard from "@/components/ProductCard";
import Testimonials from "@/components/Testimonials";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
  CAT_HERBAL_TEA, CAT_GROCERY, CAT_ARTISANAL_GOODS, CAT_SUPER_FOODS, CAT_SPIRITUAL, CAT_MEDICINAL_ROOTS, LOGO,
} from "@/lib/assets";
import { Leaf, Sprout, Package, MapPin } from "lucide-react";

const CATEGORY_TILES = [
  { name: "Herbal Tea", img: CAT_HERBAL_TEA, blurb: "Small-batch, hand-picked, brewed for calm." },
  { name: "Grocery", img: CAT_GROCERY, blurb: "Spice powders, cold-pressed oils, ghee & honey." },
  { name: "Artisanal Goods", img: CAT_ARTISANAL_GOODS, blurb: "Handmade plates, jute bags & crafted goods." },
  { name: "Super Foods", img: CAT_SUPER_FOODS, blurb: "Bee pollen & nutrient-dense wellness foods." },
  { name: "Spiritual", img: CAT_SPIRITUAL, blurb: "Incense, dhoop & temple flowers." },
  { name: "Medicinal Roots", img: CAT_MEDICINAL_ROOTS, blurb: "Roots & churna used in traditional wellness." },
];

export default function Home() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [states, setStates] = useState([]);
  const [state, setState] = useState("");

  useEffect(() => {
    api.get("/products/states").then((r) => setStates(r.data.with_products || []));
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "12", sort: "rating" });
    if (state) params.set("state", state);
    api.get(`/products?${params.toString()}`).then((r) => {
      setProducts(r.data.items || []);
      setLoading(false);
    });
  }, [state]);

  return (
    <div className="pb-16">
      {/* Editorial hero */}
      <section className="bg-cream border-b border-warm">
        <div className="max-w-screen-xl mx-auto px-6 py-14 md:py-24 grid grid-cols-1 md:grid-cols-[1.1fr_0.9fr] gap-10 items-center">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-sage mb-4">
              <Leaf size={14} /> Est. Wellness · India
            </div>
            <h1 className="font-heading text-5xl md:text-6xl font-semibold text-ink leading-[1.05]">
              Rituals of<br />
              <em className="not-italic text-terracotta">nourishment.</em>
            </h1>
            <p className="text-base md:text-lg text-muted-warm mt-6 max-w-lg leading-relaxed">
              Innovation Window India curates single-origin teas, spices and small-batch artisanal goods —
              gathered from farmers, forests and healers across the subcontinent.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/products"
                data-testid="hero-shop-btn"
                className="inline-flex items-center gap-2 bg-ink text-cream text-sm px-6 py-3 rounded-full hover:bg-terracotta transition-colors"
              >
                Shop the apothecary →
              </Link>
              <Link
                to="/products?category=Herbal%20Tea"
                data-testid="hero-tea-btn"
                className="inline-flex items-center gap-2 border border-ink text-ink text-sm px-6 py-3 rounded-full hover:bg-ink hover:text-cream transition-colors"
              >
                Explore teas
              </Link>
            </div>
            <div className="mt-10 flex items-center gap-6 text-xs text-muted-warm">
              <div className="flex items-center gap-2"><Sprout size={16} className="text-sage" /> Ethically sourced</div>
              <div className="flex items-center gap-2"><Package size={16} className="text-sage" /> Free shipping over ₹75</div>
            </div>
          </div>

          <div className="relative">
            <div className="aspect-[4/5] bg-parchment rounded-xl overflow-hidden border border-warm">
              <img
                src={CAT_ARTISANAL_GOODS}
                alt="Artisanal goods"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="absolute -bottom-4 -left-4 bg-surface border border-warm rounded-lg p-3 shadow-sm flex items-center gap-3">
              <img src={LOGO} alt="IWI" className="h-10 w-10 rounded-full object-cover bg-white" />
              <div className="text-xs leading-tight">
                <div className="font-heading font-semibold text-ink">Since day one</div>
                <div className="text-muted-warm">Nourish Naturally.</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="max-w-screen-xl mx-auto px-6 mt-14">
        <div className="flex items-end justify-between mb-6">
          <div>
            <div className="text-[11px] tracking-[0.3em] uppercase text-sage mb-1">The collection</div>
            <h2 className="font-heading text-3xl md:text-4xl font-semibold">Ways to nourish</h2>
          </div>
          <Link to="/products" className="text-sm text-ink hover:text-terracotta transition-colors border-b border-ink/30 hover:border-terracotta pb-0.5">
            Browse all →
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
          {CATEGORY_TILES.map((c) => (
            <Link
              to={`/products?category=${encodeURIComponent(c.name)}`}
              key={c.name}
              data-testid={`home-cat-${c.name}`}
              className="group relative bg-surface border border-warm rounded-lg overflow-hidden"
            >
              <div className="aspect-[4/5] overflow-hidden bg-parchment/50">
                <img src={c.img} alt={c.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
              </div>
              <div className="p-5">
                <div className="font-heading text-2xl font-semibold text-ink">{c.name}</div>
                <div className="text-sm text-muted-warm mt-1">{c.blurb}</div>
                <div className="mt-3 text-xs uppercase tracking-widest text-terracotta group-hover:text-ink transition-colors">
                  Shop {c.name.toLowerCase()} →
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Featured products */}
      <section className="max-w-screen-xl mx-auto px-6 mt-16">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 mb-6">
          <div>
            <div className="text-[11px] tracking-[0.3em] uppercase text-sage mb-1">On the shelves</div>
            <h2 className="font-heading text-3xl md:text-4xl font-semibold">Featured picks</h2>
          </div>
          <div className="flex items-center gap-3">
            {states.length > 0 && (
              <div className="flex items-center gap-2">
                <MapPin size={14} className="text-muted-warm" />
                <Select value={state || "all"} onValueChange={(v) => setState(v === "all" ? "" : v)}>
                  <SelectTrigger data-testid="home-state-select" className="w-[190px] h-9 bg-surface text-sm">
                    <SelectValue placeholder="All states" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All states</SelectItem>
                    {states.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Link
              to={state ? `/products?sort=rating&state=${encodeURIComponent(state)}` : "/products?sort=rating"}
              data-testid="home-see-all"
              className="text-sm text-ink hover:text-terracotta transition-colors border-b border-ink/30 hover:border-terracotta pb-0.5 whitespace-nowrap"
            >
              See all →
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="text-muted-warm text-sm">Steeping the shelf…</div>
        ) : products.length === 0 ? (
          <div className="bg-surface border border-warm rounded-lg p-10 text-center">
            <div className="font-heading text-2xl font-semibold">
              {state ? `No products from ${state} yet.` : "The apothecary is being stocked."}
            </div>
            <p className="text-sm text-muted-warm mt-2">
              {state ? "Try another state, or browse the full shelf." : "Sign in as admin to seed the demo catalog from the admin panel."}
            </p>
            <Link to="/login" className="mt-4 inline-block text-terracotta hover:underline text-sm">
              Admin sign in →
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {products.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        )}
      </section>

      {/* Story strip */}
      <section className="max-w-screen-xl mx-auto px-6 mt-20">
        <div className="bg-ink text-cream rounded-2xl px-8 py-14 md:px-14 md:py-20 relative overflow-hidden">
          <div className="max-w-2xl">
            <div className="text-[11px] tracking-[0.3em] uppercase text-sage mb-3">Our promise</div>
            <h3 className="font-heading text-3xl md:text-4xl leading-tight">
              Every jar carries a name — the farm, the family, the season.
            </h3>
            <p className="text-cream/70 mt-4 text-sm md:text-base leading-relaxed">
              We work with growers who still remember the difference between a good harvest and a rushed one.
              You'll taste the difference in every cup, spoon and drop.
            </p>
            <Link to="/products" className="mt-6 inline-block bg-terracotta text-white text-sm px-6 py-3 rounded-full hover:brightness-95 transition-colors">
              Explore the collection
            </Link>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <Testimonials />
    </div>
  );
}
