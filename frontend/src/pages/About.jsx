import React from "react";
import { Link } from "react-router-dom";
import { Leaf, Sprout, Package, Compass } from "lucide-react";
import {
  LOGO, CAT_HERBAL_TEA, CAT_GROCERY, CAT_ARTISANAL_GOODS, CAT_SUPER_FOODS, CAT_SPIRITUAL, CAT_MEDICINAL_ROOTS,
} from "@/lib/assets";

export default function About() {
  return (
    <div className="max-w-screen-lg mx-auto px-4 md:px-6 py-12">
      <div className="text-[11px] tracking-[0.3em] uppercase text-sage mb-2">Our story</div>
      <h1 className="font-heading text-4xl md:text-5xl font-semibold leading-tight">
        A small window<br />
        into <em className="not-italic text-terracotta">India's wellness traditions.</em>
      </h1>

      <div className="mt-10 grid grid-cols-1 md:grid-cols-[1fr_320px] gap-10">
        <div className="space-y-5 text-base text-ink leading-relaxed">
          <p>
            <span className="font-heading text-2xl">Innovation Window India</span> started with a simple
            question — what if the cup of tea, the pinch of spice, or the drop of oil that our grandmothers
            reached for could reach the world, unchanged?
          </p>
          <p>
            We work directly with farmers in Rajasthan for our chillies, with beekeepers in the Himalayan
            foothills for our raw honey, and with families in Bengal who have been rolling teas by hand for
            three generations. Nothing on our shelf is anonymous.
          </p>
          <p>
            Every jar carries a season, a place, and a name. That's the promise.
          </p>
        </div>

        <aside className="bg-surface border border-warm rounded-lg p-5">
          <img src={LOGO} alt="IWI" className="h-14 w-14 rounded-full bg-white object-cover border border-warm" />
          <div className="mt-3 text-[11px] tracking-[0.25em] uppercase text-sage">Nourish Naturally</div>
          <div className="mt-1 font-heading text-lg font-semibold">Innovation Window India</div>
          <div className="text-xs text-muted-warm mt-1">Est. Wellness · India · Since day one.</div>
        </aside>
      </div>

      <section className="mt-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
          {[
            { icon: Leaf, title: "Ethically sourced", body: "Direct trade with farmers, no middlemen." },
            { icon: Sprout, title: "Small-batch", body: "Never over-produced. Nothing sits on shelves." },
            { icon: Package, title: "Ships in 48h", body: "Free shipping on orders over ₹75." },
            { icon: Compass, title: "Rooted in India", body: "From Kashmir to Kanyakumari." },
          ].map((v) => (
            <div key={v.title} className="bg-surface border border-warm rounded-lg p-5">
              <v.icon size={20} className="text-terracotta" />
              <div className="font-heading font-semibold mt-2">{v.title}</div>
              <div className="text-xs text-muted-warm mt-1">{v.body}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-16 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
        {[
          { img: CAT_HERBAL_TEA, name: "Herbal Tea", copy: "Butterfly pea, marigold petals, more." },
          { img: CAT_GROCERY, name: "Grocery", copy: "Spice powders, cold-pressed oils, ghee & honey." },
          { img: CAT_ARTISANAL_GOODS, name: "Artisanal Goods", copy: "Handmade plates, jute bags & crafted goods." },
          { img: CAT_SUPER_FOODS, name: "Super Foods", copy: "Bee pollen & nutrient-dense wellness foods." },
          { img: CAT_SPIRITUAL, name: "Spiritual", copy: "Incense, dhoop & temple flowers." },
          { img: CAT_MEDICINAL_ROOTS, name: "Medicinal Roots", copy: "Roots & churna used in traditional wellness." },
        ].map((c) => (
          <Link
            key={c.name}
            to={`/products?category=${encodeURIComponent(c.name)}`}
            className="group bg-surface border border-warm rounded-lg overflow-hidden"
          >
            <div className="aspect-[4/3] overflow-hidden">
              <img src={c.img} alt={c.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
            </div>
            <div className="p-4">
              <div className="font-heading text-lg font-semibold">{c.name}</div>
              <div className="text-xs text-muted-warm mt-1">{c.copy}</div>
              <div className="text-xs text-terracotta mt-2 uppercase tracking-widest">Shop →</div>
            </div>
          </Link>
        ))}
      </section>
    </div>
  );
}
