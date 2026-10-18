// Shared helpers for API tests. Every call gets a fresh client IP (X-Forwarded-For) so the FR-033
// login limiter never interferes with unrelated tests.
const request = require('supertest');
const jwt = require('../../backend/node_modules/jsonwebtoken');
const mongoose = require('../../backend/node_modules/mongoose');
const app = require('../../backend/src/app');
const limiter = require('../../backend/src/utils/loginRateLimiter');

let ipCounter = 0;
const freshIp = () => {
  ipCounter += 1;
  return `10.${Math.floor(ipCounter / 65536) % 256}.${Math.floor(ipCounter / 256) % 256}.${ipCounter % 256}`;
};

function call(method, url, { token, body, ip, headers = {} } = {}) {
  let r = request(app)[method](url).set('X-Forwarded-For', ip || freshIp());
  if (token) r = r.set('Authorization', 'Bearer ' + token);
  Object.entries(headers).forEach(([k, v]) => (r = r.set(k, v)));
  if (body !== undefined) r = r.send(body);
  return r;
}
const get = (u, o) => call('get', u, o);
const post = (u, o) => call('post', u, o);
const put = (u, o) => call('put', u, o);
const patch = (u, o) => call('patch', u, o);
const del = (u, o) => call('delete', u, o);

let seq = 0;
const uid = () => `${Date.now().toString(36)}${(++seq).toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
const uniqueEmail = (p = 'qa') => `${p}.${uid()}@example.com`;

const SEED = {
  admin: { email: 'admin@shopease.com', password: 'Admin@123' },
  asha: { email: 'asha@example.com', password: 'Shop1234' },
  ravi: { email: 'ravi@example.com', password: 'Shop1234' },
};

async function login(email, password) {
  const res = await post('/api/auth/login', { body: { email, password } });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

let adminCache = null;
async function adminToken() {
  if (!adminCache) adminCache = (await login(SEED.admin.email, SEED.admin.password)).token;
  return adminCache;
}

/** ONC-001: the captured verification email(s) for an address (NODE_ENV=test outbox, via the test endpoint). */
async function emailsFor(email) {
  const res = await get('/api/test/emails?to=' + encodeURIComponent(email));
  if (res.status !== 200) throw new Error('emailsFor failed: ' + res.status + JSON.stringify(res.body));
  return res.body.items;
}
/** Raw token from the most recent verification email sent to `email`. */
async function latestToken(email) {
  const items = await emailsFor(email);
  if (!items.length) throw new Error('no verification email captured for ' + email);
  return items[items.length - 1].token;
}
/** Verifies an account through its emailed link (ONC-001) and returns the verify response. */
async function verifyAccount(email) {
  return post('/api/auth/verify-email', { body: { token: await latestToken(email) } });
}
/** Signs up, verifies through the captured email, logs in; returns { token, user, email, password }. */
async function signupCustomer(overrides = {}) {
  const email = overrides.email || uniqueEmail();
  const password = overrides.password || 'Shop1234';
  const res = await post('/api/auth/signup', { body: { name: overrides.name || 'QA Customer', email, password } });
  if (res.status !== 201) throw new Error('signup failed: ' + res.status + JSON.stringify(res.body));
  const v = await verifyAccount(email);
  if (v.status !== 200) throw new Error('verify failed: ' + v.status + JSON.stringify(v.body));
  const lg = await login(email, password);
  return { token: lg.token, user: lg.user, email, password };
}
/** Signs up and returns the response only (account stays unverified). */
const signupRaw = (name, email, password = 'Shop1234', extra = {}) => post('/api/auth/signup', { body: { name, email, password, ...extra } });

const addressBody = (o = {}) => ({
  name: 'Test User', phone: '9876543210', addressLine: '12 MG Road', city: 'Pune', state: 'Maharashtra', pincode: '411001', ...o,
});
async function addAddress(token, o = {}) {
  const res = await post('/api/addresses', { token, body: addressBody(o) });
  if (res.status !== 201) throw new Error('addAddress failed ' + res.status + JSON.stringify(res.body));
  return res.body.address;
}

let qaCategory = null;
async function qaCategoryId() {
  if (!qaCategory) qaCategory = (await createCategory('QA Cat ' + uid())).id;
  return qaCategory;
}
async function createCategory(name) {
  const res = await post('/api/admin/categories', { token: await adminToken(), body: { name } });
  if (res.status !== 201) throw new Error('createCategory failed ' + res.status + JSON.stringify(res.body));
  return res.body.category;
}
async function createProduct(o = {}) {
  const body = {
    name: o.name || `QA Product ${uid()}`,
    description: 'QA test product',
    price: 500,
    stock: 50,
    images: ['https://example.com/img1.jpg'],
    featured: false,
    ...o,
    category: o.category || (await qaCategoryId()),
  };
  if (body.discountedPrice === undefined) delete body.discountedPrice;
  const res = await post('/api/admin/products', { token: await adminToken(), body });
  if (res.status !== 201) throw new Error('createProduct failed ' + res.status + JSON.stringify(res.body));
  return res.body.product;
}
async function updateProduct(id, patchObj) {
  const cur = (await get('/api/products/' + id)).body.product;
  const body = {
    name: cur.name, description: cur.description, price: cur.price, discountedPrice: cur.discountedPrice,
    category: cur.category.id, stock: cur.stock, images: cur.images, featured: cur.featured, ...patchObj,
  };
  const res = await put('/api/admin/products/' + id, { token: await adminToken(), body });
  if (res.status !== 200) throw new Error('updateProduct failed ' + res.status + JSON.stringify(res.body));
  return res.body.product;
}
const deleteProduct = async (id) => del('/api/admin/products/' + id, { token: await adminToken() });
const addToCart = (token, productId, quantity = 1) => post('/api/cart/items', { token, body: { productId, quantity } });
const placeOrderRaw = (token, body) => post('/api/orders', { token, body });

/** Places an order for `customer` with lines [[product, qty], ...]; creates an address if none given. */
async function placeOrderFor(customer, lines, { paymentMethod = 'COD', addressId } = {}) {
  let aId = addressId;
  if (!aId) aId = (await addAddress(customer.token)).id;
  for (const [product, qty] of lines) {
    const r = await addToCart(customer.token, product.id, qty);
    if (r.status !== 200) throw new Error('addToCart failed ' + r.status + JSON.stringify(r.body));
  }
  const res = await placeOrderRaw(customer.token, { addressId: aId, paymentMethod });
  if (res.status !== 201) throw new Error('placeOrder failed ' + res.status + JSON.stringify(res.body));
  return res.body.order;
}
const adminStatus = async (orderId, status) =>
  patch(`/api/admin/orders/${orderId}/status`, { token: await adminToken(), body: { status } });
const stockOf = async (id) => (await get('/api/products/' + id)).body.product.stock;

function todayIST() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).replace(/-/g, '');
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const db = () => mongoose.connection.db;
const signToken = (payload, opts = {}, secret = 'test_secret') => jwt.sign(payload, secret, opts);

/** Recursively checks whether a JSON value contains a key that looks like a password / hash. */
function hasSecretKey(v) {
  if (Array.isArray(v)) return v.some(hasSecretKey);
  if (v && typeof v === 'object') {
    return Object.keys(v).some((k) => /pass(word)?|hash/i.test(k)) || Object.values(v).some(hasSecretKey);
  }
  return false;
}

module.exports = {
  app, limiter, jwt, mongoose, get, post, put, patch, del, call, uid, uniqueEmail, SEED, login, adminToken, signupCustomer, signupRaw, emailsFor, latestToken, verifyAccount,
  addressBody, addAddress, createCategory, createProduct, updateProduct, deleteProduct, addToCart, placeOrderRaw,
  placeOrderFor, adminStatus, stockOf, todayIST, sleep, db, signToken, hasSecretKey, freshIp, qaCategoryId,
};
