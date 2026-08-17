import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { LOGO } from "@/lib/assets";
import { Leaf } from "lucide-react";

export default function Footer() {
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    api.get("/products/categories").then((r) => setCategories(r.data.categories || []));
  }, []);

  return (
    <footer className="mt-20 bg-ink text-cream">
      <div className="max-w-screen-xl mx-auto px-6 py-12 grid grid-cols-1 md:grid-cols-4 gap-8">
        <div className="md:col-span-2">
          <div className="flex items-center gap-3 mb-3">
            <img src={LOGO} alt="IWI" className="h-10 w-10 rounded-full bg-white object-cover" />
            <div>
              <div className="font-heading text-xl">Innovation Window India</div>
              <div className="text-[10px] tracking-[0.25em] uppercase text-sage">Nourish Naturally</div>
            </div>
          </div>
          <p className="text-sm text-cream/70 leading-relaxed max-w-md">
            A curated wellness apothecary — small-batch teas, single-origin spices and artisanal goods
            sourced ethically across India. Made for people who care about what they consume.
          </p>
          <div className="flex items-center gap-2 mt-4 text-xs text-sage">
            <Leaf size={14} /> Ethically sourced · Small batch · Naturally made
          </div>
        </div>

        <div>
          <div className="font-heading text-sm uppercase tracking-widest mb-3 text-cream/60">Shop</div>
          <ul className="space-y-2 text-sm">
            {categories.map((c) => (
              <li key={c}>
                <Link to={`/products?category=${encodeURIComponent(c)}`} className="hover:text-terracotta transition-colors">{c}</Link>
              </li>
            ))}
            <li><Link to="/products" className="hover:text-terracotta transition-colors">All products</Link></li>
          </ul>
        </div>

        <div>
          <div className="font-heading text-sm uppercase tracking-widest mb-3 text-cream/60">Help</div>
          <ul className="space-y-2 text-sm">
            <li><Link to="/track" className="hover:text-terracotta transition-colors" data-testid="footer-track-order">Track order</Link></li>
            <li>Shipping & returns</li>
            <li>Contact</li>
            <li>FAQ</li>
          </ul>
        </div>
      </div>

      <div className="border-t border-cream/10 text-cream/50 text-xs">
        <div className="max-w-screen-xl mx-auto px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-2">
          <div>© {new Date().getFullYear()} Innovation Window India. All rights reserved.</div>
          <div className="flex gap-4">
            <span>Privacy</span>
            <span>Terms</span>
            <span>Made in India</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
