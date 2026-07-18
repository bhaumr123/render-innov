import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import ProductCard from "@/components/ProductCard";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Star } from "lucide-react";

export default function ProductList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get("q") || "";
  const category = searchParams.get("category") || "";
  const sort = searchParams.get("sort") || "";

  const [priceRange, setPriceRange] = useState([0, 2000]);
  const [minRating, setMinRating] = useState(0);
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
      let list = r.data.items || [];
      if (minRating > 0) list = list.filter((p) => p.rating >= minRating);
      setItems(list);
      setTotal(r.data.total || 0);
      setLoading(false);
    });
  }, [q, category, sort, priceRange, minRating]);

  const setParam = (k, v) => {
    const p = new URLSearchParams(searchParams);
    if (v === "" || v == null) p.delete(k);
    else p.set(k, v);
    setSearchParams(p);
  };

  return (
    <div className="max-w-screen-2xl mx-auto px-3 md:px-4 py-4">
      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-4">
        {/* Sidebar filters */}
        <aside className="bg-white border border-neutral-200 rounded-md p-4 h-fit">
          <div>
            <div className="font-heading font-semibold text-sm mb-2">Category</div>
            <ul className="space-y-1 text-sm">
              <li>
                <button
                  data-testid="filter-cat-all"
                  onClick={() => setParam("category", "")}
                  className={`text-left w-full ${!category ? "font-bold" : "link-blue hover:underline"}`}
                >
                  All categories
                </button>
              </li>
              {categories.map((c) => (
                <li key={c}>
                  <button
                    data-testid={`filter-cat-${c}`}
                    onClick={() => setParam("category", c)}
                    className={`text-left w-full ${category === c ? "font-bold" : "link-blue hover:underline"}`}
                  >
                    {c}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-6">
            <div className="font-heading font-semibold text-sm mb-2">Price</div>
            <Slider
              data-testid="filter-price-slider"
              value={priceRange}
              min={0}
              max={2000}
              step={10}
              onValueChange={setPriceRange}
              className="mt-3"
            />
            <div className="text-xs text-neutral-600 mt-2 flex justify-between">
              <span>${priceRange[0]}</span>
              <span>${priceRange[1]}</span>
            </div>
          </div>

          <div className="mt-6">
            <div className="font-heading font-semibold text-sm mb-2">Customer rating</div>
            {[4, 3, 2, 1, 0].map((r) => (
              <label key={r} className="flex items-center gap-2 text-sm py-1 cursor-pointer">
                <Checkbox
                  data-testid={`filter-rating-${r}`}
                  checked={minRating === r}
                  onCheckedChange={() => setMinRating(minRating === r ? 0 : r)}
                />
                <span className="flex items-center gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} size={14} className={i < r ? "fill-yellow-400 text-yellow-400" : "text-neutral-300"} />
                  ))}
                  <span className="ml-1 text-neutral-700">{r === 0 ? "Any" : `& up`}</span>
                </span>
              </label>
            ))}
          </div>
        </aside>

        {/* Product grid */}
        <div>
          <div className="bg-white border border-neutral-200 rounded-md px-4 py-3 flex items-center justify-between mb-4">
            <div className="text-sm">
              <span className="text-neutral-600">
                {q ? `Results for "${q}"` : category ? category : "All products"}
              </span>
              <span className="ml-2 text-neutral-500">({items.length} of {total})</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-neutral-600">Sort by</span>
              <Select value={sort || "featured"} onValueChange={(v) => setParam("sort", v === "featured" ? "" : v)}>
                <SelectTrigger data-testid="sort-select" className="w-[180px] h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="featured">Featured</SelectItem>
                  <SelectItem value="price_asc">Price: Low to High</SelectItem>
                  <SelectItem value="price_desc">Price: High to Low</SelectItem>
                  <SelectItem value="rating">Avg. Customer Review</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {loading ? (
            <div className="text-neutral-500 text-sm">Loading…</div>
          ) : items.length === 0 ? (
            <div className="bg-white border border-neutral-200 rounded-md p-8 text-center text-neutral-600">
              No products match your filters.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {items.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
