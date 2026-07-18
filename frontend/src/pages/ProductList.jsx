import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import ProductCard from "@/components/ProductCard";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";

export default function ProductList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get("q") || "";
  const category = searchParams.get("category") || "";
  const sort = searchParams.get("sort") || "";

  const [priceRange, setPriceRange] = useState([0, 500]);
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/products/categories").then((r) => setCategories(r.data.categories || []));
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (category) params.set("category", category);
    if (sort) params.set("sort", sort);
    params.set("min_price", priceRange[0]);
    params.set("max_price", priceRange[1]);
    params.set("limit", "60");
    api.get(`/products?${params.toString()}`).then((r) => {
      setItems(r.data.items || []);
      setTotal(r.data.total || 0);
      setLoading(false);
    });
  }, [q, category, sort, priceRange]);

  const setParam = (k, v) => {
    const p = new URLSearchParams(searchParams);
    if (v === "" || v == null) p.delete(k);
    else p.set(k, v);
    setSearchParams(p);
  };

  return (
    <div className="max-w-screen-xl mx-auto px-4 md:px-6 py-8">
      {/* Header row */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 mb-6">
        <div>
          <div className="text-[11px] tracking-[0.3em] uppercase text-sage mb-1">
            {q ? `Search · "${q}"` : category || "The shelf"}
          </div>
          <h1 className="font-heading text-3xl md:text-4xl font-semibold">
            {category || (q ? `Results` : "Shop all")}
          </h1>
          <div className="text-sm text-muted-warm mt-1">{items.length} of {total} pieces</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-widest text-muted-warm">Sort</span>
          <Select value={sort || "featured"} onValueChange={(v) => setParam("sort", v === "featured" ? "" : v)}>
            <SelectTrigger data-testid="sort-select" className="w-[200px] h-9 bg-surface text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="featured">Featured</SelectItem>
              <SelectItem value="price_asc">Price · low to high</SelectItem>
              <SelectItem value="price_desc">Price · high to low</SelectItem>
              <SelectItem value="rating">Most loved</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-8">
        <aside className="bg-surface border border-warm rounded-lg p-5 h-fit">
          <div>
            <div className="font-heading font-semibold text-sm uppercase tracking-widest text-muted-warm mb-3">Category</div>
            <ul className="space-y-1.5 text-sm">
              <li>
                <button
                  data-testid="filter-cat-all"
                  onClick={() => setParam("category", "")}
                  className={`text-left w-full py-1 ${!category ? "text-terracotta font-semibold" : "text-ink hover:text-terracotta transition-colors"}`}
                >
                  All categories
                </button>
              </li>
              {categories.map((c) => (
                <li key={c}>
                  <button
                    data-testid={`filter-cat-${c}`}
                    onClick={() => setParam("category", c)}
                    className={`text-left w-full py-1 ${category === c ? "text-terracotta font-semibold" : "text-ink hover:text-terracotta transition-colors"}`}
                  >
                    {c}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-8">
            <div className="font-heading font-semibold text-sm uppercase tracking-widest text-muted-warm mb-3">Price</div>
            <Slider
              data-testid="filter-price-slider"
              value={priceRange}
              min={0}
              max={500}
              step={5}
              onValueChange={setPriceRange}
              className="mt-3"
            />
            <div className="text-xs text-muted-warm mt-3 flex justify-between">
              <span>₹{priceRange[0]}</span>
              <span>₹{priceRange[1]}</span>
            </div>
          </div>
        </aside>

        <div>
          {loading ? (
            <div className="text-muted-warm text-sm">Loading…</div>
          ) : items.length === 0 ? (
            <div className="bg-surface border border-warm rounded-lg p-10 text-center text-muted-warm">
              No products match your filters.
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-5">
              {items.map((p) => <ProductCard key={p.id} product={p} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
