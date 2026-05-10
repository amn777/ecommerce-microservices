import { useState, useEffect, useContext, createContext, useReducer, useCallback } from "react";

const API_BASE = "https://ecommerce-api-8tee.onrender.com";


// All routes use /api/v1/ prefix
const ROUTES = {
  // Auth (user-service)
  register:    "/api/v1/auth/register",
  login:       "/api/v1/auth/login",
  logout:      "/api/v1/auth/logout",
  refresh:     "/api/v1/auth/refresh",
  // Products (product-service)
  products:    "/api/v1/products",
  categories:  "/api/v1/products/categories",
  product:     (id) => `/api/v1/products/${id}`,
  // Orders (order-service)
  orders:      "/api/v1/orders",
  order:       (id) => `/api/v1/orders/${id}`,
  orderStatus: (id) => `/api/v1/orders/${id}/status`,
  orderStats:  "/api/v1/orders/stats",
  // Payments (payment-service)
  payments:        "/api/v1/payments",
  paymentIntent:   "/api/v1/payments/intent",
  paymentConfirm:  "/api/v1/payments/confirm",
};

const api = {
  async req(method, path, body, token) {
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || data.error || data.msg || `Error ${res.status}`);
    return data;
  },
  get:    (path, token)        => api.req("GET",    path, null, token),
  post:   (path, body, token)  => api.req("POST",   path, body, token),
  put:    (path, body, token)  => api.req("PUT",    path, body, token),
  patch:  (path, body, token)  => api.req("PATCH",  path, body, token),
  delete: (path, token)        => api.req("DELETE", path, null, token),
};

// ─── CONTEXT ──────────────────────────────────────────────────────────────────
const AppCtx = createContext(null);
const useApp = () => useContext(AppCtx);

const cartReducer = (state, action) => {
  switch (action.type) {
    case "ADD": {
      const existing = state.find(i => i._id === action.item._id);
      if (existing) return state.map(i => i._id === action.item._id ? { ...i, qty: i.qty + 1 } : i);
      return [...state, { ...action.item, qty: 1 }];
    }
    case "REMOVE": return state.filter(i => i._id !== action.id);
    case "UPDATE_QTY": return state.map(i => i._id === action.id ? { ...i, qty: Math.max(1, action.qty) } : i);
    case "CLEAR": return [];
    default: return state;
  }
};

// ─── ICONS ────────────────────────────────────────────────────────────────────
const Icon = ({ name, cls = "" }) => {
  const icons = {
    cart: <svg xmlns="http://www.w3.org/2000/svg" className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>,
    user: <svg xmlns="http://www.w3.org/2000/svg" className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>,
    orders: <svg xmlns="http://www.w3.org/2000/svg" className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>,
    search: <svg xmlns="http://www.w3.org/2000/svg" className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>,
    star: <svg xmlns="http://www.w3.org/2000/svg" className={cls} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>,
    trash: <svg xmlns="http://www.w3.org/2000/svg" className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>,
    plus: <svg xmlns="http://www.w3.org/2000/svg" className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>,
    minus: <svg xmlns="http://www.w3.org/2000/svg" className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg>,
    arrow: <svg xmlns="http://www.w3.org/2000/svg" className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>,
    check: <svg xmlns="http://www.w3.org/2000/svg" className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>,
    logout: <svg xmlns="http://www.w3.org/2000/svg" className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>,
    grid: <svg xmlns="http://www.w3.org/2000/svg" className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>,
    filter: <svg xmlns="http://www.w3.org/2000/svg" className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>,
    home: <svg xmlns="http://www.w3.org/2000/svg" className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>,
    x: <svg xmlns="http://www.w3.org/2000/svg" className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>,
    bolt: <svg xmlns="http://www.w3.org/2000/svg" className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>,
  };
  return icons[name] || null;
};

// ─── TOAST ────────────────────────────────────────────────────────────────────
const Toast = ({ toasts, removeToast }) => (
  <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
    {toasts.map(t => (
      <div key={t.id} className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl text-sm font-medium backdrop-blur-sm border transition-all duration-300 ${
        t.type === "success" ? "bg-emerald-950/90 border-emerald-500/40 text-emerald-100" :
        t.type === "error" ? "bg-red-950/90 border-red-500/40 text-red-100" :
        "bg-slate-800/90 border-slate-600/40 text-slate-100"
      }`}>
        {t.type === "success" && <Icon name="check" cls="w-4 h-4 text-emerald-400 shrink-0" />}
        {t.type === "error" && <Icon name="x" cls="w-4 h-4 text-red-400 shrink-0" />}
        <span>{t.message}</span>
        <button onClick={() => removeToast(t.id)} className="ml-2 opacity-60 hover:opacity-100"><Icon name="x" cls="w-3 h-3" /></button>
      </div>
    ))}
  </div>
);

// ─── SPINNER ──────────────────────────────────────────────────────────────────
const Spinner = ({ size = "md" }) => {
  const s = { sm: "w-4 h-4", md: "w-8 h-8", lg: "w-12 h-12" }[size];
  return <div className={`${s} border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin`} />;
};

// ─── NAVBAR ───────────────────────────────────────────────────────────────────
const Navbar = ({ page, setPage }) => {
  const { user, cart, logout } = useApp();
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-40 border-b border-white/5 bg-slate-950/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <button onClick={() => setPage("home")} className="flex items-center gap-2 group">
            <div className="w-8 h-8 bg-gradient-to-br from-amber-400 to-orange-500 rounded-lg flex items-center justify-center shadow-lg shadow-amber-500/30 group-hover:shadow-amber-500/50 transition-shadow">
              <Icon name="bolt" cls="w-4 h-4 text-slate-950" />
            </div>
            <span className="text-xl font-black tracking-tight text-white">
              Bazaar<span className="text-amber-400">X</span>
            </span>
          </button>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-1">
            {[["home","Home"], ["products","Products"], ...(user ? [["orders","Orders"]] : [])].map(([p,l]) => (
              <button key={p} onClick={() => setPage(p)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                page === p ? "bg-amber-500/20 text-amber-400" : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}>{l}</button>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button onClick={() => setPage("cart")} className="relative p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-all">
              <Icon name="cart" cls="w-5 h-5" />
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-amber-500 text-slate-950 text-xs font-black rounded-full flex items-center justify-center leading-none">
                  {cartCount > 9 ? "9+" : cartCount}
                </span>
              )}
            </button>
            {user ? (
              <div className="flex items-center gap-2">
                <span className="hidden sm:block text-sm text-slate-400 font-medium">{user.name || user.email?.split("@")[0]}</span>
                <button onClick={logout} className="p-2 rounded-xl text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all" title="Logout">
                  <Icon name="logout" cls="w-5 h-5" />
                </button>
              </div>
            ) : (
              <button onClick={() => setPage("login")} className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-bold rounded-xl transition-all shadow-lg shadow-amber-500/20 hover:shadow-amber-500/40">
                Sign In
              </button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

// ─── HOME PAGE ────────────────────────────────────────────────────────────────
const HomePage = ({ setPage }) => {
  const { addToCart } = useApp();
  const [featured, setFeatured] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`${ROUTES.products}?limit=4&page=1`).then(d => {
      const items = d.products || d.data || d || [];
      setFeatured(Array.isArray(items) ? items.slice(0, 4) : []);
    }).catch(() => setFeatured([])).finally(() => setLoading(false));
  }, []);

  const categories = [
    { name: "Electronics", emoji: "⚡", color: "from-blue-500/20 to-cyan-500/20 border-blue-500/20" },
    { name: "Fashion", emoji: "👗", color: "from-pink-500/20 to-rose-500/20 border-pink-500/20" },
    { name: "Home", emoji: "🏠", color: "from-amber-500/20 to-yellow-500/20 border-amber-500/20" },
    { name: "Sports", emoji: "🏃", color: "from-green-500/20 to-emerald-500/20 border-green-500/20" },
  ];

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-slate-900 to-slate-950 border-b border-white/5">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 -left-20 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-0 w-80 h-80 bg-orange-500/10 rounded-full blur-3xl" />
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:60px_60px]" />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-24 md:py-36 flex flex-col items-start gap-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-500/15 border border-amber-500/25 rounded-full text-amber-400 text-xs font-semibold uppercase tracking-wider">
            <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" />
            New Arrivals This Week
          </div>
          <h1 className="text-5xl md:text-7xl font-black text-white leading-none tracking-tight max-w-2xl">
            Shop the <br /><span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500">Future</span> of<br />Commerce
          </h1>
          <p className="text-slate-400 text-lg max-w-md leading-relaxed">
            Discover thousands of products with lightning-fast delivery. Quality guaranteed, prices unbeatable.
          </p>
          <div className="flex gap-3 flex-wrap">
            <button onClick={() => setPage("products")} className="group flex items-center gap-2 px-6 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl transition-all shadow-xl shadow-amber-500/25 hover:shadow-amber-500/40 hover:-translate-y-0.5">
              Shop Now <Icon name="arrow" cls="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </button>
            <button onClick={() => setPage("products")} className="px-6 py-3 border border-white/10 text-white font-medium rounded-xl hover:bg-white/5 transition-all">
              Browse Categories
            </button>
          </div>
          <div className="flex gap-8 pt-4">
            {[["50K+","Products"], ["2M+","Happy Customers"], ["99%","Satisfaction"]].map(([n, l]) => (
              <div key={l}>
                <div className="text-2xl font-black text-white">{n}</div>
                <div className="text-xs text-slate-500 font-medium">{l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
        <h2 className="text-2xl font-black text-white mb-8">Browse by Category</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {categories.map(c => (
            <button key={c.name} onClick={() => setPage("products")} className={`group flex flex-col items-center gap-3 p-6 bg-gradient-to-br ${c.color} border rounded-2xl hover:scale-105 transition-all duration-200`}>
              <span className="text-4xl">{c.emoji}</span>
              <span className="text-white font-semibold text-sm">{c.name}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Featured Products */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-20">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-black text-white">Featured Products</h2>
          <button onClick={() => setPage("products")} className="text-amber-400 hover:text-amber-300 text-sm font-semibold flex items-center gap-1 group">
            View All <Icon name="arrow" cls="w-3 h-3 transition-transform group-hover:translate-x-1" />
          </button>
        </div>
        {loading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : featured.length === 0 ? (
          <div className="text-center py-16 text-slate-500">No products found. Check your API connection.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {featured.map(p => <ProductCard key={p._id || p.id} product={p} onAddToCart={() => addToCart(p)} onView={() => setPage("products")} />)}
          </div>
        )}
      </section>
    </div>
  );
};

// ─── PRODUCT CARD ─────────────────────────────────────────────────────────────
const ProductCard = ({ product: p, onAddToCart }) => {
  const [added, setAdded] = useState(false);
  const price = p.price || 0;
  const name = p.name || p.title || "Product";
  const img = p.image || p.imageUrl || p.thumbnail || `https://picsum.photos/seed/${p._id || p.id}/400/300`;
  const rating = p.rating || p.ratings || 4.2;
  const stock = p.stock ?? p.quantity ?? 10;

  const handleAdd = () => {
    onAddToCart();
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  };

  return (
    <div className="group bg-slate-900 border border-white/5 rounded-2xl overflow-hidden hover:border-amber-500/20 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-amber-500/5 flex flex-col">
      <div className="relative overflow-hidden bg-slate-800 aspect-[4/3]">
        <img src={img} alt={name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" onError={e => e.target.src = `https://picsum.photos/seed/${Math.random()}/400/300`} />
        {stock < 5 && stock > 0 && (
          <span className="absolute top-2 left-2 px-2 py-0.5 bg-red-500 text-white text-xs font-bold rounded-full">Low Stock</span>
        )}
        {stock === 0 && (
          <div className="absolute inset-0 bg-slate-900/70 flex items-center justify-center">
            <span className="text-white font-bold text-sm">Out of Stock</span>
          </div>
        )}
      </div>
      <div className="p-4 flex flex-col flex-1">
        <p className="text-xs text-amber-500/70 font-medium mb-1 uppercase tracking-wider">{p.category || "General"}</p>
        <h3 className="text-white font-semibold text-sm leading-snug mb-2 flex-1 line-clamp-2">{name}</h3>
        <div className="flex items-center gap-1 mb-3">
          <Icon name="star" cls="w-3.5 h-3.5 text-amber-400" />
          <span className="text-amber-400 text-xs font-semibold">{typeof rating === "number" ? rating.toFixed(1) : rating}</span>
          <span className="text-slate-600 text-xs">({p.numReviews || p.reviewCount || Math.floor(Math.random() * 200) + 10})</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-white font-black text-lg">₹{Number(price).toLocaleString("en-IN")}</span>
          <button onClick={handleAdd} disabled={stock === 0 || added} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
            added ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" :
            stock === 0 ? "bg-slate-700 text-slate-500 cursor-not-allowed" :
            "bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/20 hover:shadow-amber-500/40"
          }`}>
            {added ? <><Icon name="check" cls="w-3 h-3" />Added</> : <><Icon name="cart" cls="w-3 h-3" />Add</>}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── PRODUCTS PAGE ────────────────────────────────────────────────────────────
const ProductsPage = () => {
  const { addToCart } = useApp();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState("default");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const limit = 12;

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let url = `${ROUTES.products}?page=${page}&limit=${limit}`;
      if (search) url += `&search=${encodeURIComponent(search)}`;
      if (category !== "all") url += `&category=${encodeURIComponent(category)}`;
      const data = await api.get(url);
      // Response shape: { products: [], total, pages } or { data: [] } or []
      const items = data.products || data.data || data || [];
      const arr = Array.isArray(items) ? items : [];
      let sorted = [...arr];
      if (sort === "price_asc") sorted.sort((a, b) => (a.price || 0) - (b.price || 0));
      if (sort === "price_desc") sorted.sort((a, b) => (b.price || 0) - (a.price || 0));
      if (sort === "rating") sorted.sort((a, b) => (b.rating || 0) - (a.rating || 0));
      setProducts(sorted);
      setTotalPages(data.pages || data.totalPages || Math.ceil((data.total || arr.length) / limit) || 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [page, search, category, sort]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  const categories = ["all", "Electronics", "Fashion", "Home", "Sports", "Books", "Beauty", "Toys"];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
      <h1 className="text-3xl font-black text-white mb-8">All Products</h1>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-8">
        <div className="relative flex-1">
          <Icon name="search" cls="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search products..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-white/10 rounded-xl text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-amber-500/50 transition-colors" />
        </div>
        <select value={category} onChange={e => { setCategory(e.target.value); setPage(1); }}
          className="px-4 py-2.5 bg-slate-900 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-amber-500/50 cursor-pointer">
          {categories.map(c => <option key={c} value={c}>{c === "all" ? "All Categories" : c}</option>)}
        </select>
        <select value={sort} onChange={e => setSort(e.target.value)}
          className="px-4 py-2.5 bg-slate-900 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-amber-500/50 cursor-pointer">
          <option value="default">Sort: Default</option>
          <option value="price_asc">Price: Low to High</option>
          <option value="price_desc">Price: High to Low</option>
          <option value="rating">Top Rated</option>
        </select>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex justify-center items-center py-32"><Spinner size="lg" /></div>
      ) : error ? (
        <div className="text-center py-20">
          <p className="text-red-400 font-medium mb-2">Failed to load products</p>
          <p className="text-slate-600 text-sm mb-6">{error}</p>
          <button onClick={fetchProducts} className="px-5 py-2 bg-amber-500 text-slate-950 rounded-xl font-bold text-sm hover:bg-amber-400 transition">Retry</button>
        </div>
      ) : products.length === 0 ? (
        <div className="text-center py-20 text-slate-500">No products found.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {products.map(p => <ProductCard key={p._id || p.id} product={p} onAddToCart={() => addToCart(p)} />)}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2 mt-12">
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="px-4 py-2 rounded-xl bg-slate-800 text-slate-400 disabled:opacity-30 hover:bg-slate-700 transition text-sm font-medium">Prev</button>
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            const n = Math.min(Math.max(page - 2, 1) + i, totalPages);
            return (
              <button key={n} onClick={() => setPage(n)} className={`w-9 h-9 rounded-xl text-sm font-bold transition ${page === n ? "bg-amber-500 text-slate-950" : "bg-slate-800 text-slate-400 hover:bg-slate-700"}`}>{n}</button>
            );
          })}
          <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)} className="px-4 py-2 rounded-xl bg-slate-800 text-slate-400 disabled:opacity-30 hover:bg-slate-700 transition text-sm font-medium">Next</button>
        </div>
      )}
    </div>
  );
};

// ─── CART PAGE ────────────────────────────────────────────────────────────────
const CartPage = ({ setPage }) => {
  const { cart, dispatch, user, showToast } = useApp();
  const [placing, setPlacing] = useState(false);
  const subtotal = cart.reduce((s, i) => s + (i.price || 0) * i.qty, 0);
  const shipping = subtotal > 999 ? 0 : 99;
  const total = subtotal + shipping;

  const placeOrder = async () => {
    if (!user) { showToast("Please login to place order", "error"); setPage("login"); return; }
    if (cart.length === 0) { showToast("Cart is empty!", "error"); return; }
    setPlacing(true);
    try {
      // Order-service expects: items[], totalAmount, shippingAddress
      const payload = {
        items: cart.map(i => ({
          productId: i.id || i._id,
          name:      i.name || i.title,
          quantity:  i.qty,
          price:     i.price,
        })),
        totalAmount:     total,
        shippingAddress: { address: "Default Address", city: "City", country: "India" },
      };
      await api.post(ROUTES.orders, payload, user.token);
      dispatch({ type: "CLEAR" });
      showToast("Order placed successfully! 🎉", "success");
      setPage("orders");
    } catch (e) {
      showToast(e.message || "Failed to place order", "error");
    } finally {
      setPlacing(false);
    }
  };

  if (cart.length === 0) return (
    <div className="max-w-2xl mx-auto px-4 py-24 text-center">
      <div className="w-24 h-24 bg-slate-900 rounded-3xl flex items-center justify-center mx-auto mb-6">
        <Icon name="cart" cls="w-12 h-12 text-slate-700" />
      </div>
      <h2 className="text-2xl font-black text-white mb-3">Your cart is empty</h2>
      <p className="text-slate-500 mb-8">Looks like you haven't added anything yet.</p>
      <button onClick={() => setPage("products")} className="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl transition shadow-lg shadow-amber-500/20">
        Start Shopping
      </button>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      <h1 className="text-3xl font-black text-white mb-8">Shopping Cart <span className="text-slate-600 text-xl font-medium">({cart.reduce((s, i) => s + i.qty, 0)} items)</span></h1>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Items */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          {cart.map(item => (
            <div key={item._id || item.id} className="flex gap-4 bg-slate-900 border border-white/5 rounded-2xl p-4 hover:border-white/10 transition-colors">
              <img src={item.image || item.imageUrl || `https://picsum.photos/seed/${item._id}/100/100`} alt={item.name || item.title}
                className="w-20 h-20 object-cover rounded-xl bg-slate-800 shrink-0" onError={e => e.target.src = `https://picsum.photos/seed/${Math.random()}/100/100`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-amber-500/70 font-medium mb-0.5 uppercase">{item.category || "Product"}</p>
                <h3 className="text-white font-semibold text-sm leading-snug mb-1 line-clamp-2">{item.name || item.title}</h3>
                <p className="text-amber-400 font-black">₹{Number(item.price || 0).toLocaleString("en-IN")}</p>
              </div>
              <div className="flex flex-col items-end gap-3 shrink-0">
                <button onClick={() => dispatch({ type: "REMOVE", id: item._id || item.id })} className="p-1.5 text-slate-600 hover:text-red-400 transition-colors rounded-lg hover:bg-red-500/10">
                  <Icon name="trash" cls="w-4 h-4" />
                </button>
                <div className="flex items-center gap-2 bg-slate-800 rounded-lg p-1">
                  <button onClick={() => item.qty <= 1 ? dispatch({ type: "REMOVE", id: item._id || item.id }) : dispatch({ type: "UPDATE_QTY", id: item._id || item.id, qty: item.qty - 1 })}
                    className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-white transition-colors rounded">
                    <Icon name="minus" cls="w-3 h-3" />
                  </button>
                  <span className="text-white font-bold text-sm w-6 text-center">{item.qty}</span>
                  <button onClick={() => dispatch({ type: "UPDATE_QTY", id: item._id || item.id, qty: item.qty + 1 })}
                    className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-white transition-colors rounded">
                    <Icon name="plus" cls="w-3 h-3" />
                  </button>
                </div>
                <p className="text-white font-bold text-sm">₹{(Number(item.price || 0) * item.qty).toLocaleString("en-IN")}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Summary */}
        <div className="lg:col-span-1">
          <div className="bg-slate-900 border border-white/5 rounded-2xl p-6 sticky top-20">
            <h2 className="text-white font-black text-lg mb-6">Order Summary</h2>
            <div className="space-y-3 text-sm mb-6">
              <div className="flex justify-between text-slate-400">
                <span>Subtotal</span>
                <span className="text-white font-semibold">₹{subtotal.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Shipping</span>
                <span className={shipping === 0 ? "text-emerald-400 font-semibold" : "text-white font-semibold"}>
                  {shipping === 0 ? "FREE" : `₹${shipping}`}
                </span>
              </div>
              {shipping === 0 && <p className="text-emerald-500/70 text-xs">✓ Free shipping on orders above ₹999</p>}
              <div className="border-t border-white/10 pt-3 flex justify-between">
                <span className="text-white font-bold">Total</span>
                <span className="text-amber-400 font-black text-lg">₹{total.toLocaleString("en-IN")}</span>
              </div>
            </div>
            <button onClick={placeOrder} disabled={placing}
              className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl transition-all shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40 disabled:opacity-60 flex items-center justify-center gap-2">
              {placing ? <Spinner size="sm" /> : null}
              {placing ? "Placing Order..." : "Place Order"}
            </button>
            <button onClick={() => dispatch({ type: "CLEAR" })} className="w-full mt-3 py-2.5 text-slate-500 hover:text-red-400 text-sm font-medium transition-colors">
              Clear Cart
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── ORDERS PAGE ──────────────────────────────────────────────────────────────
const OrdersPage = ({ setPage }) => {
  const { user, showToast } = useApp();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    // GET /api/v1/orders with JWT returns logged-in user's orders
    api.get(ROUTES.orders, user.token)
      .then(d => setOrders(Array.isArray(d) ? d : d.orders || d.data || []))
      .catch(e => showToast(e.message, "error"))
      .finally(() => setLoading(false));
  }, [user]);

  if (!user) return (
    <div className="max-w-md mx-auto px-4 py-24 text-center">
      <p className="text-slate-400 mb-6">Please login to view your orders.</p>
      <button onClick={() => setPage("login")} className="px-6 py-3 bg-amber-500 text-slate-950 font-bold rounded-xl hover:bg-amber-400 transition">Login</button>
    </div>
  );

  const statusColor = s => ({
    pending: "bg-yellow-500/15 text-yellow-400 border-yellow-500/25",
    processing: "bg-blue-500/15 text-blue-400 border-blue-500/25",
    shipped: "bg-purple-500/15 text-purple-400 border-purple-500/25",
    delivered: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
    cancelled: "bg-red-500/15 text-red-400 border-red-500/25",
  }[s?.toLowerCase()] || "bg-slate-500/15 text-slate-400 border-slate-500/25");

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
      <h1 className="text-3xl font-black text-white mb-8">My Orders</h1>
      {loading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : orders.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-20 h-20 bg-slate-900 rounded-3xl flex items-center justify-center mx-auto mb-5">
            <Icon name="orders" cls="w-10 h-10 text-slate-700" />
          </div>
          <p className="text-slate-500 mb-6">No orders yet. Start shopping!</p>
          <button onClick={() => setPage("products")} className="px-6 py-3 bg-amber-500 text-slate-950 font-bold rounded-xl hover:bg-amber-400 transition">Shop Now</button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {orders.map(order => (
            <div key={order._id || order.id} className="bg-slate-900 border border-white/5 rounded-2xl p-5 hover:border-white/10 transition-colors">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div>
                  <p className="text-xs text-slate-600 font-mono mb-1">Order #{(order._id || order.id || "").slice(-8).toUpperCase()}</p>
                  <p className="text-xs text-slate-500">{new Date(order.createdAt || order.date || Date.now()).toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" })}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`px-3 py-1 text-xs font-semibold rounded-full border capitalize ${statusColor(order.status || order.orderStatus)}`}>
                    {order.status || order.orderStatus || "Pending"}
                  </span>
                  <span className="text-amber-400 font-black text-lg">₹{Number(order.totalPrice || order.total || 0).toLocaleString("en-IN")}</span>
                </div>
              </div>
              {(order.orderItems || order.items || []).length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {(order.orderItems || order.items || []).slice(0, 3).map((item, i) => (
                    <div key={i} className="flex items-center gap-2 bg-slate-800 rounded-lg px-3 py-2 text-xs">
                      <img src={item.image || item.imageUrl || `https://picsum.photos/seed/${item.product}/40/40`} alt={item.name} className="w-6 h-6 object-cover rounded" onError={e => e.target.style.display = "none"} />
                      <span className="text-slate-300">{item.name}</span>
                      <span className="text-slate-600">×{item.qty}</span>
                    </div>
                  ))}
                  {(order.orderItems || order.items || []).length > 3 && (
                    <div className="bg-slate-800 rounded-lg px-3 py-2 text-xs text-slate-500">
                      +{(order.orderItems || order.items || []).length - 3} more
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── AUTH PAGE ────────────────────────────────────────────────────────────────
const AuthPage = ({ setPage }) => {
  const { setUser, showToast } = useApp();
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "" });

  const handleSubmit = async () => {
    if (!form.email || !form.password) { showToast("Please fill all fields", "error"); return; }
    if (!isLogin && !form.name) { showToast("Please enter your name", "error"); return; }
    setLoading(true);
    try {
      const endpoint = isLogin ? ROUTES.login : ROUTES.register;
      const payload = isLogin
        ? { email: form.email, password: form.password }
      : { firstName: form.name.split(' ')[0], lastName: form.name.split(' ')[1] || form.name.split(' ')[0], email: form.email, password: form.password };
      const data = await api.post(endpoint, payload);
      // user-service returns: { token, user: {...} } or { accessToken, user }
      const token = data.token || data.accessToken || data.access_token;
      const userObj = { ...(data.user || data), token };
      setUser(userObj);
      localStorage.setItem("bazaarx_user", JSON.stringify(userObj));
      showToast(`Welcome${userObj.name ? `, ${userObj.name}` : ""}! 👋`, "success");
      setPage("home");
    } catch (e) {
      showToast(e.message || "Authentication failed", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl shadow-amber-500/30">
            <Icon name="bolt" cls="w-7 h-7 text-slate-950" />
          </div>
          <h1 className="text-3xl font-black text-white">{isLogin ? "Welcome back" : "Create account"}</h1>
          <p className="text-slate-500 mt-2">{isLogin ? "Sign in to continue shopping" : "Join BazaarX today"}</p>
        </div>

        <div className="bg-slate-900 border border-white/5 rounded-3xl p-8 shadow-2xl">
          <div className="flex bg-slate-800 p-1 rounded-xl mb-6 gap-1">
            {[["Login", true], ["Register", false]].map(([l, v]) => (
              <button key={l} onClick={() => setIsLogin(v)} className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${isLogin === v ? "bg-amber-500 text-slate-950 shadow" : "text-slate-500 hover:text-slate-300"}`}>{l}</button>
            ))}
          </div>

          <div className="space-y-4">
            {!isLogin && (
              <div>
                <label className="text-xs text-slate-500 font-medium uppercase tracking-wider block mb-2">Full Name</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="John Doe" className="w-full px-4 py-3 bg-slate-800 border border-white/10 rounded-xl text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-amber-500/50 transition-colors" />
              </div>
            )}
            <div>
              <label className="text-xs text-slate-500 font-medium uppercase tracking-wider block mb-2">Email</label>
              <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="you@example.com" className="w-full px-4 py-3 bg-slate-800 border border-white/10 rounded-xl text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-amber-500/50 transition-colors" />
            </div>
            <div>
              <label className="text-xs text-slate-500 font-medium uppercase tracking-wider block mb-2">Password</label>
              <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                onKeyDown={e => e.key === "Enter" && handleSubmit()}
                placeholder="••••••••" className="w-full px-4 py-3 bg-slate-800 border border-white/10 rounded-xl text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-amber-500/50 transition-colors" />
            </div>
          </div>

          <button onClick={handleSubmit} disabled={loading}
            className="w-full mt-6 py-3.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl transition-all shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40 disabled:opacity-60 flex items-center justify-center gap-2">
            {loading && <Spinner size="sm" />}
            {loading ? "Please wait..." : isLogin ? "Sign In" : "Create Account"}
          </button>

          <p className="text-center text-slate-600 text-sm mt-5">
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <button onClick={() => setIsLogin(!isLogin)} className="text-amber-400 hover:text-amber-300 font-semibold">{isLogin ? "Register" : "Sign in"}</button>
          </p>
        </div>
      </div>
    </div>
  );
};

// ─── FOOTER ───────────────────────────────────────────────────────────────────
const Footer = ({ setPage }) => (
  <footer className="border-t border-white/5 bg-slate-950 mt-auto">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <button onClick={() => setPage("home")} className="flex items-center gap-2">
          <div className="w-7 h-7 bg-gradient-to-br from-amber-400 to-orange-500 rounded-lg flex items-center justify-center">
            <Icon name="bolt" cls="w-3.5 h-3.5 text-slate-950" />
          </div>
          <span className="text-lg font-black text-white">Bazaar<span className="text-amber-400">X</span></span>
        </button>
        <div className="flex items-center gap-6 text-sm text-slate-600">
          <span>© 2025 BazaarX</span>
          <span>·</span>
          <span>All rights reserved</span>
        </div>
        <div className="flex gap-1">
          {[["home","Home"],["products","Products"],["cart","Cart"]].map(([p,l]) => (
            <button key={p} onClick={() => setPage(p)} className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-400 transition-colors rounded-lg hover:bg-white/5">{l}</button>
          ))}
        </div>
      </div>
    </div>
  </footer>
);

// ─── APP ROOT ─────────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState("home");
  const [user, setUserState] = useState(() => {
    try { return JSON.parse(localStorage.getItem("bazaarx_user")); } catch { return null; }
  });
  const [cart, dispatch] = useReducer(cartReducer, [], () => {
    try { return JSON.parse(localStorage.getItem("bazaarx_cart")) || []; } catch { return []; }
  });
  const [toasts, setToasts] = useState([]);

  useEffect(() => { localStorage.setItem("bazaarx_cart", JSON.stringify(cart)); }, [cart]);

  const setUser = u => { setUserState(u); if (u) localStorage.setItem("bazaarx_user", JSON.stringify(u)); };
  const logout = () => { setUserState(null); localStorage.removeItem("bazaarx_user"); setPage("home"); showToast("Logged out successfully", "success"); };
  const addToCart = item => { dispatch({ type: "ADD", item }); showToast(`${item.name || item.title || "Product"} added to cart`, "success"); };
  const showToast = (message, type = "info") => {
    const id = Date.now();
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  };
  const removeToast = id => setToasts(t => t.filter(x => x.id !== id));

  const ctx = { user, setUser, logout, cart, dispatch, addToCart, showToast };

  const pageComponent = {
    home: <HomePage setPage={setPage} />,
    products: <ProductsPage />,
    cart: <CartPage setPage={setPage} />,
    orders: <OrdersPage setPage={setPage} />,
    login: <AuthPage setPage={setPage} />,
  }[page] || <HomePage setPage={setPage} />;

  return (
    <AppCtx.Provider value={ctx}>
      <div className="min-h-screen bg-slate-950 text-white flex flex-col" style={{ fontFamily: "'Sora', 'DM Sans', sans-serif" }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800;900&display=swap');
          * { box-sizing: border-box; }
          ::selection { background: rgba(245,158,11,0.3); color: white; }
          ::-webkit-scrollbar { width: 5px; }
          ::-webkit-scrollbar-track { background: #0f172a; }
          ::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }
          ::-webkit-scrollbar-thumb:hover { background: #f59e0b; }
          .line-clamp-2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        `}</style>
        <Navbar page={page} setPage={setPage} />
        <main className="flex-1">{pageComponent}</main>
        <Footer setPage={setPage} />
        <Toast toasts={toasts} removeToast={removeToast} />
      </div>
    </AppCtx.Provider>
  );
}

       