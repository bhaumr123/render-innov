import React from "react";
import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="mt-16 border-t border-neutral-300">
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        data-testid="footer-back-to-top"
        className="w-full text-white text-sm py-3 hover:brightness-110 transition-colors"
        style={{ backgroundColor: "#37475A" }}
      >
        Back to top
      </button>
      <div className="navy text-white">
        <div className="max-w-screen-2xl mx-auto px-4 py-10 grid grid-cols-2 md:grid-cols-4 gap-8 text-sm">
          <div>
            <div className="font-semibold mb-3">Get to Know Us</div>
            <ul className="space-y-2 text-neutral-300">
              <li>About ShopKart</li>
              <li>Careers</li>
              <li>Press Releases</li>
              <li>ShopKart Science</li>
            </ul>
          </div>
          <div>
            <div className="font-semibold mb-3">Make Money with Us</div>
            <ul className="space-y-2 text-neutral-300">
              <li>Sell products on ShopKart</li>
              <li>Sell on ShopKart Business</li>
              <li>Become an Affiliate</li>
              <li>Advertise Your Products</li>
            </ul>
          </div>
          <div>
            <div className="font-semibold mb-3">Payment Products</div>
            <ul className="space-y-2 text-neutral-300">
              <li>ShopKart Business Card</li>
              <li>Shop with Points</li>
              <li>Reload Your Balance</li>
              <li>Currency Converter</li>
            </ul>
          </div>
          <div>
            <div className="font-semibold mb-3">Let Us Help You</div>
            <ul className="space-y-2 text-neutral-300">
              <li><Link to="/orders" className="hover:underline">Your Orders</Link></li>
              <li>Shipping Rates & Policies</li>
              <li>Returns & Replacements</li>
              <li>Help Center</li>
            </ul>
          </div>
        </div>
      </div>
      <div className="navy-2 text-neutral-400 text-xs text-center py-6">
        © {new Date().getFullYear()} ShopKart, Inc. or its affiliates
      </div>
    </footer>
  );
}
