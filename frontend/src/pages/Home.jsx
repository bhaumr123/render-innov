import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import ProductCard from "@/components/ProductCard";

const CATEGORY_TILES = [
  { name: "Electronics", img: "https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA4Mzl8MHwxfHNlYXJjaHwyfHx3aXJlbGVzcyUyMGhlYWRwaG9uZXMlMjBwcm9kdWN0fGVufDB8fHx8MTc4NDM4NDI5Mnww&ixlib=rb-4.1.0&q=85" },
  { name: "Smart Home", img: "https://images.unsplash.com/photo-1519558260268-cde7e03a0152?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2OTF8MHwxfHNlYXJjaHwzfHxzbWFydCUyMGhvbWUlMjBkZXZpY2UlMjBwcm9kdWN0fGVufDB8fHx8MTc4NDM4NDI5Mnww&ixlib=rb-4.1.0&q=85" },
  { name: "Fashion", img: "https://images.pexels.com/photos/6214155/pexels-photo-6214155.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940" },
  { name: "Books", img: "https://images.pexels.com/photos/3081173/pexels-photo-3081173.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940" },
];

export default function Home() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/products?limit=20&sort=rating").then((r) => {
      setProducts(r.data.items || []);
      setLoading(false);
    });
  }, []);

  return (
    <div className="pb-8">
      {/* Hero banner */}
      <div className="relative h-64 md:h-96 overflow-hidden bg-gradient-to-b from-transparent to-[#F3F3F3]">
        <img
          src="https://images.pexels.com/photos/6956903/pexels-photo-6956903.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"
          className="w-full h-full object-cover"
          alt="Deals"
        />
        <div className="absolute inset-0 flex items-end">
          <div className="max-w-screen-2xl w-full mx-auto px-4 pb-6 md:pb-10">
            <div className="bg-white/95 backdrop-blur px-5 py-4 md:px-8 md:py-6 rounded-md max-w-md">
              <div className="text-xs font-semibold uppercase tracking-wider text-[#B12704]">Big deals</div>
              <h1 className="font-heading text-2xl md:text-3xl font-bold text-neutral-900 mt-1">
                Everything you need, one click away
              </h1>
              <p className="text-sm text-neutral-700 mt-2">Fast shipping on millions of items.</p>
              <Link
                to="/products"
                data-testid="hero-shop-btn"
                className="inline-block mt-4 amazon-orange text-black font-semibold text-sm rounded-full px-5 py-2 hover:brightness-95 transition-colors"
              >
                Shop all deals
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto px-4 md:px-6 -mt-10 md:-mt-16 relative">
        {/* Category tiles bento */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {CATEGORY_TILES.map((c) => (
            <Link
              to={`/products?category=${encodeURIComponent(c.name)}`}
              key={c.name}
              data-testid={`home-cat-${c.name}`}
              className="bg-white p-4 border border-neutral-200 rounded-md hover:shadow-sm transition-shadow group"
            >
              <div className="font-heading font-semibold text-lg mb-2">{c.name}</div>
              <div className="aspect-[4/3] overflow-hidden rounded-sm">
                <img src={c.img} alt={c.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
              </div>
              <div className="link-blue text-xs mt-2 group-hover:underline">Shop now →</div>
            </Link>
          ))}
        </div>

        {/* Featured products */}
        <section className="mt-10">
          <div className="flex items-end justify-between mb-4">
            <h2 className="font-heading text-xl md:text-2xl font-semibold">Top rated products</h2>
            <Link to="/products?sort=rating" data-testid="home-see-all" className="link-blue text-sm hover:underline">
              See all →
            </Link>
          </div>
          {loading ? (
            <div className="text-neutral-500 text-sm">Loading products…</div>
          ) : products.length === 0 ? (
            <div className="bg-white border border-neutral-200 rounded-md p-8 text-center">
              <div className="font-heading text-lg font-semibold">No products yet</div>
              <p className="text-sm text-neutral-600 mt-1">
                An admin can add products from the admin panel to get started.
              </p>
              <Link to="/login" className="link-blue text-sm hover:underline mt-3 inline-block">
                Admin sign in →
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {products.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
