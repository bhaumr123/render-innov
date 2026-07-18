import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Trash2, Pencil } from "lucide-react";

const CATEGORIES = ["Electronics", "Smart Home", "Fashion", "Books", "Home & Kitchen", "Toys", "Sports", "Beauty"];

const emptyForm = {
  title: "", description: "", price: "", category: "Electronics",
  stock: 100, image_url: "", brand: "", rating: 4.5, reviews_count: 0,
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
      rating: parseFloat(form.rating || 4.5),
      reviews_count: parseInt(form.reviews_count || 0),
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
      brand: p.brand || "", rating: p.rating || 4.5, reviews_count: p.reviews_count || 0,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this product?")) return;
    await api.delete(`/products/${id}`);
    toast.success("Deleted");
    loadProducts();
  };

  const seedDemo = async () => {
    const demo = [
      { title: "Sony WH-1000XM5 Wireless Headphones", brand: "Sony", price: 349.99, category: "Electronics", stock: 40, rating: 4.7, reviews_count: 1245, image_url: "https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA4Mzl8MHwxfHNlYXJjaHwyfHx3aXJlbGVzcyUyMGhlYWRwaG9uZXMlMjBwcm9kdWN0fGVufDB8fHx8MTc4NDM4NDI5Mnww&ixlib=rb-4.1.0&q=85", description: "Industry-leading noise cancellation with premium sound." },
      { title: "Google Nest Mini (2nd Gen) Smart Speaker", brand: "Google", price: 49.0, category: "Smart Home", stock: 120, rating: 4.5, reviews_count: 3220, image_url: "https://images.unsplash.com/photo-1519558260268-cde7e03a0152?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2OTF8MHwxfHNlYXJjaHwzfHxzbWFydCUyMGhvbWUlMjBkZXZpY2UlMjBwcm9kdWN0fGVufDB8fHx8MTc4NDM4NDI5Mnww&ixlib=rb-4.1.0&q=85", description: "Voice-controlled smart speaker with the Google Assistant." },
      { title: "JBL Bluetooth Over-Ear Headphones", brand: "JBL", price: 129.99, category: "Electronics", stock: 80, rating: 4.4, reviews_count: 890, image_url: "https://images.pexels.com/photos/3081173/pexels-photo-3081173.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940", description: "Bold sound, ultra-comfortable, 40h battery life." },
      { title: "Modern Smartphone 128GB (Unlocked)", brand: "Nova", price: 599.0, category: "Electronics", stock: 30, rating: 4.3, reviews_count: 512, image_url: "https://images.pexels.com/photos/22307556/pexels-photo-22307556.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940", description: "OLED display, 5G ready, 128GB storage." },
      { title: "The Everything Shopping Guide (Paperback)", brand: "ShopPress", price: 14.99, category: "Books", stock: 200, rating: 4.6, reviews_count: 78, image_url: "https://images.pexels.com/photos/6214155/pexels-photo-6214155.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940", description: "A complete guide to smart online shopping." },
      { title: "Weekend Tote Bag – Canvas", brand: "Boulevard", price: 39.5, category: "Fashion", stock: 60, rating: 4.2, reviews_count: 210, image_url: "https://images.pexels.com/photos/6956903/pexels-photo-6956903.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940", description: "Roomy weekender for travel and errands." },
    ];
    for (const d of demo) {
      try { await api.post("/products", d); } catch {}
    }
    toast.success("Demo products added");
    loadProducts();
  };

  return (
    <div className="max-w-screen-2xl mx-auto px-4 py-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-heading text-2xl font-semibold">Admin panel</h1>
        <button
          onClick={seedDemo}
          data-testid="admin-seed-btn"
          className="text-sm border border-neutral-300 bg-neutral-100 hover:bg-neutral-200 rounded-full px-4 py-1.5 transition-colors"
        >
          + Add 6 demo products
        </button>
      </div>

      <Tabs defaultValue="products">
        <TabsList>
          <TabsTrigger value="products" data-testid="admin-tab-products">Products</TabsTrigger>
          <TabsTrigger value="orders" data-testid="admin-tab-orders">Orders</TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="mt-4 grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4">
          <form onSubmit={submit} className="bg-white border border-neutral-200 rounded-md p-4 space-y-3 h-fit" data-testid="admin-product-form">
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
                <Label>Price ($)</Label>
                <Input data-testid="admin-price" type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />
              </div>
              <div>
                <Label>Stock</Label>
                <Input data-testid="admin-stock" type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Rating</Label>
                <Input type="number" step="0.1" min="0" max="5" value={form.rating} onChange={(e) => setForm({ ...form, rating: e.target.value })} />
              </div>
              <div>
                <Label>Reviews</Label>
                <Input type="number" value={form.reviews_count} onChange={(e) => setForm({ ...form, reviews_count: e.target.value })} />
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
            <div className="flex gap-2">
              <button
                type="submit"
                data-testid="admin-save-btn"
                className="flex-1 amazon-orange text-black font-semibold text-sm rounded-full py-2 hover:brightness-95 transition-colors"
              >
                {editingId ? "Save changes" : "Create product"}
              </button>
              {editingId && (
                <button type="button" onClick={() => { setEditingId(null); setForm(emptyForm); }}
                  className="text-sm border border-neutral-300 rounded-full px-4 py-2 hover:bg-neutral-100">
                  Cancel
                </button>
              )}
            </div>
          </form>

          <div className="bg-white border border-neutral-200 rounded-md p-4">
            <h2 className="font-heading text-lg font-semibold mb-2">All products ({products.length})</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
                    <th className="py-2">Product</th>
                    <th>Category</th>
                    <th>Price</th>
                    <th>Stock</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.id} className="border-b border-neutral-100">
                      <td className="py-2 flex items-center gap-2">
                        <img src={p.image_url} className="w-10 h-10 object-contain" alt="" />
                        <span className="line-clamp-1">{p.title}</span>
                      </td>
                      <td className="text-xs">{p.category}</td>
                      <td>${p.price.toFixed(2)}</td>
                      <td>{p.stock}</td>
                      <td className="text-right">
                        <button data-testid={`admin-edit-${p.id}`} onClick={() => edit(p)} className="link-blue hover:underline mr-2 inline-flex items-center gap-1"><Pencil size={12} /> Edit</button>
                        <button data-testid={`admin-del-${p.id}`} onClick={() => remove(p.id)} className="text-[#B12704] hover:underline inline-flex items-center gap-1"><Trash2 size={12} /> Del</button>
                      </td>
                    </tr>
                  ))}
                  {products.length === 0 && (
                    <tr><td colSpan={5} className="py-6 text-center text-neutral-500">No products yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="orders" className="mt-4">
          <div className="bg-white border border-neutral-200 rounded-md p-4">
            <h2 className="font-heading text-lg font-semibold mb-2">All orders ({orders.length})</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
                  <th className="py-2">Order #</th>
                  <th>Customer</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Placed</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="border-b border-neutral-100">
                    <td className="py-2 font-mono text-xs">{o.order_number}</td>
                    <td>{o.address?.full_name}</td>
                    <td>{o.items?.length}</td>
                    <td>${o.total.toFixed(2)}</td>
                    <td className="text-xs">{new Date(o.created_at).toLocaleString()}</td>
                  </tr>
                ))}
                {orders.length === 0 && (
                  <tr><td colSpan={5} className="py-6 text-center text-neutral-500">No orders yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
