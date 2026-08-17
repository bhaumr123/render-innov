import React, { useEffect, useState } from "react";
import api, { resolveUploadUrl } from "@/lib/api";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
  Trash2, Pencil, Plus, X, IndianRupee, ShoppingBag, Store, PackageCheck,
  AlertCircle, MessageSquareText,
} from "lucide-react";
import {
  IMG_BLUE_TEA, IMG_DHANIYA, IMG_CHILLI, IMG_OIL, IMG_BEADS,
  IMG_ASHWAGANDHA, IMG_HONEY, IMG_LOOSE_TEA,
} from "@/lib/assets";

// Fallback shown before /products/categories responds; the live list (server's
// canonical taxonomy plus any legacy category strings) replaces this on load.
const FALLBACK_CATEGORIES = ["Herbal Tea", "Grocery", "Super Foods", "Artisanal Goods", "Spiritual", "Medicinal Roots"];

const emptyForm = {
  title: "", description: "", price: "", category: "Herbal Tea",
  stock: 100, image_url: "", brand: "IWI", rating: 4.9, reviews_count: 0,
  size_variants: [], gst_rate: "5",
};

export default function Admin() {
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [stats, setStats] = useState(null);
  const [sellerStats, setSellerStats] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [categories, setCategories] = useState(FALLBACK_CATEGORIES);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [couponForm, setCouponForm] = useState({ code: "", discount_type: "percent", value: "", min_subtotal: 0, max_uses: 0, active: true });

  const loadProducts = () => api.get("/products?limit=200").then((r) => setProducts(r.data.items || []));
  const loadOrders = () => api.get("/admin/orders").then((r) => setOrders(r.data.orders || []));
  const loadCoupons = () => api.get("/admin/coupons").then((r) => setCoupons(r.data.coupons || []));
  const loadStats = () => api.get("/admin/stats").then((r) => setStats(r.data));
  const loadSellerStats = () => api.get("/admin/stats/sellers").then((r) => setSellerStats(r.data.items || []));
  const loadComplaints = () => api.get("/admin/complaints").then((r) => setComplaints(r.data.items || []));
  const loadCategories = () => api.get("/products/categories").then((r) => setCategories(r.data.categories?.length ? r.data.categories : FALLBACK_CATEGORIES));

  useEffect(() => { loadProducts(); loadOrders(); loadCoupons(); loadStats(); loadSellerStats(); loadComplaints(); loadCategories(); }, []);

  const submitCoupon = async (e) => {
    e.preventDefault();
    const body = {
      code: couponForm.code.trim().toUpperCase(),
      discount_type: couponForm.discount_type,
      value: parseFloat(couponForm.value),
      min_subtotal: parseFloat(couponForm.min_subtotal || 0),
      max_uses: parseInt(couponForm.max_uses || 0),
      active: !!couponForm.active,
    };
    try {
      await api.post("/admin/coupons", body);
      toast.success(`Coupon ${body.code} created`);
      setCouponForm({ code: "", discount_type: "percent", value: "", min_subtotal: 0, max_uses: 0, active: true });
      loadCoupons();
    } catch (e) {
      toast.error("Could not create coupon");
    }
  };

  const removeCoupon = async (id) => {
    if (!window.confirm("Delete this coupon?")) return;
    await api.delete(`/admin/coupons/${id}`);
    toast.success("Deleted");
    loadCoupons();
  };

  const submit = async (e) => {
    e.preventDefault();
    const body = {
      ...form,
      price: parseFloat(form.price),
      stock: parseInt(form.stock),
      gst_rate: parseFloat(form.gst_rate || 5),
      rating: parseFloat(form.rating || 4.9),
      reviews_count: parseInt(form.reviews_count || 0),
      size_variants: form.size_variants.map((v) => ({
        label: v.label,
        price: parseFloat(v.price),
        stock: parseInt(v.stock || 0),
      })).filter((v) => v.label && !isNaN(v.price)),
    };
    try {
      if (editingId) {
        await api.put(`/products/${editingId}`, body);
        toast.success("Product updated");
      } else {
        await api.post("/products", body);
        toast.success("Product created");
      }
      setForm(emptyForm);
      setEditingId(null);
      loadProducts();
    } catch {
      toast.error("Failed to save");
    }
  };

  const edit = (p) => {
    setEditingId(p.id);
    setForm({
      title: p.title, description: p.description || "", price: p.price,
      category: p.category, stock: p.stock, image_url: p.image_url || "",
      brand: p.brand || "IWI", rating: p.rating || 4.9, reviews_count: p.reviews_count || 0,
      size_variants: p.size_variants || [], gst_rate: String(p.gst_rate || 5),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this product?")) return;
    await api.delete(`/products/${id}`);
    toast.success("Deleted");
    loadProducts();
  };

  const setApproval = async (id, approval_status) => {
    try {
      await api.patch(`/products/${id}/approval`, { approval_status });
      toast.success(approval_status === "approved" ? "Product approved · now live" : "Product rejected");
      loadProducts();
      loadStats();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to update approval status");
    }
  };

  const addVariantRow = () => setForm({ ...form, size_variants: [...form.size_variants, { label: "", price: "", stock: 100 }] });
  const removeVariantRow = (idx) => setForm({ ...form, size_variants: form.size_variants.filter((_, i) => i !== idx) });
  const setVariantField = (idx, k, v) => {
    const copy = [...form.size_variants];
    copy[idx] = { ...copy[idx], [k]: v };
    setForm({ ...form, size_variants: copy });
  };

  const seedDemo = async () => {
    const demo = [
      // ---------- Herbal Tea ----------
      {
        title: "Butterfly Pea Flower · Herbal Tea",
        brand: "Blue Tea Co.", category: "Herbal Tea", gst_rate: 5,
        description: "Caffeine-free herbal infusion made from 100 hand-picked butterfly pea blossoms. A striking indigo brew.",
        price: 199, stock: 60, rating: 4.8, reviews_count: 214, image_url: IMG_BLUE_TEA,
        size_variants: [
          { label: "25g · 20 bags", price: 199, stock: 60 },
          { label: "50g · 40 bags", price: 349, stock: 40 },
          { label: "100g · 80 bags", price: 599, stock: 25 },
        ],
      },
      {
        title: "Marigold Petals · Loose Herbal",
        brand: "IWI Apothecary", category: "Herbal Tea", gst_rate: 5,
        description: "Sun-dried marigold petals. Steep for a soothing, honey-toned brew or blend into your own infusions.",
        price: 249, stock: 40, rating: 4.7, reviews_count: 89, image_url: IMG_LOOSE_TEA,
        size_variants: [
          { label: "30g pouch", price: 249, stock: 40 },
          { label: "80g jar", price: 549, stock: 20 },
        ],
      },
      // ---------- Grocery ----------
      {
        title: "TRJU Coriander (Dhaniya) Powder",
        brand: "TRJU", category: "Grocery", gst_rate: 5,
        description: "Freshly stone-ground coriander seeds. Bright, citrus-forward, essential in every Indian kitchen.",
        price: 79, stock: 120, rating: 4.6, reviews_count: 421, image_url: IMG_DHANIYA,
        size_variants: [
          { label: "100g", price: 79, stock: 120 },
          { label: "250g", price: 179, stock: 80 },
          { label: "500g", price: 329, stock: 40 },
        ],
      },
      {
        title: "Marwar Red Chilli Powder",
        brand: "Marwar", category: "Grocery", gst_rate: 5,
        description: "Sun-dried Rajasthani chillies, stone-ground. Vivid red colour with a warm, lingering heat.",
        price: 149, stock: 80, rating: 4.7, reviews_count: 312, image_url: IMG_CHILLI,
        size_variants: [
          { label: "100g", price: 149, stock: 80 },
          { label: "250g", price: 349, stock: 60 },
          { label: "500g", price: 649, stock: 30 },
        ],
      },
      {
        title: "Sun-Dried Turmeric (Haldi) Powder",
        brand: "TRJU", category: "Grocery", gst_rate: 5,
        description: "Sun-dried, stone-ground turmeric root. High curcumin, deep golden colour, no additives.",
        price: 99, stock: 100, rating: 4.7, reviews_count: 156, image_url: IMG_DHANIYA,
        size_variants: [
          { label: "100g", price: 99, stock: 100 },
          { label: "250g", price: 219, stock: 60 },
          { label: "500g", price: 399, stock: 30 },
        ],
      },
      {
        title: "Stone-Ground Cumin (Jeera) Powder",
        brand: "Marwar", category: "Grocery", gst_rate: 5,
        description: "Roasted and stone-ground cumin seeds. Warm, earthy aroma — a staple tempering spice.",
        price: 109, stock: 100, rating: 4.6, reviews_count: 132, image_url: IMG_CHILLI,
        size_variants: [
          { label: "100g", price: 109, stock: 100 },
          { label: "250g", price: 249, stock: 50 },
        ],
      },
      {
        title: "Tata Cold-Pressed Mustard Oil",
        brand: "Tata Simply Better", category: "Grocery", gst_rate: 5,
        description: "Kachi ghani cold-pressed mustard oil. Full aroma, unrefined, made in small batches.",
        price: 399, stock: 50, rating: 4.6, reviews_count: 178, image_url: IMG_OIL,
        size_variants: [
          { label: "500 ml", price: 399, stock: 50 },
          { label: "1 L", price: 749, stock: 30 },
        ],
      },
      {
        title: "Pure Desi Cow Ghee",
        brand: "Honey Veda", category: "Grocery", gst_rate: 5,
        description: "Slow-simmered, bilona-method desi cow ghee. Rich, grainy texture and a deep nutty aroma.",
        price: 449, stock: 45, rating: 4.8, reviews_count: 201, image_url: IMG_OIL,
        size_variants: [
          { label: "250 ml", price: 449, stock: 45 },
          { label: "500 ml", price: 849, stock: 25 },
        ],
      },
      {
        title: "Himalayan Forest Honey · Raw & Unfiltered",
        brand: "Honey Veda", category: "Grocery", gst_rate: 5,
        description: "Wild, raw, unfiltered honey collected from Himalayan forests. Rich amber, floral, mineral.",
        price: 549, stock: 40, rating: 4.9, reviews_count: 401, image_url: IMG_HONEY,
        size_variants: [
          { label: "250g", price: 549, stock: 40 },
          { label: "500g", price: 999, stock: 25 },
        ],
      },
      // ---------- Artisanal Goods ----------
      {
        title: "Hand-Painted Terracotta Plate",
        brand: "IWI Artisans", category: "Artisanal Goods", gst_rate: 18,
        description: "Hand-thrown and hand-painted terracotta plate, glazed and fired by potters in rural Rajasthan.",
        price: 449, stock: 30, rating: 4.8, reviews_count: 41, image_url: IMG_BEADS,
        size_variants: [
          { label: "8 inch", price: 449, stock: 30 },
          { label: "10 inch", price: 599, stock: 20 },
        ],
      },
      {
        title: "Woven Jute Tote Bag",
        brand: "IWI Artisans", category: "Artisanal Goods", gst_rate: 18,
        description: "Hand-woven jute tote, natural fibre, stitched by a women's weaving collective.",
        price: 349, stock: 50, rating: 4.7, reviews_count: 63, image_url: IMG_BEADS,
        size_variants: [
          { label: "Medium", price: 349, stock: 50 },
          { label: "Large", price: 449, stock: 30 },
        ],
      },
      // ---------- Super Foods ----------
      {
        title: "Raw Himalayan Bee Pollen",
        brand: "Honey Veda", category: "Super Foods", gst_rate: 18,
        description: "Nutrient-dense bee pollen granules, hand-collected from Himalayan foothill apiaries.",
        price: 399, stock: 35, rating: 4.7, reviews_count: 58, image_url: IMG_HONEY,
        size_variants: [
          { label: "100g", price: 399, stock: 35 },
          { label: "200g", price: 749, stock: 20 },
        ],
      },
      // ---------- Spiritual ----------
      {
        title: "Tulsi Japa Mala · 108 Prayer Beads",
        brand: "IWI Apothecary", category: "Spiritual", gst_rate: 5,
        description: "Hand-strung 108-bead Tulsi mala for meditation and mindful practice. Small red cotton tassel.",
        price: 799, stock: 25, rating: 5.0, reviews_count: 68, image_url: IMG_BEADS,
        size_variants: [
          { label: "6mm beads", price: 799, stock: 25 },
          { label: "8mm beads", price: 999, stock: 15 },
        ],
      },
      {
        title: "Sandalwood Incense Sticks",
        brand: "IWI Apothecary", category: "Spiritual", gst_rate: 5,
        description: "Hand-rolled sandalwood agarbatti, slow-burning with a warm, woody fragrance.",
        price: 129, stock: 90, rating: 4.7, reviews_count: 149, image_url: IMG_ASHWAGANDHA,
        size_variants: [
          { label: "Pack of 20", price: 129, stock: 90 },
          { label: "Pack of 50", price: 279, stock: 50 },
        ],
      },
      {
        title: "Temple Dhoop Cones",
        brand: "IWI Apothecary", category: "Spiritual", gst_rate: 5,
        description: "Hand-pressed dhoop cones made from natural resins and herbs, for daily puja.",
        price: 149, stock: 80, rating: 4.6, reviews_count: 92, image_url: IMG_LOOSE_TEA,
        size_variants: [
          { label: "Pack of 12", price: 149, stock: 80 },
        ],
      },
      {
        title: "Dried Temple Flowers · Marigold Garland",
        brand: "IWI Apothecary", category: "Spiritual", gst_rate: 5,
        description: "Sun-dried marigold garlands for puja and temple offerings, sourced fresh and air-dried.",
        price: 89, stock: 100, rating: 4.5, reviews_count: 37, image_url: IMG_BLUE_TEA,
        size_variants: [
          { label: "Single garland", price: 89, stock: 100 },
        ],
      },
      // ---------- Medicinal Roots ----------
      {
        title: "Ashwagandhadi Churna · Ayurvedic Tonic",
        brand: "Baidyanath", category: "Medicinal Roots", gst_rate: 18,
        description: "Classical Ayurvedic churna ground from Ashwagandha root. Traditionally used for calm and vitality.",
        price: 189, stock: 60, rating: 4.8, reviews_count: 245, image_url: IMG_ASHWAGANDHA,
        size_variants: [
          { label: "60g", price: 189, stock: 60 },
          { label: "120g", price: 349, stock: 30 },
        ],
      },
      {
        title: "Wild Shatavari Root Powder",
        brand: "Baidyanath", category: "Medicinal Roots", gst_rate: 18,
        description: "Sun-dried and stone-ground Shatavari root, a classical Ayurvedic root used for restorative wellness.",
        price: 219, stock: 45, rating: 4.6, reviews_count: 77, image_url: IMG_ASHWAGANDHA,
        size_variants: [
          { label: "50g", price: 219, stock: 45 },
          { label: "100g", price: 399, stock: 25 },
        ],
      },
    ];
    for (const d of demo) {
      try { await api.post("/products", d); } catch {}
    }
    toast.success("Demo catalog added");
    loadProducts();
  };

  return (
    <div className="max-w-screen-xl mx-auto px-4 md:px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="text-[11px] tracking-[0.3em] uppercase text-sage mb-1">Admin</div>
          <h1 className="font-heading text-3xl font-semibold">Manage the apothecary</h1>
        </div>
        <button
          onClick={seedDemo}
          data-testid="admin-seed-btn"
          className="text-sm border border-ink text-ink rounded-full px-5 py-2 hover:bg-ink hover:text-cream transition-colors"
        >
          + Seed 8 demo products
        </button>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview" data-testid="admin-tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="products" data-testid="admin-tab-products">Products</TabsTrigger>
          <TabsTrigger value="orders" data-testid="admin-tab-orders">Orders</TabsTrigger>
          <TabsTrigger value="sellers" data-testid="admin-tab-sellers">Sellers</TabsTrigger>
          <TabsTrigger value="coupons" data-testid="admin-tab-coupons">Coupons</TabsTrigger>
          <TabsTrigger value="complaints" data-testid="admin-tab-complaints">
            Complaints{stats?.open_complaints > 0 && ` (${stats.open_complaints})`}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <SalesOverview stats={stats} />
        </TabsContent>

        <TabsContent value="products" className="mt-6 grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-6">
          <form onSubmit={submit} className="bg-surface border border-warm rounded-lg p-5 space-y-3 h-fit" data-testid="admin-product-form">
            <h2 className="font-heading text-lg font-semibold">{editingId ? "Edit product" : "New product"}</h2>
            <div>
              <Label>Title</Label>
              <Input data-testid="admin-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </div>
            <div>
              <Label>Brand</Label>
              <Input data-testid="admin-brand" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
            </div>
            <div>
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger data-testid="admin-category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Base price (₹)</Label>
                <Input data-testid="admin-price" type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />
                <div className="text-[10px] text-muted-warm mt-1">Used when no size variants are defined.</div>
              </div>
              <div>
                <Label>Base stock</Label>
                <Input data-testid="admin-stock" type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>GST rate</Label>
              <Select value={form.gst_rate} onValueChange={(v) => setForm({ ...form, gst_rate: v })}>
                <SelectTrigger data-testid="admin-gst-rate"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5%</SelectItem>
                  <SelectItem value="18">18%</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Image URL</Label>
              <Input data-testid="admin-image-url" value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea data-testid="admin-desc" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>

            <div className="border-t border-warm pt-3">
              <div className="flex items-center justify-between mb-2">
                <Label>Size variants (optional)</Label>
                <button type="button" onClick={addVariantRow} data-testid="admin-variant-add" className="text-xs text-terracotta hover:underline flex items-center gap-1">
                  <Plus size={12} /> Add size
                </button>
              </div>
              {form.size_variants.length === 0 && (
                <div className="text-[11px] text-muted-warm">No variants — base price will apply.</div>
              )}
              {form.size_variants.map((v, i) => (
                <div key={i} className="grid grid-cols-[1fr_90px_80px_28px] gap-2 mb-2 items-center">
                  <Input data-testid={`admin-variant-label-${i}`} placeholder="e.g. 50g / M" value={v.label} onChange={(e) => setVariantField(i, "label", e.target.value)} />
                  <Input data-testid={`admin-variant-price-${i}`} placeholder="₹ Price" type="number" step="0.01" value={v.price} onChange={(e) => setVariantField(i, "price", e.target.value)} />
                  <Input data-testid={`admin-variant-stock-${i}`} placeholder="Stock" type="number" value={v.stock} onChange={(e) => setVariantField(i, "stock", e.target.value)} />
                  <button type="button" onClick={() => removeVariantRow(i)} className="text-muted-warm hover:text-terracotta">
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                data-testid="admin-save-btn"
                className="flex-1 bg-ink text-cream text-sm font-medium rounded-full py-2.5 hover:bg-terracotta transition-colors"
              >
                {editingId ? "Save changes" : "Create product"}
              </button>
              {editingId && (
                <button type="button" onClick={() => { setEditingId(null); setForm(emptyForm); }}
                  className="text-sm border border-warm rounded-full px-4 py-2 hover:bg-parchment">
                  Cancel
                </button>
              )}
            </div>
          </form>

          <div className="bg-surface border border-warm rounded-lg p-5">
            <h2 className="font-heading text-lg font-semibold mb-3">All products ({products.length})</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-warm text-left text-[11px] uppercase tracking-widest text-muted-warm">
                    <th className="py-2">Product</th>
                    <th>Category</th>
                    <th>Base ₹</th>
                    <th>Variants</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.id} className="border-b border-warm/60">
                      <td className="py-3 flex items-center gap-2">
                        <img src={resolveUploadUrl(p.image_url)} className="w-10 h-10 object-contain bg-parchment/40 rounded" alt="" />
                        <span className="line-clamp-1">{p.title}</span>
                        {p.seller_id && <span className="text-[9px] uppercase tracking-widest text-muted-warm border border-warm rounded-full px-1.5 py-0.5 shrink-0">Seller</span>}
                      </td>
                      <td className="text-xs">{p.category}</td>
                      <td>₹{p.price.toFixed(2)}</td>
                      <td className="text-xs">{p.size_variants?.length || 0}</td>
                      <td>
                        <span className={`inline-block text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full border ${
                          p.approval_status === "pending" ? "bg-amber-100 text-amber-700 border-amber-200"
                          : p.approval_status === "rejected" ? "bg-red-100 text-red-700 border-red-200"
                          : "bg-sage/15 text-sage border-sage/30"
                        }`}>
                          {p.approval_status || "approved"}
                        </span>
                      </td>
                      <td className="text-right whitespace-nowrap">
                        {p.approval_status === "pending" && (
                          <>
                            <button data-testid={`admin-approve-${p.id}`} onClick={() => setApproval(p.id, "approved")} className="text-sage hover:text-ink mr-3">Approve</button>
                            <button data-testid={`admin-reject-${p.id}`} onClick={() => setApproval(p.id, "rejected")} className="text-terracotta hover:text-ink mr-3">Reject</button>
                          </>
                        )}
                        <button data-testid={`admin-edit-${p.id}`} onClick={() => edit(p)} className="text-ink hover:text-terracotta mr-3 inline-flex items-center gap-1"><Pencil size={12} /> Edit</button>
                        <button data-testid={`admin-del-${p.id}`} onClick={() => remove(p.id)} className="text-terracotta hover:text-ink inline-flex items-center gap-1"><Trash2 size={12} /> Delete</button>
                      </td>
                    </tr>
                  ))}
                  {products.length === 0 && (
                    <tr><td colSpan={6} className="py-8 text-center text-muted-warm">No products yet — try "Seed 8 demo products" above.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="orders" className="mt-6">
          <div className="bg-surface border border-warm rounded-lg p-5">
            <h2 className="font-heading text-lg font-semibold mb-3">All orders ({orders.length})</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[900px]">
                <thead>
                  <tr className="border-b border-warm text-left text-[11px] uppercase tracking-widest text-muted-warm">
                    <th className="py-2">Order</th>
                    <th>Customer</th>
                    <th>Total</th>
                    <th>Status</th>
                    <th>Tracking</th>
                    <th>Placed</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <AdminOrderRow key={o.id} order={o} onUpdated={loadOrders} />
                  ))}
                  {orders.length === 0 && (
                    <tr><td colSpan={6} className="py-8 text-center text-muted-warm">No orders yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="sellers" className="mt-6">
          <div className="bg-surface border border-warm rounded-lg p-5">
            <h2 className="font-heading text-lg font-semibold mb-3">Seller-wise gist ({sellerStats.length})</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[700px]">
                <thead>
                  <tr className="border-b border-warm text-left text-[11px] uppercase tracking-widest text-muted-warm">
                    <th className="py-2">Seller</th>
                    <th>Orders</th>
                    <th>Items sold</th>
                    <th>Revenue</th>
                    <th>Pending fulfillments</th>
                  </tr>
                </thead>
                <tbody>
                  {sellerStats.map((s) => (
                    <tr key={s.seller_id} className="border-b border-warm/60" data-testid={`admin-seller-row-${s.seller_id}`}>
                      <td className="py-3">
                        <div className="font-medium">{s.name || "—"}</div>
                        <div className="text-xs text-muted-warm">{s.email}</div>
                      </td>
                      <td>{s.orders}</td>
                      <td>{s.items_sold}</td>
                      <td>₹{s.revenue.toFixed(2)}</td>
                      <td>
                        {s.pending_fulfillments > 0 ? (
                          <span className="inline-block text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full border bg-amber-100 text-amber-700 border-amber-200">
                            {s.pending_fulfillments} pending
                          </span>
                        ) : (
                          <span className="text-xs text-muted-warm">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {sellerStats.length === 0 && (
                    <tr><td colSpan={5} className="py-8 text-center text-muted-warm">No sellers yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="coupons" className="mt-6 grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
          <form onSubmit={submitCoupon} className="bg-surface border border-warm rounded-lg p-5 space-y-3 h-fit" data-testid="admin-coupon-form">
            <h2 className="font-heading text-lg font-semibold">New coupon</h2>
            <div>
              <Label>Code</Label>
              <Input data-testid="admin-coupon-code" value={couponForm.code} onChange={(e) => setCouponForm({ ...couponForm, code: e.target.value.toUpperCase() })} placeholder="WELCOME10" required />
            </div>
            <div>
              <Label>Discount type</Label>
              <Select value={couponForm.discount_type} onValueChange={(v) => setCouponForm({ ...couponForm, discount_type: v })}>
                <SelectTrigger data-testid="admin-coupon-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">Percent %</SelectItem>
                  <SelectItem value="flat">Flat ₹ off</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Value</Label>
                <Input data-testid="admin-coupon-value" type="number" step="0.01" value={couponForm.value} onChange={(e) => setCouponForm({ ...couponForm, value: e.target.value })} required />
                <div className="text-[10px] text-muted-warm mt-1">
                  {couponForm.discount_type === "percent" ? "e.g. 10 = 10% off" : "e.g. 50 = ₹50 off"}
                </div>
              </div>
              <div>
                <Label>Min subtotal (₹)</Label>
                <Input data-testid="admin-coupon-min" type="number" value={couponForm.min_subtotal} onChange={(e) => setCouponForm({ ...couponForm, min_subtotal: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Max redemptions (0 = unlimited)</Label>
              <Input data-testid="admin-coupon-max" type="number" value={couponForm.max_uses} onChange={(e) => setCouponForm({ ...couponForm, max_uses: e.target.value })} />
            </div>
            <button
              type="submit"
              data-testid="admin-coupon-save"
              className="w-full bg-ink text-cream text-sm font-medium rounded-full py-2.5 hover:bg-terracotta transition-colors"
            >
              Create coupon
            </button>
          </form>

          <div className="bg-surface border border-warm rounded-lg p-5">
            <h2 className="font-heading text-lg font-semibold mb-3">All coupons ({coupons.length})</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-warm text-left text-[11px] uppercase tracking-widest text-muted-warm">
                  <th className="py-2">Code</th>
                  <th>Discount</th>
                  <th>Min</th>
                  <th>Used</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {coupons.map((c) => (
                  <tr key={c.id} className="border-b border-warm/60">
                    <td className="py-3 font-mono font-semibold">{c.code}</td>
                    <td>{c.discount_type === "percent" ? `${c.value}%` : `₹${c.value.toFixed(2)}`}</td>
                    <td>₹{c.min_subtotal.toFixed(0)}</td>
                    <td className="text-xs">{c.uses}{c.max_uses ? ` / ${c.max_uses}` : ""}</td>
                    <td className="text-right">
                      <button data-testid={`admin-coupon-del-${c.id}`} onClick={() => removeCoupon(c.id)} className="text-terracotta hover:text-ink inline-flex items-center gap-1">
                        <Trash2 size={12} /> Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {coupons.length === 0 && (
                  <tr><td colSpan={5} className="py-8 text-center text-muted-warm">No coupons yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="complaints" className="mt-6">
          <div className="bg-surface border border-warm rounded-lg p-5">
            <h2 className="font-heading text-lg font-semibold mb-3">Complaints & issues ({complaints.length})</h2>
            <div className="space-y-3">
              {complaints.map((c) => (
                <ComplaintRow key={c.id} complaint={c} onUpdated={() => { loadComplaints(); loadStats(); }} />
              ))}
              {complaints.length === 0 && (
                <div className="py-8 text-center text-muted-warm flex flex-col items-center gap-2">
                  <MessageSquareText size={20} />
                  No complaints or issues raised yet.
                </div>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}


function StatCard({ icon: Icon, label, value, testId }) {
  return (
    <div className="bg-surface border border-warm rounded-lg p-5" data-testid={testId}>
      <div className="flex items-center gap-2 text-muted-warm mb-2">
        <Icon size={16} />
        <span className="text-[11px] uppercase tracking-widest">{label}</span>
      </div>
      <div className="font-heading text-2xl font-semibold text-ink">{value}</div>
    </div>
  );
}

const ORDER_STATUS_LABELS = {
  pending: "Pending", confirmed: "Confirmed", processing: "Processing",
  shipped: "Shipped", delivered: "Delivered", cancelled: "Cancelled", payment_failed: "Payment failed",
};

function SalesOverview({ stats }) {
  if (!stats) return <div className="text-muted-warm">Loading sales status…</div>;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={IndianRupee} label="Total revenue" value={`₹${stats.total_revenue.toFixed(2)}`} testId="admin-stat-revenue" />
        <StatCard icon={ShoppingBag} label="Total orders" value={stats.total_orders} testId="admin-stat-orders" />
        <StatCard icon={PackageCheck} label="Products pending review" value={stats.pending_products} testId="admin-stat-pending-products" />
        <StatCard icon={AlertCircle} label="Open complaints" value={stats.open_complaints} testId="admin-stat-open-complaints" />
        <StatCard icon={Store} label="Sellers" value={stats.total_sellers} testId="admin-stat-sellers" />
        <StatCard icon={ShoppingBag} label="Customers" value={stats.total_customers} testId="admin-stat-customers" />
        <StatCard icon={PackageCheck} label="Total products" value={stats.total_products} testId="admin-stat-products" />
      </div>

      <div className="bg-surface border border-warm rounded-lg p-5">
        <h2 className="font-heading text-lg font-semibold mb-3">Orders by status</h2>
        {Object.keys(stats.orders_by_status).length === 0 ? (
          <div className="text-muted-warm text-sm">No orders yet.</div>
        ) : (
          <div className="flex flex-wrap gap-3">
            {Object.entries(stats.orders_by_status).map(([status, count]) => (
              <div key={status} className="flex items-center gap-2 border border-warm rounded-full px-3 py-1.5 text-sm">
                <span className="capitalize">{ORDER_STATUS_LABELS[status] || status}</span>
                <span className="font-heading font-semibold text-ink">{count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const COMPLAINT_STATUS_OPTIONS = ["open", "in_progress", "resolved", "closed"];

function complaintStatusBadgeClass(status) {
  switch (status) {
    case "resolved": return "bg-sage/15 text-sage border-sage/30";
    case "in_progress": return "bg-blue-100 text-blue-700 border-blue-200";
    case "closed": return "bg-parchment/60 text-ink border-warm";
    default: return "bg-amber-100 text-amber-700 border-amber-200";
  }
}

function ComplaintRow({ complaint, onUpdated }) {
  const [status, setStatus] = useState(complaint.status || "open");
  const [response, setResponse] = useState(complaint.admin_response || "");
  const [saving, setSaving] = useState(false);
  const dirty = status !== (complaint.status || "open") || response !== (complaint.admin_response || "");

  const save = async () => {
    if (!dirty) return;
    setSaving(true);
    try {
      await api.patch(`/admin/complaints/${complaint.id}`, { status, admin_response: response });
      toast.success("Issue updated");
      onUpdated?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to update issue");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border border-warm rounded-lg p-4" data-testid={`admin-complaint-${complaint.id}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{complaint.subject}</span>
            <span className="text-[9px] uppercase tracking-widest text-muted-warm border border-warm rounded-full px-1.5 py-0.5">{complaint.role}</span>
          </div>
          <div className="text-xs text-muted-warm mt-0.5">
            {complaint.user_name} · {complaint.user_email} · {new Date(complaint.created_at).toLocaleString()}
          </div>
        </div>
        <span className={`inline-block text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full border ${complaintStatusBadgeClass(complaint.status)}`}>
          {(complaint.status || "open").replace("_", " ")}
        </span>
      </div>
      <p className="text-sm text-muted-warm mt-3 whitespace-pre-wrap">{complaint.message}</p>
      {(complaint.order_id || complaint.product_id) && (
        <div className="text-[11px] text-muted-warm mt-2">
          {complaint.order_id && <span>Order: <span className="font-mono">{complaint.order_id}</span></span>}
          {complaint.product_id && <span className="ml-3">Product: <span className="font-mono">{complaint.product_id}</span></span>}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[180px_1fr_auto] gap-2 mt-3 items-start">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger data-testid={`admin-complaint-status-${complaint.id}`} className="h-9 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {COMPLAINT_STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s} className="capitalize">{s.replace("_", " ")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          data-testid={`admin-complaint-response-${complaint.id}`}
          placeholder="Reply to the buyer/seller (optional)"
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          className="h-9 text-xs"
        />
        <button
          onClick={save}
          disabled={!dirty || saving}
          data-testid={`admin-complaint-save-${complaint.id}`}
          className="text-xs px-4 py-2 rounded bg-ink text-cream hover:bg-terracotta disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}


const STATUS_OPTIONS = ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"];

function statusBadgeClass(status) {
  switch (status) {
    case "delivered": return "bg-sage/15 text-sage border-sage/30";
    case "shipped":   return "bg-blue-100 text-blue-700 border-blue-200";
    case "processing": return "bg-amber-100 text-amber-700 border-amber-200";
    case "cancelled":
    case "payment_failed": return "bg-red-100 text-red-700 border-red-200";
    default: return "bg-parchment/60 text-ink border-warm";
  }
}

function AdminOrderRow({ order, onUpdated }) {
  const [status, setStatus] = useState(order.status || "confirmed");
  const [tracking, setTracking] = useState(order.tracking_number || "");
  const [carrier, setCarrier] = useState(order.carrier || "");
  const [saving, setSaving] = useState(false);
  const dirty = status !== (order.status || "confirmed")
    || tracking !== (order.tracking_number || "")
    || carrier !== (order.carrier || "");

  const save = async () => {
    if (!dirty) return;
    setSaving(true);
    try {
      await api.patch(`/admin/orders/${order.id}/status`, {
        status,
        tracking_number: tracking,
        carrier,
      });
      toast.success(`Order ${order.order_number} updated`);
      onUpdated?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to update order");
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr className="border-b border-warm/60 align-top" data-testid={`admin-order-row-${order.id}`}>
      <td className="py-3 font-mono text-xs">
        {order.order_number}
        <div className="text-[10px] text-muted-warm mt-1">{order.items?.length} items</div>
      </td>
      <td className="text-xs">
        <div>{order.address?.full_name}</div>
        <div className="text-muted-warm">{order.address?.city}</div>
      </td>
      <td className="font-medium">₹{order.total.toFixed(2)}</td>
      <td>
        <div className="flex flex-col gap-2 min-w-[160px]">
          <span className={`inline-block text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full border w-fit ${statusBadgeClass(order.status)}`}>
            {(order.status || "confirmed").replace("_", " ")}
          </span>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger data-testid={`admin-order-status-select-${order.id}`} className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </td>
      <td>
        <div className="flex flex-col gap-1 min-w-[180px]">
          <Input
            data-testid={`admin-order-tracking-${order.id}`}
            className="h-8 text-xs"
            value={tracking}
            onChange={(e) => setTracking(e.target.value)}
            placeholder="Tracking #"
          />
          <Input
            data-testid={`admin-order-carrier-${order.id}`}
            className="h-8 text-xs"
            value={carrier}
            onChange={(e) => setCarrier(e.target.value)}
            placeholder="Carrier (e.g. Delhivery)"
          />
          <button
            type="button"
            onClick={save}
            disabled={!dirty || saving}
            data-testid={`admin-order-save-${order.id}`}
            className="text-xs px-2 py-1 rounded bg-ink text-cream hover:bg-terracotta disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </td>
      <td className="text-xs">{new Date(order.created_at).toLocaleString()}</td>
    </tr>
  );
}
