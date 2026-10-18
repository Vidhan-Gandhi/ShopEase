// Shared helpers for Playwright tests. UI elements are selected ONLY by data-testid.
const base = require('@playwright/test');

const API = process.env.E2E_API_URL || `http://localhost:${process.env.E2E_API_PORT || '5000'}/api`;
const TOKEN_KEY = 'shopease_token';
const GUEST_CART_KEY = 'shopease_guest_cart';
const IMG = `http://localhost:${process.env.E2E_WEB_PORT || '5173'}/favicon.svg`; // served by the Vite dev server, so images really load

let ipSeq = 10 + Math.floor(Math.random() * 100);
const freshIp = () => {
  ipSeq += 1;
  return `10.77.${Math.floor(ipSeq / 250) % 250}.${(ipSeq % 250) + 1}`;
};
let seq = 0;
const uid = () => `${Date.now().toString(36)}${(++seq).toString(36)}${Math.floor(Math.random() * 1e3).toString(36)}`;
const uniqueEmail = (p = 'e2e') => `${p}.${uid()}@example.com`;

/** Playwright fixtures: every browser login request gets its own client IP so FR-033 never blocks unrelated tests. */
const test = base.test.extend({
  page: async ({ page }, use) => {
    const ip = freshIp();
    await page.route('**/api/auth/login', (route) => route.continue({ headers: { ...route.request().headers(), 'x-forwarded-for': ip } }));
    await use(page);
  },
});
const { expect } = base;

async function api(method, path, { token, body, ip } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': ip || freshIp(),
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch (e) { /* no body */ }
  return { status: res.status, body: json };
}
const must = (res, status, what) => {
  if (res.status !== status) throw new Error(`${what} failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
};

let adminCache;
async function adminToken() {
  if (!adminCache) adminCache = must(await api('POST', '/auth/login', { body: { email: 'admin@shopease.com', password: 'Admin@123' } }), 200, 'admin login').token;
  return adminCache;
}
/** ONC-001: raw token of the latest verification email to `email` (NODE_ENV=test outbox). */
async function latestToken(email) {
  const r = await api('GET', '/test/emails?to=' + encodeURIComponent(email));
  const items = (r.body && r.body.items) || [];
  if (!items.length) throw new Error('no verification email captured for ' + email);
  return items[items.length - 1].token;
}
/** Verifies the account through its captured email. */
const verifyAccount = async (email) => must(await api('POST', '/auth/verify-email', { body: { token: await latestToken(email) } }), 200, 'verify-email');
/** Signs up, verifies by email and logs in through the API. */
async function signup(o = {}) {
  const email = o.email || uniqueEmail();
  const password = o.password || 'Shop1234';
  const name = o.name || 'E2E Customer';
  must(await api('POST', '/auth/signup', { body: { name, email, password } }), 201, 'signup');
  await verifyAccount(email);
  const b = must(await api('POST', '/auth/login', { body: { email, password } }), 200, 'login after verify');
  return { token: b.token, user: b.user, email, password, name };
}
/** Signs up only; the account stays unverified. */
async function signupUnverified(o = {}) {
  const email = o.email || uniqueEmail('unv');
  const password = o.password || 'Shop1234';
  const name = o.name || 'E2E Unverified';
  must(await api('POST', '/auth/signup', { body: { name, email, password } }), 201, 'signup');
  return { email, password, name };
}
const addressBody = (o = {}) => ({ name: 'Test User', phone: '9876543210', addressLine: '12 MG Road', city: 'Pune', state: 'Maharashtra', pincode: '411001', ...o });
async function addAddress(token, o = {}) {
  return must(await api('POST', '/addresses', { token, body: addressBody(o) }), 201, 'addAddress').address;
}
/** customer who already has one saved address */
async function customerWithAddress(o = {}) {
  const c = await signup(o);
  c.address = await addAddress(c.token, { name: o.addressName || 'Home Address' });
  return c;
}
let qaCat;
async function qaCategory() {
  if (!qaCat) qaCat = must(await api('POST', '/admin/categories', { token: await adminToken(), body: { name: 'E2E Cat ' + uid() } }), 201, 'category').category;
  return qaCat;
}
async function createCategory(name) {
  return must(await api('POST', '/admin/categories', { token: await adminToken(), body: { name } }), 201, 'createCategory').category;
}
async function createProduct(o = {}) {
  const body = {
    name: 'QA' + uid() + ' Gadget', description: 'E2E product', price: 600, stock: 50, images: [IMG], featured: false, ...o,
  };
  body.category = o.category || (await qaCategory()).id;
  if (body.discountedPrice === undefined) delete body.discountedPrice;
  return must(await api('POST', '/admin/products', { token: await adminToken(), body }), 201, 'createProduct').product;
}
async function updateProduct(id, patch) {
  const cur = must(await api('GET', '/products/' + id), 200, 'getProduct').product;
  const body = { name: cur.name, description: cur.description, price: cur.price, discountedPrice: cur.discountedPrice, category: cur.category.id, stock: cur.stock, images: cur.images, featured: cur.featured, ...patch };
  return must(await api('PUT', '/admin/products/' + id, { token: await adminToken(), body }), 200, 'updateProduct').product;
}
const deleteProduct = async (id) => must(await api('DELETE', '/admin/products/' + id, { token: await adminToken() }), 200, 'deleteProduct');
const getProduct = async (id) => (await api('GET', '/products/' + id)).body.product;
const addToServerCart = async (token, productId, quantity = 1) => must(await api('POST', '/cart/items', { token, body: { productId, quantity } }), 200, 'addToCart');
async function placeOrder(customer, lines, o = {}) {
  const addressId = o.addressId || (customer.address ? customer.address.id : (await addAddress(customer.token)).id);
  for (const [p, q] of lines) await addToServerCart(customer.token, p.id, q);
  return must(await api('POST', '/orders', { token: customer.token, body: { addressId, paymentMethod: o.paymentMethod || 'COD' } }), 201, 'placeOrder').order;
}
const setStatus = async (orderId, status) => api('PATCH', `/admin/orders/${orderId}/status`, { token: await adminToken(), body: { status } });
const myOrders = async (token) => (await api('GET', '/orders', { token })).body;
const serverCart = async (token) => (await api('GET', '/cart', { token })).body;

function money(n) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
const parseMoney = (s) => Number(String(s).replace(/[^0-9.]/g, ''));
function todayIST() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).replace(/-/g, '');
}

// ---- UI helpers ----
async function setSession(page, token, path = '/') {
  await page.goto('/login');
  await page.evaluate(([k, t]) => localStorage.setItem(k, t), [TOKEN_KEY, token]);
  await page.goto(path);
}
async function setGuestCart(page, lines, path = '/cart') {
  await page.goto('/login');
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [GUEST_CART_KEY, JSON.stringify(lines.map(([p, q]) => ({ productId: p.id, quantity: q })))]);
  await page.goto(path);
}
async function uiLogin(page, email, password) {
  await page.goto('/login');
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();
}
async function uiLoginAdmin(page) {
  await setSession(page, await adminToken(), '/admin');
  await expect(page.getByTestId('dashboard-title')).toBeVisible();
}
/** Walk checkout: address -> review -> payment. Leaves the page on the payment step. */
async function toPaymentStep(page, { method } = {}) {
  await page.getByTestId('checkout-address-continue').click();
  await page.getByTestId('checkout-review-continue').click();
  await expect(page.getByTestId('checkout-step-payment')).toBeVisible();
  if (method === 'cod') await page.getByTestId('checkout-payment-cod').click();
  if (method === 'online') await page.getByTestId('checkout-payment-online').click();
}

module.exports = {
  test, expect, API, TOKEN_KEY, GUEST_CART_KEY, IMG, freshIp, uid, uniqueEmail, api, must, adminToken, signup, signupUnverified, latestToken, verifyAccount, addAddress, addressBody,
  customerWithAddress, qaCategory, createCategory, createProduct, updateProduct, deleteProduct, getProduct, addToServerCart, placeOrder,
  setStatus, myOrders, serverCart, money, parseMoney, todayIST, setSession, setGuestCart, uiLogin, uiLoginAdmin, toPaymentStep,
};
