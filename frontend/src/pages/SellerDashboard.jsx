import React, { useEffect, useState } from "react";
import api, { resolveUploadUrl } from "@/lib/api";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, ImagePlus, QrCode, Clock, CheckCircle2, XCircle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const emptyForm = { title: "", image_url: "", image_url_2: "", qr_code_url: "" };

const APPROVAL_BADGE = {
  pending: { label: "Pending review", icon: Clock, className: "text-amber-700 bg-amber-100 border-amber-200" },
  approved: { label: "Live", icon: CheckCircle2, className: "text-sage bg-sage/10 border-sage/30" },
  rejected: { label: "Rejected", icon: XCircle, className: "text-terracotta bg-terracotta/10 border-terracotta/30" },
};

function ApprovalBadge({ status }) {
  const cfg = APPROVAL_BADGE[status] || APPROVAL_BADGE.approved;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full border w-fit ${cfg.className}`}>
      <Icon size={11} /> {cfg.label}
    </span>
  );
}

export default function SellerDashboard() {
  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [imagePreview, setImagePreview] = useState("");
  const [image2Preview, setImage2Preview] = useState("");
  const [qrPreview, setQrPreview] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingImage2, setUploadingImage2] = useState(false);
  const [uploadingQr, setUploadingQr] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadProducts = () => api.get("/seller/products").then((r) => setProducts(r.data.items || []));

  useEffect(() => { loadProducts(); }, []);

  const uploadFile = async (file) => {
    const body = new FormData();
    body.append("file", file);
    const { data } = await api.post("/uploads", body);
    return data.url;
  };

  const onPickImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImagePreview(URL.createObjectURL(file));
    setUploadingImage(true);
    try {
      const url = await uploadFile(file);
      setForm((f) => ({ ...f, image_url: url }));
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not upload product picture");
      setImagePreview("");
    } finally {
      setUploadingImage(false);
    }
  };

  const onPickImage2 = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImage2Preview(URL.createObjectURL(file));
    setUploadingImage2(true);
    try {
      const url = await uploadFile(file);
      setForm((f) => ({ ...f, image_url_2: url }));
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not upload second picture");
      setImage2Preview("");
    } finally {
      setUploadingImage2(false);
    }
  };

  const onPickQr = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setQrPreview(URL.createObjectURL(file));
    setUploadingQr(true);
    try {
      const url = await uploadFile(file);
      setForm((f) => ({ ...f, qr_code_url: url }));
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not upload QR code");
      setQrPreview("");
    } finally {
      setUploadingQr(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      await api.post("/products", {
        title: form.title,
        image_url: form.image_url,
        qr_code_url: form.qr_code_url,
        images: form.image_url_2 ? [form.image_url_2] : [],
      });
      toast.success("Product submitted for admin approval");
      setForm(emptyForm);
      setImagePreview("");
      setImage2Preview("");
      setQrPreview("");
      loadProducts();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to save product");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this product?")) return;
    try {
      await api.delete(`/products/${id}`);
      toast.success("Deleted");
      loadProducts();
    } catch {
      toast.error("Failed to delete");
    }
  };

  return (
    <div className="max-w-screen-xl mx-auto px-4 md:px-6 py-8">
      <div className="mb-6">
        <div className="text-[11px] tracking-[0.3em] uppercase text-sage mb-1">Seller</div>
        <h1 className="font-heading text-3xl font-semibold">Your storefront</h1>
        <p className="text-sm text-muted-warm mt-1">Signed in as {user?.email}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-6">
        <form onSubmit={submit} className="bg-surface border border-warm rounded-lg p-5 space-y-4 h-fit" data-testid="seller-product-form">
          <h2 className="font-heading text-lg font-semibold">List a new product</h2>
          <p className="text-xs text-muted-warm -mt-2">
            New listings are reviewed by an admin before they appear in the shop.
          </p>

          <div>
            <Label htmlFor="seller-product-name">Product name</Label>
            <Input
              id="seller-product-name"
              data-testid="seller-product-name"
              placeholder="e.g. Himalayan Forest Honey"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Product picture 1</Label>
              <label
                htmlFor="seller-product-image"
                data-testid="seller-product-image-drop"
                className="mt-1 flex flex-col items-center justify-center gap-2 border border-dashed border-warm rounded-lg py-5 cursor-pointer hover:bg-parchment/50 transition-colors"
              >
                {imagePreview ? (
                  <img src={imagePreview} alt="Product preview" className="h-20 w-20 object-cover rounded-md" />
                ) : (
                  <ImagePlus size={24} className="text-muted-warm" />
                )}
                <span className="text-[11px] text-muted-warm text-center px-1">
                  {uploadingImage ? "Uploading…" : imagePreview ? "Change" : "Upload picture"}
                </span>
              </label>
              <input
                id="seller-product-image"
                data-testid="seller-product-image-input"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={onPickImage}
              />
            </div>

            <div>
              <Label>Product picture 2 <span className="text-muted-warm normal-case">(optional)</span></Label>
              <label
                htmlFor="seller-product-image-2"
                data-testid="seller-product-image2-drop"
                className="mt-1 flex flex-col items-center justify-center gap-2 border border-dashed border-warm rounded-lg py-5 cursor-pointer hover:bg-parchment/50 transition-colors"
              >
                {image2Preview ? (
                  <img src={image2Preview} alt="Second product preview" className="h-20 w-20 object-cover rounded-md" />
                ) : (
                  <ImagePlus size={24} className="text-muted-warm" />
                )}
                <span className="text-[11px] text-muted-warm text-center px-1">
                  {uploadingImage2 ? "Uploading…" : image2Preview ? "Change" : "Upload picture"}
                </span>
              </label>
              <input
                id="seller-product-image-2"
                data-testid="seller-product-image2-input"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={onPickImage2}
              />
            </div>
          </div>

          <div>
            <Label>Payment QR code</Label>
            <label
              htmlFor="seller-product-qr"
              data-testid="seller-product-qr-drop"
              className="mt-1 flex flex-col items-center justify-center gap-2 border border-dashed border-warm rounded-lg py-6 cursor-pointer hover:bg-parchment/50 transition-colors"
            >
              {qrPreview ? (
                <img src={qrPreview} alt="QR code preview" className="h-28 w-28 object-contain rounded-md bg-white" />
              ) : (
                <QrCode size={28} className="text-muted-warm" />
              )}
              <span className="text-xs text-muted-warm">
                {uploadingQr ? "Uploading…" : qrPreview ? "Change QR code" : "Click to upload your payment QR code"}
              </span>
            </label>
            <input
              id="seller-product-qr"
              data-testid="seller-product-qr-input"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={onPickQr}
            />
          </div>

          <button
            type="submit"
            data-testid="seller-product-save"
            disabled={saving || uploadingImage || uploadingImage2 || uploadingQr}
            className="w-full bg-ink text-cream text-sm font-medium rounded-full py-2.5 hover:bg-terracotta transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Saving…" : "Submit for approval"}
          </button>
        </form>

        <div className="bg-surface border border-warm rounded-lg p-5">
          <h2 className="font-heading text-lg font-semibold mb-3">Your products ({products.length})</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {products.map((p) => (
              <div key={p.id} data-testid={`seller-product-${p.id}`} className="border border-warm rounded-lg p-3 flex gap-3">
                <img
                  src={resolveUploadUrl(p.image_url) || "https://placehold.co/80x80?text=No+image"}
                  alt={p.title}
                  className="w-16 h-16 object-cover rounded bg-parchment/40 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium line-clamp-1">{p.title}</div>
                  <div className="mt-1">
                    <ApprovalBadge status={p.approval_status} />
                  </div>
                  {p.qr_code_url ? (
                    <div className="flex items-center gap-1.5 text-[11px] text-sage mt-1">
                      <QrCode size={12} /> QR code attached
                    </div>
                  ) : (
                    <div className="text-[11px] text-muted-warm mt-1">No QR code yet</div>
                  )}
                  <button
                    data-testid={`seller-product-del-${p.id}`}
                    onClick={() => remove(p.id)}
                    className="text-terracotta hover:text-ink inline-flex items-center gap-1 text-xs mt-2"
                  >
                    <Trash2 size={12} /> Delete
                  </button>
                </div>
              </div>
            ))}
            {products.length === 0 && (
              <div className="col-span-2 text-center text-muted-warm py-8">No products yet — add your first one.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
