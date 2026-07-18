import React, { useEffect, useState } from "react";
import { Star, ShieldCheck } from "lucide-react";
import api, { formatApiErrorDetail } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "react-router-dom";

function StarRow({ value, size = 14 }) {
  const full = Math.round(value);
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} size={size} className={i < full ? "fill-terracotta text-terracotta" : "text-warm"} style={i < full ? { color: "#DC7238", fill: "#DC7238" } : { color: "#D9D2C0" }} />
      ))}
    </div>
  );
}

function ReviewForm({ productId, onSubmitted }) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [title, setTitle] = useState("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (rating < 1) return toast.error("Please choose a star rating");
    if (!comment.trim()) return toast.error("Please write a short review");
    setSubmitting(true);
    try {
      await api.post(`/products/${productId}/reviews`, { rating, title: title.trim(), comment: comment.trim() });
      toast.success("Review posted · thank you!");
      setRating(0); setTitle(""); setComment("");
      onSubmitted?.();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Failed to post review");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="border border-warm rounded-lg p-4 bg-cream/50" data-testid="review-form">
      <div className="text-[11px] tracking-widest uppercase text-sage mb-2 flex items-center gap-1">
        <ShieldCheck size={12} /> Verified purchase · share your take
      </div>
      <div className="flex items-center gap-1 mb-3">
        {Array.from({ length: 5 }).map((_, i) => {
          const v = i + 1;
          const active = (hover || rating) >= v;
          return (
            <button
              type="button"
              key={v}
              data-testid={`review-star-${v}`}
              onMouseEnter={() => setHover(v)}
              onMouseLeave={() => setHover(0)}
              onClick={() => setRating(v)}
              aria-label={`${v} stars`}
              className="p-0.5"
            >
              <Star size={26} style={active ? { color: "#DC7238", fill: "#DC7238" } : { color: "#D9D2C0" }} />
            </button>
          );
        })}
        <span className="ml-2 text-xs text-muted-warm">{rating > 0 ? `${rating}/5` : "Tap a star"}</span>
      </div>
      <div className="mb-2">
        <Label htmlFor="rev-title">Headline (optional)</Label>
        <Input id="rev-title" data-testid="review-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Sums up your experience" />
      </div>
      <div>
        <Label htmlFor="rev-comment">Your review</Label>
        <Textarea id="rev-comment" data-testid="review-comment" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="What did you love? How did it arrive? How does it taste?" />
      </div>
      <button
        type="submit"
        disabled={submitting}
        data-testid="review-submit"
        className="mt-3 bg-ink text-cream text-sm font-medium rounded-full py-2 px-5 hover:bg-terracotta transition-colors disabled:opacity-50"
      >
        {submitting ? "Posting…" : "Post review"}
      </button>
    </form>
  );
}

export default function Reviews({ productId }) {
  const { user } = useAuth();
  const [reviews, setReviews] = useState([]);
  const [eligibility, setEligibility] = useState(null); // {purchased, already_reviewed, can_review}
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const r = await api.get(`/products/${productId}/reviews`);
    setReviews(r.data.reviews || []);
    if (user) {
      try {
        const e = await api.get(`/products/${productId}/reviews/eligibility`);
        setEligibility(e.data);
      } catch {
        setEligibility({ purchased: false, already_reviewed: false, can_review: false });
      }
    } else {
      setEligibility(null);
    }
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [productId, user]);

  const avg = reviews.length > 0
    ? reviews.reduce((s, r) => s + Number(r.rating), 0) / reviews.length
    : 0;

  return (
    <section className="mt-14 border-t border-warm pt-10" data-testid="product-reviews">
      <div className="text-[11px] tracking-[0.3em] uppercase text-sage mb-2">What our customers say</div>
      <div className="flex items-center gap-3">
        <h2 className="font-heading text-2xl md:text-3xl font-semibold">Customer reviews</h2>
        {reviews.length > 0 && (
          <div className="flex items-center gap-2 text-sm text-muted-warm">
            <StarRow value={avg} />
            <span>{avg.toFixed(1)} · {reviews.length} review{reviews.length !== 1 ? "s" : ""}</span>
          </div>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8">
        <div>
          {loading ? (
            <div className="text-muted-warm text-sm">Loading reviews…</div>
          ) : reviews.length === 0 ? (
            <div className="bg-surface border border-warm rounded-lg p-6 text-sm text-muted-warm">
              No reviews yet. Verified purchasers can be the first to review.
            </div>
          ) : (
            <ul className="space-y-4">
              {reviews.map((r) => (
                <li key={r.id} data-testid={`review-item-${r.id}`} className="bg-surface border border-warm rounded-lg p-5">
                  <div className="flex items-center gap-3">
                    <StarRow value={r.rating} size={16} />
                    <span className="text-xs text-muted-warm">by {r.user_name}</span>
                    <span className="text-xs text-sage inline-flex items-center gap-1"><ShieldCheck size={12} /> Verified purchase</span>
                    <span className="ml-auto text-xs text-muted-warm">{new Date(r.created_at).toLocaleDateString()}</span>
                  </div>
                  {r.title && <div className="font-heading font-semibold text-ink mt-2">{r.title}</div>}
                  <div className="text-sm text-muted-warm leading-relaxed mt-1 whitespace-pre-wrap">{r.comment}</div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <aside>
          {!user && (
            <div className="border border-warm rounded-lg p-4 bg-cream/50 text-sm">
              <div className="font-heading font-semibold mb-1">Have you bought this?</div>
              <p className="text-muted-warm text-xs">
                <Link to="/login" className="text-terracotta hover:underline">Sign in</Link> to leave a review — only verified purchasers can review.
              </p>
            </div>
          )}
          {user && eligibility?.can_review && (
            <ReviewForm productId={productId} onSubmitted={load} />
          )}
          {user && eligibility && !eligibility.purchased && (
            <div className="border border-warm rounded-lg p-4 bg-cream/50 text-sm">
              <div className="font-heading font-semibold mb-1">Verified reviews only</div>
              <p className="text-muted-warm text-xs">
                Reviews are open to customers who have purchased this product. Try it first — we think you'll want to write about it.
              </p>
            </div>
          )}
          {user && eligibility?.already_reviewed && (
            <div className="border border-warm rounded-lg p-4 bg-cream/50 text-sm">
              <div className="font-heading font-semibold mb-1">Thanks for your review</div>
              <p className="text-muted-warm text-xs">You've already shared your take on this product.</p>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
