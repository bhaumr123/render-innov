import React from "react";
import { AlertTriangle } from "lucide-react";

/**
 * Shown when checkout is blocked because one or more cart items are no
 * longer available in the requested quantity (409 from the checkout API).
 * Lets the buyer fix it inline — reduce to what's actually left, or remove
 * the item — instead of just failing with a generic error.
 */
export default function StockConflictNotice({ conflicts, onAdjust, onRemove, testIdPrefix = "stock-conflict" }) {
  if (!conflicts?.length) return null;
  return (
    <div className="border border-terracotta/40 bg-terracotta/5 rounded-lg p-4 space-y-3" data-testid={`${testIdPrefix}-panel`}>
      <div className="flex items-center gap-2 text-terracotta font-heading font-semibold text-sm">
        <AlertTriangle size={16} />
        Some items in your cart aren't available like that anymore
      </div>
      <ul className="space-y-2">
        {conflicts.map((c) => {
          const key = `${c.product_id}::${c.variant_label || ""}`;
          return (
            <li key={key} className="text-sm flex items-center justify-between gap-3 bg-surface border border-warm rounded-md px-3 py-2">
              <div className="min-w-0">
                <div className="font-medium line-clamp-1">
                  {c.title || "This item"}{c.variant_label && ` · ${c.variant_label}`}
                </div>
                <div className="text-xs text-muted-warm" data-testid={`${testIdPrefix}-reason-${c.product_id}`}>
                  {c.available > 0
                    ? `Only ${c.available} left — you asked for ${c.requested}.`
                    : "Now out of stock."}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {c.available > 0 && (
                  <button
                    type="button"
                    onClick={() => onAdjust(c)}
                    data-testid={`${testIdPrefix}-adjust-${c.product_id}`}
                    className="text-xs bg-ink text-cream rounded-full px-3 py-1.5 hover:bg-terracotta transition-colors whitespace-nowrap"
                  >
                    Reduce to {c.available}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onRemove(c)}
                  data-testid={`${testIdPrefix}-remove-${c.product_id}`}
                  className="text-xs text-muted-warm hover:text-terracotta underline whitespace-nowrap"
                >
                  Remove
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
