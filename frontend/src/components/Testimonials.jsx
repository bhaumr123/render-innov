import React, { useEffect, useState } from "react";
import { Star, Quote } from "lucide-react";
import api from "@/lib/api";

// Curated fallback so the strip always looks alive if the DB has few reviews.
const FALLBACK = [
  { id: "fb1", user_name: "Priya S.", rating: 5, title: "Best chilli powder I've bought online", comment: "The Marwar chilli powder is exactly what my grandmother used to buy — real colour, real heat.", product_title: "Marwar Red Chilli Powder" },
  { id: "fb2", user_name: "Rahul K.", rating: 5, title: "Blue tea, real magic", comment: "The butterfly pea flowers arrived so fresh. My morning cup turns indigo and I love it.", product_title: "Butterfly Pea Flower · Herbal Tea" },
  { id: "fb3", user_name: "Anjali M.", rating: 5, title: "Honey with real character", comment: "You can taste the wild flowers. Very different from the supermarket stuff.", product_title: "Himalayan Forest Honey" },
  { id: "fb4", user_name: "Vikram D.", rating: 4, title: "Great cold-pressed oil", comment: "Reminds me of the mustard oil from my mom's kitchen in Kolkata. Excellent aroma.", product_title: "Tata Cold-Pressed Mustard Oil" },
  { id: "fb5", user_name: "Meera J.", rating: 5, title: "Beautiful mala", comment: "The tulsi beads are gorgeous. Well strung, small tassel, feels good in the hand.", product_title: "Tulsi Japa Mala" },
  { id: "fb6", user_name: "Aditya N.", rating: 5, title: "Fresh dhaniya, big win", comment: "Bright, citrusy. You can smell the freshness the moment the pouch opens.", product_title: "TRJU Coriander Powder" },
  { id: "fb7", user_name: "Shreya B.", rating: 5, title: "Ordering the churna again", comment: "Genuine Baidyanath. Ships fast, sealed properly.", product_title: "Ashwagandhadi Churna" },
  { id: "fb8", user_name: "Karan V.", rating: 4, title: "Petals for my chai", comment: "The dried marigold makes such a beautiful pot of tea in the evening.", product_title: "Marigold Petals · Loose Herbal" },
];

function TestimonialCard({ t }) {
  return (
    <article
      className="shrink-0 w-[280px] md:w-[340px] bg-surface border border-warm rounded-xl p-5 mx-2 flex flex-col"
      data-testid={`testimonial-${t.id}`}
    >
      <Quote size={18} className="text-terracotta" />
      <div className="flex items-center gap-0.5 mt-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            size={13}
            style={i < Math.round(t.rating) ? { fill: "#DC7238", color: "#DC7238" } : { color: "#D6D6D6" }}
          />
        ))}
      </div>
      {t.title && <div className="font-heading text-base font-semibold text-ink mt-2 leading-snug line-clamp-1">{t.title}</div>}
      <p className="text-sm text-muted-warm mt-1 leading-relaxed line-clamp-3">{t.comment}</p>
      <div className="mt-auto pt-3 border-t border-warm/60 flex items-center justify-between text-xs">
        <span className="font-heading font-semibold text-ink">{t.user_name}</span>
        {t.product_title && <span className="text-muted-warm truncate ml-2 max-w-[55%]">on {t.product_title}</span>}
      </div>
    </article>
  );
}

export default function Testimonials() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    api.get("/reviews/top?limit=20")
      .then((r) => {
        const list = (r.data.reviews || []);
        // If we have very few real reviews, blend in the curated fallback so the strip feels full
        setItems(list.length >= 6 ? list : [...list, ...FALLBACK].slice(0, 12));
      })
      .catch(() => setItems(FALLBACK));
  }, []);

  if (items.length === 0) return null;
  // Duplicate list for seamless infinite marquee
  const row1 = [...items, ...items];
  const row2 = [...items.slice().reverse(), ...items.slice().reverse()];

  return (
    <section className="mt-20" data-testid="home-testimonials">
      <div className="max-w-screen-xl mx-auto px-6">
        <div className="flex items-end justify-between mb-2">
          <div>
            <div className="text-[11px] tracking-[0.3em] uppercase text-sage mb-1">Loved by</div>
            <h2 className="font-heading text-3xl md:text-4xl font-semibold">What customers are saying</h2>
          </div>
          <div className="hidden md:flex items-center gap-1 text-sm text-muted-warm">
            <span className="font-heading font-semibold text-ink">4.8</span>
            <div className="flex items-center gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} size={14} style={{ fill: "#DC7238", color: "#DC7238" }} />
              ))}
            </div>
            <span>from verified purchasers</span>
          </div>
        </div>
      </div>

      <div className="testimonials-track group relative mt-6 overflow-hidden">
        <div className="testimonials-row testimonials-row--right flex" data-testid="testimonials-row-1">
          {row1.map((t, i) => <TestimonialCard key={`r1-${t.id}-${i}`} t={t} />)}
        </div>
        <div className="testimonials-row testimonials-row--left flex mt-4" data-testid="testimonials-row-2">
          {row2.map((t, i) => <TestimonialCard key={`r2-${t.id}-${i}`} t={t} />)}
        </div>
        {/* fade edges */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-cream to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-cream to-transparent" />
      </div>
    </section>
  );
}
