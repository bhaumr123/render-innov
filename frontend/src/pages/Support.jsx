import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Clock, MessageSquareText, CheckCircle2, XCircle, Loader2 } from "lucide-react";

const emptyForm = { subject: "", message: "", order_id: "", product_id: "" };

const STATUS_BADGE = {
  open: { label: "Open", icon: Clock, className: "text-amber-700 bg-amber-100 border-amber-200" },
  in_progress: { label: "In progress", icon: Loader2, className: "text-blue-700 bg-blue-100 border-blue-200" },
  resolved: { label: "Resolved", icon: CheckCircle2, className: "text-sage bg-sage/10 border-sage/30" },
  closed: { label: "Closed", icon: XCircle, className: "text-muted-warm bg-warm/40 border-warm" },
};

function StatusBadge({ status }) {
  const cfg = STATUS_BADGE[status] || STATUS_BADGE.open;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full border w-fit ${cfg.className}`}>
      <Icon size={11} /> {cfg.label}
    </span>
  );
}

export default function Support() {
  const { user } = useAuth();
  const isSeller = user?.role === "seller" || user?.role === "admin";
  const [form, setForm] = useState(emptyForm);
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [complaints, setComplaints] = useState(null);
  const [saving, setSaving] = useState(false);

  const loadMine = () => api.get("/complaints/mine").then((r) => setComplaints(r.data.items || []));

  useEffect(() => {
    loadMine();
    if (isSeller) {
      api.get("/seller/products").then((r) => setProducts(r.data.items || [])).catch(() => {});
    } else {
      api.get("/orders").then((r) => setOrders(r.data.orders || [])).catch(() => {});
    }
  }, [isSeller]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.subject.trim() || !form.message.trim()) return;
    setSaving(true);
    try {
      await api.post("/complaints", {
        subject: form.subject,
        message: form.message,
        order_id: form.order_id || null,
        product_id: form.product_id || null,
      });
      toast.success("Your issue has been submitted");
      setForm(emptyForm);
      loadMine();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not submit your issue");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-screen-xl mx-auto px-4 md:px-6 py-8">
      <div className="mb-6">
        <div className="text-[11px] tracking-[0.3em] uppercase text-sage mb-1">Support</div>
        <h1 className="font-heading text-3xl font-semibold">Help & issues</h1>
        <p className="text-sm text-muted-warm mt-1">Raise a complaint or report a problem — our team reviews every submission.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-6">
        <form onSubmit={submit} className="bg-surface border border-warm rounded-lg p-5 space-y-4 h-fit" data-testid="support-form">
          <h2 className="font-heading text-lg font-semibold">Raise an issue</h2>

          <div>
            <Label htmlFor="support-subject">Subject</Label>
            <Input
              id="support-subject"
              data-testid="support-subject"
              placeholder="e.g. Order arrived damaged"
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              required
            />
          </div>

          {!isSeller && orders.length > 0 && (
            <div>
              <Label>Related order <span className="text-muted-warm normal-case">(optional)</span></Label>
              <Select value={form.order_id || "none"} onValueChange={(v) => setForm({ ...form, order_id: v === "none" ? "" : v })}>
                <SelectTrigger data-testid="support-order-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {orders.map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.order_number}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {isSeller && products.length > 0 && (
            <div>
              <Label>Related product <span className="text-muted-warm normal-case">(optional)</span></Label>
              <Select value={form.product_id || "none"} onValueChange={(v) => setForm({ ...form, product_id: v === "none" ? "" : v })}>
                <SelectTrigger data-testid="support-product-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label htmlFor="support-message">Message</Label>
            <Textarea
              id="support-message"
              data-testid="support-message"
              rows={5}
              placeholder="Tell us what happened…"
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              required
            />
          </div>

          <button
            type="submit"
            data-testid="support-submit"
            disabled={saving}
            className="w-full bg-ink text-cream text-sm font-medium rounded-full py-2.5 hover:bg-terracotta transition-colors disabled:opacity-50"
          >
            {saving ? "Submitting…" : "Submit issue"}
          </button>
        </form>

        <div className="bg-surface border border-warm rounded-lg p-5">
          <h2 className="font-heading text-lg font-semibold mb-3">Your issues ({complaints?.length ?? 0})</h2>
          {complaints === null ? (
            <div className="text-muted-warm text-sm">Loading…</div>
          ) : complaints.length === 0 ? (
            <div className="text-center text-muted-warm py-8 flex flex-col items-center gap-2">
              <MessageSquareText size={20} />
              No issues raised yet.
            </div>
          ) : (
            <ul className="space-y-3">
              {complaints.map((c) => (
                <li key={c.id} data-testid={`support-issue-${c.id}`} className="border border-warm rounded-lg p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">{c.subject}</div>
                      <div className="text-[11px] text-muted-warm mt-0.5">
                        {new Date(c.created_at).toLocaleString()}
                      </div>
                    </div>
                    <StatusBadge status={c.status} />
                  </div>
                  <p className="text-sm text-muted-warm mt-2 whitespace-pre-wrap">{c.message}</p>
                  {c.admin_response && (
                    <div className="mt-3 bg-parchment/40 border border-warm rounded-md p-3 text-sm">
                      <div className="text-[10px] uppercase tracking-widest text-sage mb-1">Response from IWI</div>
                      {c.admin_response}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
