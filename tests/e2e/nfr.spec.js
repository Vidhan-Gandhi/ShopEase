const h = require('./helpers');
const { test, expect } = h;

const VIEWPORTS = [{ width: 375, height: 800 }, { width: 768, height: 900 }, { width: 1280, height: 800 }];

const noHorizontalScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
async function settle(page) {
  await page.waitForLoadState('networkidle');
}

test.describe('NFR-001 responsive design', () => {
  test('TC-281 storefront pages have no horizontal page scroll at 375px, 768px and 1280px', async ({ page }) => {
    const p = await h.createProduct({ stock: 10, price: 250, name: 'Responsive Product With A Fairly Long Name ' + h.uid() });
    const pages = ['/', '/products', '/products/' + p.id, '/cart', '/login', '/signup'];
    const bad = [];
    for (const vp of VIEWPORTS) {
      await page.setViewportSize(vp);
      for (const url of pages) {
        await page.goto(url);
        await settle(page);
        if (!(await noHorizontalScroll(page))) bad.push(`${url} @${vp.width}`);
      }
    }
    expect(bad).toEqual([]);
  });

  test('TC-284 customer pages and admin pages have no horizontal page scroll at 375px and 768px (admin tables may scroll inside their own container)', async ({ page }) => {
    const p = await h.createProduct({ stock: 10, price: 250 });
    const c = await h.customerWithAddress();
    const order = await h.placeOrder(c, [[p, 1]]);
    await h.addToServerCart(c.token, p.id, 1);
    const bad = [];
    for (const vp of VIEWPORTS.slice(0, 2)) {
      await page.setViewportSize(vp);
      await h.setSession(page, c.token, '/profile');
      for (const url of ['/profile', '/profile/addresses', '/profile/password', '/orders', '/orders/' + order.id, '/cart', '/checkout']) {
        await page.goto(url);
        await settle(page);
        if (!(await noHorizontalScroll(page))) bad.push(`${url} @${vp.width}`);
      }
      await h.setSession(page, await h.adminToken(), '/admin');
      for (const url of ['/admin', '/admin/products', '/admin/products/new', '/admin/categories', '/admin/orders', '/admin/orders/' + order.id]) {
        await page.goto(url);
        await settle(page);
        if (!(await noHorizontalScroll(page))) bad.push(`${url} @${vp.width}`);
      }
    }
    expect(bad).toEqual([]);
  });

  test('TC-282 at 375px a menu button reaches the navigation and the product grid has fewer columns than at 1280px', async ({ page }) => {
    const columns = async () => page.evaluate(() => {
      const tops = [...document.querySelectorAll('[data-testid="products-item"]')].map((el) => [Math.round(el.getBoundingClientRect().top), el.getBoundingClientRect().left]);
      const first = Math.min(...tops.map((t) => t[0]));
      return tops.filter((t) => Math.abs(t[0] - first) < 4).length;
    });
    await page.setViewportSize(VIEWPORTS[0]);
    await page.goto('/products');
    await expect(page.getByTestId('products-item').first()).toBeVisible();
    await expect(page.getByTestId('header-menu-toggle')).toBeVisible();
    await page.getByTestId('header-menu-toggle').click();
    await expect(page.getByTestId('header-products')).toBeVisible();
    await expect(page.getByTestId('header-cart')).toBeVisible();
    await page.getByTestId('header-products').click();
    await expect(page).toHaveURL(/\/products/);
    const mobile = await columns();
    await page.setViewportSize(VIEWPORTS[2]);
    await page.goto('/products');
    await expect(page.getByTestId('products-item').first()).toBeVisible();
    const desktop = await columns();
    expect(mobile).toBeLessThanOrEqual(2);
    expect(desktop).toBeGreaterThanOrEqual(3);
    expect(mobile).toBeLessThan(desktop);
    await expect(page.getByTestId('header-menu-toggle')).toBeHidden();
    await expect(page.getByTestId('header-products')).toBeVisible();
  });

  test('TC-283 buttons and links used on mobile are at least 40x40 CSS px at 375px', async ({ page }) => {
    const small = [];
    const check = async (id, nth = 0) => {
      const box = await page.getByTestId(id).nth(nth).boundingBox();
      if (!box) small.push(`${id}: not visible`);
      else if (box.width < 39.5 || box.height < 39.5) small.push(`${id}: ${Math.round(box.width)}x${Math.round(box.height)}`);
    };
    await page.setViewportSize(VIEWPORTS[0]);
    await page.goto('/products');
    await expect(page.getByTestId('products-item').first()).toBeVisible();
    await check('header-menu-toggle');
    await check('products-apply');
    await check('products-item-add');
    await check('products-pagination-next');
    await page.getByTestId('header-menu-toggle').click();
    await check('header-products');
    await check('header-cart');
    await check('header-login');
    await page.goto('/login');
    await check('login-submit');
    await page.goto('/signup');
    await check('signup-submit');
    const p = await h.createProduct({ stock: 10 });
    await h.setGuestCart(page, [[p, 1]]);
    await check('cart-item-update');
    await check('cart-item-remove');
    await check('cart-checkout');
    expect(small).toEqual([]);
  });
});

test.describe('NFR-002 loading, empty and error states', () => {
  test('TC-285 listing and orders pages show a loading indicator, a readable error with Retry (network failure and HTTP 500), and submit buttons are disabled while a request runs', async ({ page }) => {
    // loading
    await page.route('**/api/products?*', async (r) => {
      await new Promise((res) => setTimeout(res, 1500));
      await r.continue();
    });
    await page.goto('/products');
    await expect(page.getByTestId('products-loading')).toBeVisible();
    await expect(page.getByTestId('products-item').first()).toBeVisible({ timeout: 15000 });
    await page.unroute('**/api/products?*');
    // network error then retry
    await page.route('**/api/products?*', (r) => r.abort());
    await page.goto('/products');
    await expect(page.getByTestId('products-error')).toBeVisible();
    await expect(page.getByTestId('products-error-retry')).toBeVisible();
    await page.unroute('**/api/products?*');
    await page.getByTestId('products-error-retry').click();
    await expect(page.getByTestId('products-item').first()).toBeVisible();
    // HTTP 500: generic readable message, no stack / undefined
    await page.route('**/api/products?*', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Something went wrong. Please try again later.' }) }));
    await page.goto('/products');
    await expect(page.getByTestId('products-error-message')).toContainText('Something went wrong');
    const text = await page.locator('body').innerText();
    expect(text).not.toContain('undefined');
    expect(text).not.toMatch(/at .*\.js|stack/i);
    await page.unroute('**/api/products?*');
    // orders page error for a customer
    const c = await h.signup();
    await page.route('**/api/orders?*', (r) => r.abort());
    await h.setSession(page, c.token, '/orders');
    await expect(page.getByTestId('orders-error')).toBeVisible();
    await expect(page.getByTestId('orders-error-retry')).toBeVisible();
    await page.unroute('**/api/orders?*');
    await page.getByTestId('orders-error-retry').click();
    await expect(page.getByTestId('orders-empty')).toBeVisible();
    // double submission prevention
    await page.evaluate((k) => localStorage.removeItem(k), h.TOKEN_KEY);
    await page.route('**/api/auth/login', async (r) => {
      await new Promise((res) => setTimeout(res, 1500));
      await r.continue({ headers: { ...r.request().headers(), 'x-forwarded-for': h.freshIp() } });
    });
    await page.goto('/login');
    await page.getByTestId('login-email').fill(c.email);
    await page.getByTestId('login-password').fill(c.password);
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('login-submit')).toBeDisabled();
    await expect(page.getByTestId('header-user-name')).toBeVisible({ timeout: 15000 });
  });
});

test.describe('NFR-006 currency formatting', () => {
  test('TC-286 prices use the ₹ symbol, Indian digit grouping and 2 decimals in listing, details and cart; totals have no float artifacts', async ({ page }) => {
    const big = await h.createProduct({ price: 129999, stock: 10, name: 'Big Price ' + h.uid() });
    const small = await h.createProduct({ price: 1234.5, stock: 10, name: 'Small Price ' + h.uid() });
    const tenth = await h.createProduct({ price: 0.1, stock: 10, name: 'Tenth ' + h.uid() });
    await page.goto('/products?q=' + encodeURIComponent(big.name));
    await expect(page.getByTestId('products-item-price')).toHaveText('₹1,29,999.00');
    await page.goto('/products?q=' + encodeURIComponent(small.name));
    await expect(page.getByTestId('products-item-price')).toHaveText('₹1,234.50');
    await page.goto('/products/' + big.id);
    await expect(page.getByTestId('product-price')).toHaveText('₹1,29,999.00');
    await h.setGuestCart(page, [[big, 1], [small, 1]]);
    await expect(page.getByTestId('cart-subtotal')).toHaveText('₹1,31,233.50');
    await expect(page.getByTestId('cart-delivery')).toContainText('Free');
    await expect(page.getByTestId('cart-grand-total')).toHaveText('₹1,31,233.50');
    await h.setGuestCart(page, [[tenth, 3]]);
    await expect(page.getByTestId('cart-subtotal')).toHaveText('₹0.30');
    await expect(page.getByTestId('cart-delivery')).toHaveText('₹49.00');
    await expect(page.getByTestId('cart-grand-total')).toHaveText('₹49.30');
  });
});

test.describe('NFR-009 accessibility basics', () => {
  test('TC-287 every form input has a label or aria-label and validation messages are associated with their input', async ({ page }) => {
    const c = await h.customerWithAddress();
    const unlabeled = [];
    const scan = async (url, setup) => {
      await page.goto(url);
      if (setup) await setup();
      const list = await page.evaluate(() => [...document.querySelectorAll('input, select, textarea')]
        .filter((el) => el.type !== 'hidden' && el.offsetParent !== null)
        .filter((el) => !(el.labels && el.labels.length) && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby'))
        .map((el) => el.getAttribute('data-testid') || el.name || el.type));
      list.forEach((x) => unlabeled.push(`${url}: ${x}`));
    };
    await scan('/login');
    await scan('/signup');
    await scan('/products');
    await h.setSession(page, c.token, '/profile');
    await scan('/profile');
    await scan('/profile/password');
    await scan('/profile/addresses', () => page.getByTestId('addresses-add').click());
    await h.setSession(page, await h.adminToken(), '/admin/products/new');
    await scan('/admin/products/new');
    await scan('/admin/categories');
    expect(unlabeled).toEqual([]);
    // validation messages are tied to their inputs
    await page.evaluate((k) => localStorage.removeItem(k), h.TOKEN_KEY);
    await page.goto('/login');
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('login-email-error')).toBeVisible();
    const assoc = await page.evaluate(() => {
      const out = {};
      for (const [input, err] of [['login-email', 'login-email-error'], ['login-password', 'login-password-error']]) {
        const el = document.querySelector(`[data-testid="${input}"]`);
        const e = document.querySelector(`[data-testid="${err}"]`);
        const ids = (el.getAttribute('aria-describedby') || '').split(/\s+/);
        out[input] = ids.includes(e.id) && !!e.id;
      }
      return out;
    });
    expect(assoc).toEqual({ 'login-email': true, 'login-password': true });
  });

  test('TC-288 product images have non-empty alt text equal to the product name', async ({ page }) => {
    const p = await h.createProduct({ stock: 10, featured: true, name: 'Alt Text Product ' + h.uid(), images: [`${h.IMG}?a=1`, `${h.IMG}?a=2`] });
    await page.goto('/products?q=' + encodeURIComponent(p.name));
    await expect(page.getByTestId('products-item-image')).toHaveAttribute('alt', p.name);
    await page.goto('/products/' + p.id);
    await expect(page.getByTestId('product-main-image')).toHaveAttribute('alt', /\S/);
    const thumbAlts = await page.getByTestId('product-thumb').evaluateAll((els) => els.map((el) => (el.getAttribute('alt') || el.querySelector('img')?.getAttribute('alt') || el.getAttribute('aria-label') || '')));
    thumbAlts.forEach((a) => expect(a.trim().length).toBeGreaterThan(0));
    const mainAlt = await page.getByTestId('product-main-image').getAttribute('alt');
    expect(mainAlt).toContain(p.name);
    await h.setGuestCart(page, [[p, 1]]);
    await expect(page.getByTestId('cart-item-image')).toHaveAttribute('alt', /\S/);
    await page.goto('/');
    const missing = await page.evaluate(() => [...document.querySelectorAll('img')].filter((i) => !(i.getAttribute('alt') || '').trim()).length);
    expect(missing).toBe(0);
  });

  test('TC-289 each page has exactly one h1 and a meaningful, different document title', async ({ page }) => {
    const p = await h.createProduct({ stock: 10 });
    const c = await h.signup();
    const titles = new Set();
    const bad = [];
    const visit = async (url) => {
      await page.goto(url);
      await settle(page);
      const r = await page.evaluate(() => ({ h1: document.querySelectorAll('h1').length, title: document.title.trim() }));
      if (r.h1 !== 1) bad.push(`${url}: ${r.h1} h1`);
      if (r.title.length < 3 || /^(vite|react app|untitled)/i.test(r.title)) bad.push(`${url}: title "${r.title}"`);
      titles.add(r.title);
    };
    for (const url of ['/', '/products', '/products/' + p.id, '/cart', '/login', '/signup', '/does-not-exist']) await visit(url);
    await h.setSession(page, c.token, '/profile');
    for (const url of ['/profile', '/profile/password', '/profile/addresses', '/orders']) await visit(url);
    await h.setSession(page, await h.adminToken(), '/admin');
    for (const url of ['/admin', '/admin/products', '/admin/categories', '/admin/orders']) await visit(url);
    expect(bad).toEqual([]);
    expect(titles.size).toBeGreaterThanOrEqual(10);
  });

  test('TC-290 the app is usable by keyboard: tab order reaches the login form, focus is visible, confirmation dialogs trap focus and close on Esc', async ({ page }) => {
    const c = await h.customerWithAddress();
    await page.goto('/login');
    const focusedTestId = () => page.evaluate(() => (document.activeElement && document.activeElement.getAttribute('data-testid')) || '');
    let reached = false;
    const outlines = [];
    for (let i = 0; i < 20 && !reached; i++) {
      await page.keyboard.press('Tab');
      if ((await focusedTestId()) === 'login-email') reached = true;
      outlines.push(await page.evaluate(() => {
        const s = getComputedStyle(document.activeElement);
        return (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || (s.boxShadow && s.boxShadow !== 'none');
      }));
    }
    expect(reached).toBe(true);
    expect(outlines.every(Boolean)).toBe(true);
    await page.keyboard.type(c.email);
    await page.keyboard.press('Tab');
    expect(await focusedTestId()).toBe('login-password');
    await page.keyboard.type(c.password);
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('header-user-name')).toBeVisible();
    // dialog focus trap
    await page.goto('/profile/addresses');
    await page.getByTestId('addresses-delete').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('confirm-dialog')).toBeVisible();
    for (let i = 0; i < 8; i++) {
      const inside = await page.evaluate(() => !!document.activeElement && !!document.activeElement.closest('[data-testid="confirm-dialog"]'));
      expect(inside).toBe(true);
      await page.keyboard.press('Tab');
    }
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('confirm-dialog')).toHaveCount(0);
    await expect(page.getByTestId('addresses-item')).toHaveCount(1);
  });

  test('TC-291 normal text has a contrast ratio of at least 4.5:1 on the main pages', async ({ page }) => {
    const measure = (testids) => page.evaluate((ids) => {
      const toRgba = (css) => {
        const cv = document.createElement('canvas');
        cv.width = cv.height = 1;
        const ctx = cv.getContext('2d', { willReadFrequently: true });
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = '#000';
        ctx.fillStyle = css;
        ctx.fillRect(0, 0, 1, 1);
        const d = ctx.getImageData(0, 0, 1, 1).data;
        return [d[0], d[1], d[2], d[3] / 255];
      };
      const lum = ([r, g, b]) => {
        const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const bgOf = (el) => {
        let node = el;
        while (node) {
          const c = toRgba(getComputedStyle(node).backgroundColor);
          if (c[3] > 0.99) return c;
          node = node.parentElement;
        }
        return [255, 255, 255, 1];
      };
      const res = {};
      for (const id of ids) {
        const el = document.querySelector(`[data-testid="${id}"]`);
        if (!el) { res[id] = null; continue; }
        const fg = toRgba(getComputedStyle(el).color);
        const bg = bgOf(el);
        const [l1, l2] = [lum(fg), lum(bg)].sort((a, b) => b - a);
        res[id] = Number(((l1 + 0.05) / (l2 + 0.05)).toFixed(2));
      }
      return res;
    }, testids);
    const failures = [];
    const run = async (url, ids) => {
      await page.goto(url);
      await settle(page);
      const r = await measure(ids);
      for (const [id, ratio] of Object.entries(r)) if (ratio !== null && ratio < 4.5) failures.push(`${url} ${id}: ${ratio}`);
      const missing = Object.entries(r).filter(([, v]) => v === null).map(([k]) => k);
      expect([url, missing]).toEqual([url, []]);
    };
    await run('/', ['header-home', 'header-products', 'header-cart', 'header-login', 'home-title', 'home-item-name', 'home-item-price', 'home-item-category']);
    await run('/products', ['products-item-name', 'products-item-price', 'products-item-stock', 'products-total', 'products-apply']);
    await run('/login', ['login-submit', 'login-signup-link', 'login-email-error'].slice(0, 2));
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('login-email-error')).toBeVisible();
    const err = await measure(['login-email-error', 'login-password-error']);
    Object.entries(err).forEach(([id, ratio]) => { if (ratio < 4.5) failures.push(`/login ${id}: ${ratio}`); });
    expect(failures).toEqual([]);
  });

  test('TC-292 password inputs are masked (type=password) on login, sign-up and change-password forms', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByTestId('login-password')).toHaveAttribute('type', 'password');
    await page.goto('/signup');
    await expect(page.getByTestId('signup-password')).toHaveAttribute('type', 'password');
    const c = await h.signup();
    await h.setSession(page, c.token, '/profile/password');
    for (const id of ['password-current', 'password-new', 'password-confirm']) {
      await expect(page.getByTestId(id)).toHaveAttribute('type', 'password');
    }
  });
});

test.describe('NFR-003 / security in the UI', () => {
  test('TC-296 HTML/script text in names is rendered as plain text and never executes', async ({ page }) => {
    const payload = '<img src=x onerror="window.__xss=1">';
    const c = await h.signup({ name: payload });
    const p = await h.createProduct({ stock: 10, name: 'Xss ' + payload + h.uid() });
    await h.setSession(page, c.token, '/profile');
    await expect(page.getByTestId('header-user-name')).toContainText('<img src=x');
    await expect(page.getByTestId('profile-name')).toHaveValue(payload);
    await page.goto('/products?q=' + encodeURIComponent(p.name));
    await expect(page.getByTestId('products-item-name')).toContainText('<img src=x');
    await page.goto('/products/' + p.id);
    await expect(page.getByTestId('product-name')).toContainText('<img src=x');
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
    expect(await page.locator('img[src="x"]').count()).toBe(0);
  });
});
