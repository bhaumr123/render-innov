import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Trash2, Pencil, Plus, X } from "lucide-react";
import {
  IMG_BLUE_TEA, IMG_DHANIYA, IMG_CHILLI, IMG_OIL, IMG_BEADS,
  IMG_ASHWAGANDHA, IMG_HONEY, IMG_LOOSE_TEA,
} from "@/lib/assets";

const CATEGORIES = ["Teas", "Spices", "Artisanal Goods"];

const emptyForm = {
  title: "", description: "", price: "", category: "Teas",
  stock: 100, image_url: "", brand: "IWI", rating: 4.9, reviews_count: 0,
  size_variants: [],
};

export default function Admin() {
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);

  const loadProducts = () => api.get("/products?limit=200").then((r) => setProducts(r.data.items || []));
  const loadOrders = () => api.get("/admin/orders").then((r) => setOrders(r.data.orders || []));

  useEffect(() => { loadProducts(); loadOrders(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    const body = {
      ...form,
      price: parseFloat(form.price),
      stock: parseInt(form.stock),
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
      size_variants: p.size_variants || [],
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this product?")) return;
    await api.delete(`/products/${id}`);
    toast.success("Deleted");
    loadProducts();
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
      {
        title: "Butterfly Pea Flower · Herbal Tea",
        brand: "Blue Tea Co.", category: "Teas",
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
        brand: "IWI Apothecary", category: "Teas",
        description: "Sun-dried marigold petals. Steep for a soothing, honey-toned brew or blend into your own infusions.",
        price: 249, stock: 40, rating: 4.7, reviews_count: 89, image_url: IMG_LOOSE_TEA,
        size_variants: [
          { label: "30g pouch", price: 249, stock: 40 },
          { label: "80g jar", price: 549, stock: 20 },
        ],
      },
      {
        title: "TRJU Coriander (Dhaniya) Powder",
        brand: "TRJU", category: "Spices",
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
        brand: "Marwar", category: "Spices",
        description: "Sun-dried Rajasthani chillies, stone-ground. Vivid red colour with a warm, lingering heat.",
        price: 149, stock: 80, rating: 4.7, reviews_count: 312, image_url: IMG_CHILLI,
        size_variants: [
          { label: "100g", price: 149, stock: 80 },
          { label: "250g", price: 349, stock: 60 },
          { label: "500g", price: 649, stock: 30 },
        ],
      },
      {
        title: "Tata Cold-Pressed Mustard Oil",
        brand: "Tata Simply Better", category: "Artisanal Goods",
        description: "Kachi ghani cold-pressed mustard oil. Full aroma, unrefined, made in small batches.",
        price: 399, stock: 50, rating: 4.6, reviews_count: 178, image_url: IMG_OIL,
        size_variants: [
          { label: "500 ml", price: 399, stock: 50 },
          { label: "1 L", price: 749, stock: 30 },
        ],
      },
      {
        title: "Ashwagandhadi Churna · Ayurvedic Tonic",
        brand: "Baidyanath", category: "Artisanal Goods",
        description: "Classical Ayurvedic churna blend with Ashwagandha at its heart. Traditionally used for calm and vitality.",
        price: 189, stock: 60, rating: 4.8, reviews_count: 245, image_url: IMG_ASHWAGANDHA,
        size_variants: [
          { label: "60g", price: 189, stock: 60 },
          { label: "120g", price: 349, stock: 30 },
        ],
      },
      {
        title: "Himalayan Forest Honey · Raw & Unfiltered",
        brand: "Honey Veda", category: "Artisanal Goods",
        description: "Wild, raw, unfiltered honey collected from Himalayan forests. Rich amber, floral, mineral.",
        price: 549, stock: 40, rating: 4.9, reviews_count: 401, image_url: IMG_HONEY,
        size_variants: [
          { label: "250g", price: 549, stock: 40 },
          { label: "500g", price: 999, stock: 25 },
        ],
      },
      {
        title: "Tulsi Japa Mala · 108 Prayer Beads",
        brand: "IWI Apothecary", category: "Artisanal Goods",
        description: "Hand-strung 108-bead Tulsi mala for meditation and mindful practice. Small red cotton tassel.",
        price: 799, stock: 25, rating: 5.0, reviews_count: 68, image_url: IMG_BEADS,
        size_variants: [
          { label: "6mm beads", price: 799, stock: 25 },
          { label: "8mm beads", price: 999, stock: 15 },
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

      <Tabs defaultValue="products">
        <TabsList>
          <TabsTrigger value="products" data-testid="admin-tab-products">Products</TabsTrigger>
          <TabsTrigger value="orders" data-testid="admin-tab-orders">Orders</TabsTrigger>
        </TabsList>

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
                  {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
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
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.id} className="border-b border-warm/60">
                      <td className="py-3 flex items-center gap-2">
                        <img src={p.image_url} className="w-10 h-10 object-contain bg-parchment/40 rounded" alt="" />
                        <span className="line-clamp-1">{p.title}</span>
                      </td>
                      <td className="text-xs">{p.category}</td>
                      <td>₹{p.price.toFixed(2)}</td>
                      <td className="text-xs">{p.size_variants?.length || 0}</td>
                      <td className="text-right whitespace-nowrap">
                        <button data-testid={`admin-edit-${p.id}`} onClick={() => edit(p)} className="text-ink hover:text-terracotta mr-3 inline-flex items-center gap-1"><Pencil size={12} /> Edit</button>
                        <button data-testid={`admin-del-${p.id}`} onClick={() => remove(p.id)} className="text-terracotta hover:text-ink inline-flex items-center gap-1"><Trash2 size={12} /> Delete</button>
                      </td>
                    </tr>
                  ))}
                  {products.length === 0 && (
                    <tr><td colSpan={5} className="py-8 text-center text-muted-warm">No products yet — try "Seed 8 demo products" above.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="orders" className="mt-6">
          <div className="bg-surface border border-warm rounded-lg p-5">
            <h2 className="font-heading text-lg font-semibold mb-3">All orders ({orders.length})</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-warm text-left text-[11px] uppercase tracking-widest text-muted-warm">
                  <th className="py-2">Order</th>
                  <th>Customer</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Placed</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="border-b border-warm/60">
                    <td className="py-3 font-mono text-xs">{o.order_number}</td>
                    <td>{o.address?.full_name}</td>
                    <td>{o.items?.length}</td>
                    <td>₹{o.total.toFixed(2)}</td>
                    <td className="text-xs">{new Date(o.created_at).toLocaleString()}</td>
                  </tr>
                ))}
                {orders.length === 0 && (
                  <tr><td colSpan={5} className="py-8 text-center text-muted-warm">No orders yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
