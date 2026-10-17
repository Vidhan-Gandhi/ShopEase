const h = require('./helpers');
const { test, expect } = h;

async function addOnDetail(page, p, times = 1) {
  await page.goto('/products/' + p.id);
  for (let i = 0; i < times; i++) {
    await page.getByTestId('product-add-to-cart').click();
    await expect(page.getByTestId('header-cart-count')).toContainText(String(i + 1));
  }
}

test.describe('FR-014 / FR-015 guest cart (UI)', () => {
  test('TC-238 adding the same product twice gives one cart line of quantity 2 and a header count of 2', async ({ page }) => {
    const p = await h.createProduct({ stock: 10, price: 250 });
    await addOnDetail(page, p, 2);
    await page.goto('/cart');
    await expect(page.getByTestId('cart-item')).toHaveCount(1);
    await expect(page.getByTestId('cart-item-quantity')).toHaveValue('2');
    await expect(page.getByTestId('cart-item-total')).toContainText('₹500.00');
    await expect(page.getByTestId('header-cart-count')).toContainText('2');
  });

  test('TC-239 changing quantity to 5 updates line and totals immediately; invalid quantity "abc" is rejected and 5 is kept', async ({ page }) => {
    const p = await h.createProduct({ stock: 10, price: 120 });
    await h.setGuestCart(page, [[p, 2]]);
    await expect(page.getByTestId('cart-item')).toHaveCount(1);
    await page.getByTestId('cart-item-quantity').fill('5');
    await page.getByTestId('cart-item-update').click();
    await expect(page.getByTestId('cart-item-total')).toContainText('₹600.00');
    await expect(page.getByTestId('cart-subtotal')).toContainText('₹600.00');
    await expect(page.getByTestId('header-cart-count')).toContainText('5');
    await page.getByTestId('cart-item-quantity').fill('abc');
    await page.getByTestId('cart-item-update').click();
    await expect(page.getByTestId('cart-item-error')).toContainText('Quantity must be a whole number of at least 1');
    await expect(page.getByTestId('cart-item-quantity')).toHaveValue('5');
    for (const bad of ['0', '-1', '2.5']) {
      await page.getByTestId('cart-item-quantity').fill(bad);
      await page.getByTestId('cart-item-update').click();
      await expect(page.getByTestId('cart-item-error')).toBeVisible();
      await expect(page.getByTestId('cart-item-quantity')).toHaveValue('5');
    }
  });

  test('TC-240 increasing quantity above stock (4 available) shows "Only 4 available" and keeps 4', async ({ page }) => {
    const p = await h.createProduct({ stock: 4, price: 100 });
    await h.setGuestCart(page, [[p, 4]]);
    await page.getByTestId('cart-item-quantity').fill('5');
    await page.getByTestId('cart-item-update').click();
    await expect(page.getByTestId('cart-item-error')).toContainText('Only 4 available');
    await expect(page.getByTestId('cart-item-quantity')).toHaveValue('4');
  });

  test('TC-241 removing the only line shows "Your cart is empty" with a Continue shopping link and no totals or checkout', async ({ page }) => {
    const p = await h.createProduct({ stock: 10, price: 300 });
    await h.setGuestCart(page, [[p, 1]]);
    await expect(page.getByTestId('cart-summary')).toBeVisible();
    await page.getByTestId('cart-item-remove').click();
    await expect(page.getByTestId('cart-empty')).toContainText('Your cart is empty');
    await expect(page.getByTestId('cart-continue')).toBeVisible();
    await expect(page.getByTestId('cart-summary')).toHaveCount(0);
    await expect(page.getByTestId('cart-checkout')).toHaveCount(0);
    await expect(page.getByTestId('cart-delivery')).toHaveCount(0);
  });

  test('TC-242 delivery is ₹49.00 below ₹499 (498.99 -> total ₹547.99) and "Free" at exactly ₹499.00; line total 199.50 x 3 = ₹598.50', async ({ page }) => {
    const below = await h.createProduct({ price: 498.99, stock: 10 });
    await h.setGuestCart(page, [[below, 1]]);
    await expect(page.getByTestId('cart-subtotal')).toContainText('₹498.99');
    await expect(page.getByTestId('cart-delivery')).toContainText('₹49.00');
    await expect(page.getByTestId('cart-grand-total')).toContainText('₹547.99');
    const exact = await h.createProduct({ price: 499, stock: 10 });
    await h.setGuestCart(page, [[exact, 1]]);
    await expect(page.getByTestId('cart-delivery')).toContainText('Free');
    await expect(page.getByTestId('cart-grand-total')).toContainText('₹499.00');
    const disc = await h.createProduct({ price: 600, discountedPrice: 450, stock: 10 });
    await h.setGuestCart(page, [[disc, 1]]);
    await expect(page.getByTestId('cart-subtotal')).toContainText('₹450.00');
    await expect(page.getByTestId('cart-delivery')).toContainText('₹49.00');
    await expect(page.getByTestId('cart-grand-total')).toContainText('₹499.00');
    const unit = await h.createProduct({ price: 199.5, stock: 10 });
    await h.setGuestCart(page, [[unit, 3]]);
    await expect(page.getByTestId('cart-item-total')).toContainText('₹598.50');
  });

  test('TC-243 the guest cart survives a reload and a browser restart (stored in the browser)', async ({ page, browser }) => {
    const p = await h.createProduct({ stock: 10, price: 250 });
    await addOnDetail(page, p, 2);
    await page.reload();
    await expect(page.getByTestId('header-cart-count')).toContainText('2');
    const state = await page.context().storageState();
    const ctx = await browser.newContext({ storageState: state });
    const page2 = await ctx.newPage();
    await page2.goto('/cart');
    await expect(page2.getByTestId('cart-item')).toHaveCount(1);
    await expect(page2.getByTestId('cart-item-quantity')).toHaveValue('2');
    await ctx.close();
  });

  test('TC-247 a guest cart line whose product was deleted is removed with "<name> is no longer available" and excluded from totals', async ({ page }) => {
    const keep = await h.createProduct({ price: 300, stock: 10 });
    const gone = await h.createProduct({ price: 900, stock: 10, name: 'Deleted Soon ' + h.uid() });
    await h.setGuestCart(page, [[keep, 1], [gone, 1]], '/');
    await h.deleteProduct(gone.id);
    await page.goto('/cart');
    await expect(page.getByTestId('cart-item')).toHaveCount(1);
    await expect(page.getByTestId('cart-subtotal')).toContainText('₹300.00');
    await expect(page.locator('body')).toContainText('no longer available');
    await expect(page.locator('body')).toContainText(gone.name);
  });

  test('TC-294 a guest cart line whose product went out of stock is flagged as unavailable and excluded from totals', async ({ page }) => {
    const keep = await h.createProduct({ price: 300, stock: 10 });
    const oos = await h.createProduct({ price: 900, stock: 10, name: 'Sold Out Soon ' + h.uid() });
    await h.setGuestCart(page, [[keep, 1], [oos, 1]], '/');
    await h.updateProduct(oos.id, { stock: 0 });
    await page.goto('/cart');
    await expect(page.getByTestId('cart-unavailable')).toContainText(oos.name);
    await expect(page.getByTestId('cart-item')).toHaveCount(1);
    await expect(page.getByTestId('cart-subtotal')).toContainText('₹300.00');
  });
});

test.describe('FR-016 / FR-017 merge and server cart (UI)', () => {
  test('TC-244 logging in merges the guest cart (1 x B) with the server cart (1 x C) and clears the browser cart', async ({ page }) => {
    const c = await h.signup();
    const B = await h.createProduct({ stock: 10, price: 250, name: 'Merge B ' + h.uid() });
    const C = await h.createProduct({ stock: 10, price: 260, name: 'Merge C ' + h.uid() });
    await h.addToServerCart(c.token, C.id, 1);
    await h.setGuestCart(page, [[B, 1]], '/login');
    await h.uiLogin(page, c.email, c.password);
    await expect(page.getByTestId('header-user-name')).toBeVisible();
    await page.goto('/cart');
    await expect(page.getByTestId('cart-item')).toHaveCount(2);
    await expect(page.getByTestId('cart-list')).toContainText(B.name);
    await expect(page.getByTestId('cart-list')).toContainText(C.name);
    const stored = await page.evaluate((k) => localStorage.getItem(k), h.GUEST_CART_KEY);
    expect(!stored || JSON.parse(stored).length === 0).toBe(true);
    const server = await h.serverCart(c.token);
    expect(server.items.map((i) => i.quantity).sort()).toEqual([1, 1]);
  });

  test('TC-245 merging 3 x A (guest) into 4 x A (server) with stock 5 gives 5 x A and a notice that the quantity was limited by stock', async ({ page }) => {
    const c = await h.signup();
    const A = await h.createProduct({ stock: 5, price: 100, name: 'Merge Cap ' + h.uid() });
    await h.addToServerCart(c.token, A.id, 4);
    await h.setGuestCart(page, [[A, 3]], '/login');
    await h.uiLogin(page, c.email, c.password);
    await expect(page.getByTestId('merge-notices')).toContainText('stock limit');
    await page.goto('/cart');
    await expect(page.getByTestId('cart-item-quantity')).toHaveValue('5');
    expect((await h.serverCart(c.token)).items[0].quantity).toBe(5);
  });

  test('TC-246 a logged-in cart stays intact after clearing the cart-related local storage and is the same in another browser', async ({ page, browser }) => {
    const c = await h.signup();
    const A = await h.createProduct({ stock: 10, price: 150, name: 'Server Cart ' + h.uid() });
    await h.setSession(page, c.token, '/products/' + A.id);
    await page.getByTestId('product-add-to-cart').click();
    await expect(page.getByTestId('header-cart-count')).toContainText('1');
    await page.getByTestId('product-add-to-cart').click();
    await expect(page.getByTestId('header-cart-count')).toContainText('2');
    await page.evaluate((k) => localStorage.removeItem(k), h.GUEST_CART_KEY);
    await page.reload();
    await page.goto('/cart');
    await expect(page.getByTestId('cart-item-quantity')).toHaveValue('2');
    const ctx = await browser.newContext();
    const other = await ctx.newPage();
    await other.goto('/login');
    await other.getByTestId('login-email').fill(c.email);
    await other.getByTestId('login-password').fill(c.password);
    await other.getByTestId('login-submit').click();
    await expect(other.getByTestId('header-user-name')).toBeVisible();
    await other.goto('/cart');
    await expect(other.getByTestId('cart-item-quantity')).toHaveValue('2');
    await ctx.close();
  });

  test('TC-248 signing up with a non-empty guest cart turns it into the new customer\'s server cart', async ({ page }) => {
    const A = await h.createProduct({ stock: 10, price: 220, name: 'Signup Merge ' + h.uid() });
    await h.setGuestCart(page, [[A, 2]], '/signup');
    await page.getByTestId('signup-name').fill('New Shopper');
    await page.getByTestId('signup-email').fill(h.uniqueEmail('shopper'));
    await page.getByTestId('signup-password').fill('Shop1234');
    await page.getByTestId('signup-submit').click();
    await expect(page.getByTestId('header-user-name')).toBeVisible();
    await expect(page.getByTestId('header-cart-count')).toContainText('2');
    const token = await page.evaluate((k) => localStorage.getItem(k), h.TOKEN_KEY);
    const server = await h.serverCart(token);
    expect(server.items).toHaveLength(1);
    expect(server.items[0].quantity).toBe(2);
    const stored = await page.evaluate((k) => localStorage.getItem(k), h.GUEST_CART_KEY);
    expect(!stored || JSON.parse(stored).length === 0).toBe(true);
  });
});
