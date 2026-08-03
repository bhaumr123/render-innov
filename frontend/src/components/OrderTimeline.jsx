import React from "react";
import { CheckCircle2, Package, Truck, Home, Clock, XCircle } from "lucide-react";

// Canonical happy-path flow rendered as a timeline. `payment_failed` and
// `cancelled` are surfaced as extra history events but do not create a step.
const STEPS = [
  { key: "confirmed",  label: "Confirmed",  Icon: CheckCircle2 },
  { key: "processing", label: "Processing", Icon: Package },
  { key: "shipped",    label: "Shipped",    Icon: Truck },
  { key: "delivered",  label: "Delivered",  Icon: Home },
];

function stepIndex(status) {
  const i = STEPS.findIndex((s) => s.key === status);
  return i === -1 ? -1 : i;
}

function fmt(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString(undefined, {
      day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function OrderTimeline({ order }) {
  if (!order) return null;
  const history = Array.isArray(order.status_history) ? order.status_history : [];
  const current = order.status || "confirmed";
  const currentIdx = stepIndex(current);
  const failed = current === "payment_failed" || current === "cancelled";

  // Map each canonical step to its first matching history event so we can
  // show a real timestamp beside completed stages.
  const historyByStatus = history.reduce((acc, ev) => {
    if (!acc[ev.status]) acc[ev.status] = ev;
    return acc;
  }, {});

  return (
    <div data-testid="order-timeline" className="border border-warm rounded-lg bg-surface p-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="text-[11px] tracking-[0.3em] uppercase text-sage">Order status</div>
          <div className="font-heading text-xl font-semibold text-ink capitalize" data-testid="order-current-status">
            {current.replace("_", " ")}
          </div>
        </div>
        {order.tracking_number && (
          <div className="text-right">
            <div className="text-[11px] tracking-widest uppercase text-muted-warm">Tracking</div>
            <div className="font-mono text-sm text-ink" data-testid="order-tracking-number">
              {order.tracking_number}
            </div>
            {order.carrier && <div className="text-xs text-muted-warm">via {order.carrier}</div>}
          </div>
        )}
      </div>

      {failed ? (
        <div className="flex items-start gap-3 border border-terracotta/30 bg-terracotta/5 rounded-md p-4">
          <XCircle className="text-terracotta shrink-0 mt-0.5" size={20} />
          <div className="text-sm">
            <div className="font-medium text-terracotta capitalize">{current.replace("_", " ")}</div>
            <div className="text-muted-warm mt-0.5">
              {history[history.length - 1]?.note || "This order did not complete."}
            </div>
          </div>
        </div>
      ) : (
        <ol className="relative">
          {STEPS.map((step, idx) => {
            const done = currentIdx >= idx;
            const active = currentIdx === idx;
            const ev = historyByStatus[step.key];
            const Icon = step.Icon;
            return (
              <li key={step.key} className="flex gap-4 pb-6 last:pb-0 relative">
                {idx < STEPS.length - 1 && (
                  <span
                    className={`absolute left-[15px] top-8 w-px h-full ${done ? "bg-sage" : "bg-warm"}`}
                    aria-hidden
                  />
                )}
                <div
                  className={`shrink-0 w-8 h-8 rounded-full border flex items-center justify-center transition-colors ${
                    done
                      ? "bg-sage/15 border-sage text-sage"
                      : "bg-parchment/40 border-warm text-muted-warm"
                  } ${active ? "ring-2 ring-sage/30" : ""}`}
                  data-testid={`timeline-step-${step.key}`}
                  data-active={active ? "true" : "false"}
                  data-done={done ? "true" : "false"}
                >
                  <Icon size={16} />
                </div>
                <div className="pt-0.5">
                  <div className={`text-sm font-medium ${done ? "text-ink" : "text-muted-warm"}`}>
                    {step.label}
                  </div>
                  <div className="text-xs text-muted-warm flex items-center gap-1 mt-0.5">
                    {ev ? (
                      <>
                        <Clock size={11} /> {fmt(ev.at)}
                        {ev.note && <span className="mx-1">·</span>}
                        {ev.note && <span className="italic">{ev.note}</span>}
                      </>
                    ) : done ? (
                      <span>Completed</span>
                    ) : (
                      <span>Pending</span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
