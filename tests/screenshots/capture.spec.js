// Documentation screenshots for ShopEase (NOT tests). Selects by data-testid only.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const API = `http://localhost:${process.env.E2E_API_PORT || '5000'}/api`;
const OUT = path.resolve(__dirname, '../../../../agents/SDET/ShopEase/screenshots');
const VIEWPORTS = { desktop: { width: 1280, height: 800 }, mobile: { width: 375, height: 812 } };
const manifest = [];
let ipSeq = 40;

async function api(method, p, { token, body } = {}) {
  const res = await fetch(API + p, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `10.88.0.${++ipSeq}`, ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${p} -> ${res.status} ${JSON.stringify(json)}`);
  return json;
}
const login = (email, password) => api('POST', '/auth/login', { body: { email, password } });

async function stable(page) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('[data-testid$="-loading"]')).toHaveCount(0, { timeout: 15000 });
  // trigger lazy-loaded images by scrolling through the page, then back to top
  await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } window.scrollTo(0, 0); });
  await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 15000 }).catch(() => {});
}

async function newPage(browser, vp, token) {
  const ctx = await browser.newContext({ viewport: VIEWPORTS[vp], baseURL: `http://localhost:${process.env.E2E_WEB_PORT || '5173'}` });
  if (token) await ctx.addInitScript((t) => localStorage.setItem('shopease_token', t), token);
  const page = await ctx.newPage();
  page.__errors = [];
  page.on('pageerror', (e) => page.__errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.__errors.push('console: ' + m.text()); });
  page.on('requestfailed', (r) => page.__errors.push('requestfailed: ' + r.url() + ' ' + ((r.failure() || {}).errorText || '')));
  return { ctx, page };
}

async function shot(page, { n, role, name, vp, route, pageName, state, frs }) {
  await stable(page);
  const file = `${String(n).padStart(2, '0')}-${role}-${name}-${vp}.png`;
  fs.mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, file), fullPage: true, animations: 'disabled' });
  const info = await page.evaluate(() => ({
    text: document.body.innerText.length,
    notFound: !!document.querySelector('[data-testid="not-found"],[data-testid="not-authorised"],[data-testid="admin-blocked"],[data-testid="auth-error"]'),
    imgs: document.images.length,
    broken: [...document.images].filter((i) => !(i.complete && i.naturalWidth > 0)).map((i) => i.src),
    overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
  }));
  const notes = [];
  if (info.text < 20) notes.push('page looks blank');
  if (info.notFound) notes.push('error/not-authorised/404 element present');
  if (info.broken.length) notes.push(`${info.broken.length}/${info.imgs} images not loaded: ${info.broken.slice(0, 2).join(', ')}`);
  if (info.overflow) notes.push('horizontal overflow');
  const errs = page.__errors.splice(0);
  if (errs.length) notes.push('console/network errors: ' + errs.slice(0, 3).join(' | '));
  manifest.push({
    file, route, page: pageName, role, viewport: vp, state, frs,
    ok: notes.length === 0,
    notes: notes.join('; ') || `url ${page.url().replace(/^https?:\/\/[^/]+/, '')}; ${info.imgs} images loaded`,
  });
}

test.afterAll(() => {
  manifest.sort((a, b) => a.file.localeCompare(b.file));
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'MANIFEST.json'), JSON.stringify(manifest, null, 2));
});

test('capture documentation screenshots', async ({ browser }) => {
  const products = (await api('GET', '/products?sort=price_asc')).items;
  const inStock = products.filter((p) => p.stock >= 10);
  const detail = inStock.find((p) => p.discountedPrice) || inStock[0];
  const cartItems = [inStock[1], inStock[2]];
  const customer = await login('asha@example.com', 'Shop1234');
  const admin = await login('admin@shopease.com', 'Admin@123');

  for (const vp of ['desktop', 'mobile']) {
    const { ctx, page } = await newPage(browser, vp);
    await page.goto('/');
    await expect(page.getByTestId('home-featured-list')).toBeVisible();
    await shot(page, { n: 1, role: 'guest', name: 'home', vp, route: '/', pageName: 'Home', state: 'featured products and categories', frs: ['FR-007', 'FR-013', 'NFR-001', 'NFR-006'] });
    await page.goto('/products');
    await expect(page.getByTestId('products-list')).toBeVisible();
    await shot(page, { n: 2, role: 'guest', name: 'products', vp, route: '/products', pageName: 'Product list', state: 'page 1 of results with filters, sort and pagination', frs: ['FR-008', 'FR-009', 'FR-010', 'FR-011', 'FR-013', 'NFR-006'] });
    await page.goto('/products/' + detail.id);
    await expect(page.getByTestId('product-name')).toBeVisible();
    await shot(page, { n: 3, role: 'guest', name: 'product-detail', vp, route: '/products/:id', pageName: 'Product page', state: `in-stock product "${detail.name}"`, frs: ['FR-012', 'FR-013', 'FR-014', 'NFR-006'] });
    await ctx.close();
  }

  for (const vp of ['desktop', 'mobile']) {
    for (const it of cartItems) await api('POST', '/cart/items', { token: customer.token, body: { productId: it.id, quantity: 1 } });
    const { ctx, page } = await newPage(browser, vp, customer.token);
    const base = { role: 'customer', vp };
    await page.goto('/cart');
    await expect(page.getByTestId('cart-item')).toHaveCount(2);
    await shot(page, { ...base, n: 4, name: 'cart', route: '/cart', pageName: 'Cart', state: 'two items with totals', frs: ['FR-014', 'FR-015', 'FR-017', 'NFR-006'] });

    await page.getByTestId('cart-checkout').click();
    await expect(page.getByTestId('checkout-step-address')).toBeVisible();
    await shot(page, { ...base, n: 5, name: 'checkout-step1-address', route: '/checkout', pageName: 'Checkout', state: 'step 1 - choose delivery address', frs: ['FR-018', 'FR-004'] });
    await page.getByTestId('checkout-address-continue').click();
    await expect(page.getByTestId('checkout-step-review')).toBeVisible();
    await shot(page, { ...base, n: 5, name: 'checkout-step2-review', route: '/checkout', pageName: 'Checkout', state: 'step 2 - review order', frs: ['FR-018', 'FR-015'] });
    await page.getByTestId('checkout-review-continue').click();
    await expect(page.getByTestId('checkout-step-payment')).toBeVisible();
    await shot(page, { ...base, n: 5, name: 'checkout-step3-payment', route: '/checkout', pageName: 'Checkout', state: 'step 3 - payment method not yet chosen (Place order disabled)', frs: ['FR-019'] });
    await page.getByTestId('checkout-payment-online').check();
    await shot(page, { ...base, n: 5, name: 'checkout-step3-payment-online', route: '/checkout', pageName: 'Checkout', state: 'step 3 - Online payment selected', frs: ['FR-019'] });
    await page.getByTestId('checkout-place-order').click();
    await expect(page.getByTestId('checkout-mock-payment')).toBeVisible();
    await shot(page, { ...base, n: 5, name: 'checkout-mock-payment', route: '/checkout', pageName: 'Checkout', state: 'mock online payment page', frs: ['FR-019'] });
    await page.getByTestId('checkout-mock-success').click();
    await expect(page.getByTestId('confirmation-title')).toBeVisible();
    await shot(page, { ...base, n: 6, name: 'order-confirmation', route: '/order-confirmation/:id', pageName: 'Order confirmation', state: 'order placed (online payment, simulated)', frs: ['FR-020', 'FR-019', 'FR-024', 'NFR-006'] });
    await ctx.close();
  }

  for (const vp of ['desktop', 'mobile']) {
    const { ctx, page } = await newPage(browser, vp, admin.token);
    await page.goto('/admin');
    await expect(page.getByTestId('dashboard-total-orders')).toBeVisible();
    await shot(page, { n: 7, role: 'admin', name: 'dashboard', vp, route: '/admin', pageName: 'Admin dashboard', state: 'totals, low stock, recent orders', frs: ['FR-025', 'FR-006', 'NFR-006'] });
    await ctx.close();
  }
});
