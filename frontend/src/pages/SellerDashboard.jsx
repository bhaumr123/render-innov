import React, { useEffect, useState } from "react";
import api, { BACKEND_URL } from "@/lib/api";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, ImagePlus, QrCode } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

// Uploaded files are returned as a relative "/uploads/.." path; resolve to
// an absolute URL against the API's own origin so <img> tags load correctly.
const resolveUrl = (path) => (path && path.startsWith("/") ? `${BACKEND_URL}${path}` : path);

const emptyForm = { title: "", image_url: "", qr_code_url: "" };

export default function SellerDashboard() {
  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [imagePreview, setImagePreview] = useState("");
  const [qrPreview, setQrPreview] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
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
      await api.post("/products", form);
      toast.success("Product listed");
      setForm(emptyForm);
      setImagePreview("");
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

          <div>
            <Label>Product picture</Label>
            <label
              htmlFor="seller-product-image"
              data-testid="seller-product-image-drop"
              className="mt-1 flex flex-col items-center justify-center gap-2 border border-dashed border-warm rounded-lg py-6 cursor-pointer hover:bg-parchment/50 transition-colors"
            >
              {imagePreview ? (
                <img src={imagePreview} alt="Product preview" className="h-28 w-28 object-cover rounded-md" />
              ) : (
                <ImagePlus size={28} className="text-muted-warm" />
              )}
              <span className="text-xs text-muted-warm">
                {uploadingImage ? "Uploading…" : imagePreview ? "Change picture" : "Click to upload a product picture"}
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
            disabled={saving || uploadingImage || uploadingQr}
            className="w-full bg-ink text-cream text-sm font-medium rounded-full py-2.5 hover:bg-terracotta transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Saving…" : "Add product"}
          </button>
        </form>

        <div className="bg-surface border border-warm rounded-lg p-5">
          <h2 className="font-heading text-lg font-semibold mb-3">Your products ({products.length})</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {products.map((p) => (
              <div key={p.id} data-testid={`seller-product-${p.id}`} className="border border-warm rounded-lg p-3 flex gap-3">
                <img
                  src={resolveUrl(p.image_url) || "https://placehold.co/80x80?text=No+image"}
                  alt={p.title}
                  className="w-16 h-16 object-cover rounded bg-parchment/40 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium line-clamp-1">{p.title}</div>
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
