const state = {
  token: localStorage.getItem('accessToken') || '',
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  products: [],
  categories: [],
};

const money = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const el = {
  gatewayStatus: document.querySelector('#gatewayStatus'),
  productCount: document.querySelector('#productCount'),
  sessionStatus: document.querySelector('#sessionStatus'),
  lastSync: document.querySelector('#lastSync'),
  productsGrid: document.querySelector('#productsGrid'),
  productTemplate: document.querySelector('#productCardTemplate'),
  message: document.querySelector('#message'),
  authForm: document.querySelector('#authForm'),
  productForm: document.querySelector('#productForm'),
  logoutBtn: document.querySelector('#logoutBtn'),
  refreshBtn: document.querySelector('#refreshBtn'),
  searchInput: document.querySelector('#searchInput'),
  categoryFilter: document.querySelector('#categoryFilter'),
};

function setMessage(text, type = 'info') {
  el.message.textContent = text || '';
  el.message.className = text ? `message active ${type === 'error' ? 'error' : ''}` : 'message';
}

function updateSession() {
  el.sessionStatus.textContent = state.user ? state.user.email.split('@')[0] : 'Guest';
}

function stampSync() {
  el.lastSync.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

async function request(path, options = {}) {
  const headers = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
    ...(options.headers || {}),
  };
  const response = await fetch(path, { ...options, headers });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(payload.message || `Request failed: ${response.status}`);
  }
  return payload;
}

async function loadHealth() {
  try {
    const data = await request('/health');
    el.gatewayStatus.textContent = data.services?.redis === 'healthy' ? 'Healthy' : data.status;
  } catch (error) {
    el.gatewayStatus.textContent = 'Down';
    setMessage(error.message, 'error');
  }
}

async function loadProducts() {
  const params = new URLSearchParams();
  const search = el.searchInput.value.trim();
  const category = el.categoryFilter.value;
  if (search) params.set('search', search);
  if (category) params.set('category', category);

  const data = await request(`/api/v1/products?${params.toString()}`);
  state.products = data.data.products || [];
  el.productCount.textContent = String(data.data.pagination?.total ?? state.products.length);
  renderProducts();
  stampSync();
}

async function loadCategories() {
  try {
    const data = await request('/api/v1/products/categories');
    state.categories = data.data.categories || [];
    const current = el.categoryFilter.value;
    el.categoryFilter.innerHTML = '<option value="">All categories</option>';
    state.categories.forEach((item) => {
      const option = document.createElement('option');
      option.value = item.category;
      option.textContent = `${item.category} (${item.count})`;
      el.categoryFilter.append(option);
    });
    el.categoryFilter.value = current;
  } catch {
    state.categories = [];
  }
}

function renderProducts() {
  el.productsGrid.innerHTML = '';
  if (!state.products.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'No products yet. Add one from the left panel.';
    el.productsGrid.append(empty);
    return;
  }

  state.products.forEach((product) => {
    const card = el.productTemplate.content.firstElementChild.cloneNode(true);
    card.querySelector('h3').textContent = product.name;
    card.querySelector('.product-meta').textContent = [product.brand, product.category].filter(Boolean).join(' / ');
    card.querySelector('.badge').textContent = product.isFeatured ? 'Featured' : 'Catalog';
    card.querySelector('.description').textContent = product.shortDescription || product.description || 'No description';
    card.querySelector('.price').textContent = money.format(Number(product.price || 0));
    card.querySelector('.stock').textContent = `${product.stock || 0} in stock`;
    el.productsGrid.append(card);
  });
}

function uniqueSku(name) {
  const base = name.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 18) || 'SKU';
  return `${base}-${Date.now().toString().slice(-5)}`;
}

async function handleAuth(event) {
  event.preventDefault();
  const action = event.submitter?.value || 'login';
  const form = new FormData(el.authForm);
  const body = {
    email: form.get('email'),
    password: form.get('password'),
  };
  if (action === 'register') {
    body.firstName = form.get('firstName');
    body.lastName = form.get('lastName');
  }

  try {
    const data = await request(`/api/v1/auth/${action}`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    state.token = data.data.accessToken;
    state.user = data.data.user;
    localStorage.setItem('accessToken', state.token);
    localStorage.setItem('user', JSON.stringify(state.user));
    updateSession();
    setMessage(`${action === 'register' ? 'Registered' : 'Logged in'} as ${state.user.email}`);
  } catch (error) {
    setMessage(error.message, 'error');
  }
}

async function handleProductCreate(event) {
  event.preventDefault();
  const form = new FormData(el.productForm);
  const name = String(form.get('name')).trim();
  const body = {
    name,
    price: Number(form.get('price')),
    stock: Number(form.get('stock') || 0),
    sku: String(form.get('sku')).trim() || uniqueSku(name),
    category: String(form.get('category')).trim(),
    brand: String(form.get('brand')).trim(),
    description: String(form.get('description')).trim(),
    shortDescription: String(form.get('description')).trim().slice(0, 160),
    isFeatured: form.get('isFeatured') === 'on',
  };

  try {
    const data = await request('/api/v1/products', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    setMessage(`Added ${data.data.product.name}`);
    el.productForm.elements.sku.value = uniqueSku(name);
    await loadCategories();
    await loadProducts();
  } catch (error) {
    setMessage(error.message, 'error');
  }
}

function logout() {
  state.token = '';
  state.user = null;
  localStorage.removeItem('accessToken');
  localStorage.removeItem('user');
  updateSession();
  setMessage('Session cleared');
}

async function refreshAll() {
  try {
    await loadHealth();
    await loadCategories();
    await loadProducts();
  } catch (error) {
    setMessage(error.message, 'error');
  }
}

el.authForm.email.value = `aman+${Date.now()}@test.com`;
el.productForm.sku.value = uniqueSku(el.productForm.elements.name.value);
el.authForm.addEventListener('submit', handleAuth);
el.productForm.addEventListener('submit', handleProductCreate);
el.logoutBtn.addEventListener('click', logout);
el.refreshBtn.addEventListener('click', refreshAll);
el.searchInput.addEventListener('input', () => loadProducts().catch((error) => setMessage(error.message, 'error')));
el.categoryFilter.addEventListener('change', () => loadProducts().catch((error) => setMessage(error.message, 'error')));

updateSession();
refreshAll();
