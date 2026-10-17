const h = require('./helpers');
const { test, expect } = h;

const ORDER_NO = /SE-(\d{8})-[A-Z0-9]{4}/;

/** customer with an address and a server cart of [[product, qty]] who is logged in at /checkout */
async function atCheckout(page, lines, opts = {}) {
  const c = opts.noAddress ? await h.signup() : await h.customerWithAddress();
  for (const [p, q] of lines) await h.addToServerCart(c.token, p.id, q);
  await h.setSession(page, c.token, '/checkout');
  return c;
}
const place = (page) => page.getByTestId('checkout-place-order').click();

test.describe('FR-018..FR-020 checkout and order placement (UI)', () => {
  test('TC-249 full Cash on Delivery checkout: confirmation shows an order number with today\'s date, stock drops, cart is empty, order is listed', async ({ page }) => {
    const p = await h.createProduct({ price: 600, stock: 10, name: 'COD Item ' + h.uid() });
    const c = await atCheckout(page, [[p, 2]]);
    await expect(page.getByTestId('checkout-address-item')).toHaveCount(1);
    await expect(page.getByTestId('checkout-address-radio')).toBeChecked();
    await h.toPaymentStep(page, { method: 'cod' });
    await place(page);
    await expect(page).toHaveURL(/\/order-confirmation\//);
    const number = (await page.getByTestId('confirmation-order-number').innerText()).trim();
    const m = number.match(ORDER_NO);
    expect(m).not.toBeNull();
    expect(m[1]).toBe(h.todayIST());
    await expect(page.getByTestId('confirmation-status')).toContainText('Placed');
    expect((await h.getProduct(p.id)).stock).toBe(8);
    expect((await h.serverCart(c.token)).items).toEqual([]);
    await page.goto('/orders');
    await expect(page.getByTestId('orders-item').first()).toContainText(m[0]);
    await expect(page.getByTestId('header-cart-count')).not.toContainText(/[1-9]/);
  });

  test('TC-250 online payment: mock page shows the grand total; "Success" places the order as "Online payment" / "Paid (simulated)"', async ({ page }) => {
    const p = await h.createProduct({ price: 300, stock: 10 });
    const c = await atCheckout(page, [[p, 1]]);
    await h.toPaymentStep(page, { method: 'online' });
    expect((await h.myOrders(c.token)).total).toBe(0);
    await place(page);
    await expect(page.getByTestId('checkout-mock-payment')).toBeVisible();
    await expect(page.getByTestId('checkout-mock-amount')).toContainText('₹349.00');
    await expect(page.getByTestId('checkout-mock-success')).toBeVisible();
    await expect(page.getByTestId('checkout-mock-failure')).toBeVisible();
    expect((await h.myOrders(c.token)).total).toBe(0); // no order exists before the mock result
    await page.getByTestId('checkout-mock-success').click();
    await expect(page).toHaveURL(/\/order-confirmation\//);
    await expect(page.getByTestId('confirmation-payment-method')).toContainText('Online payment');
    await expect(page.getByTestId('confirmation-payment-status')).toContainText('Paid (simulated)');
    expect((await h.myOrders(c.token)).total).toBe(1);
  });

  test('TC-251 online payment "Failure": "Payment failed. Your order was not placed", no order, stock and cart unchanged, link back to checkout', async ({ page }) => {
    const p = await h.createProduct({ price: 300, stock: 10 });
    const c = await atCheckout(page, [[p, 2]]);
    await h.toPaymentStep(page, { method: 'online' });
    await place(page);
    await page.getByTestId('checkout-mock-failure').click();
    await expect(page.getByTestId('checkout-payment-failed')).toContainText('Payment failed. Your order was not placed');
    await expect(page.getByTestId('checkout-back-to-checkout')).toBeVisible();
    expect((await h.myOrders(c.token)).total).toBe(0);
    expect((await h.getProduct(p.id)).stock).toBe(10);
    const cart = await h.serverCart(c.token);
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0].quantity).toBe(2);
    await page.getByTestId('checkout-back-to-checkout').click();
    await expect(page.getByTestId('checkout-title')).toBeVisible();
  });

  test('TC-252 payment step offers exactly "Cash on Delivery" and "Online payment"; Place order is disabled until one is chosen', async ({ page }) => {
    const p = await h.createProduct({ price: 600, stock: 10 });
    await atCheckout(page, [[p, 1]]);
    await h.toPaymentStep(page, {});
    const step = page.getByTestId('checkout-step-payment');
    await expect(step.getByRole('radio')).toHaveCount(2);
    await expect(step).toContainText('Cash on Delivery');
    await expect(step).toContainText('Online payment');
    await expect(page.getByTestId('checkout-place-order')).toBeDisabled();
    await page.getByTestId('checkout-payment-cod').click();
    await expect(page.getByTestId('checkout-place-order')).toBeEnabled();
  });

  test('TC-253 continuing without a delivery address shows "Select or add a delivery address"', async ({ page }) => {
    const p = await h.createProduct({ price: 600, stock: 10 });
    await atCheckout(page, [[p, 1]], { noAddress: true });
    await page.getByTestId('checkout-address-continue').click();
    await expect(page.getByTestId('checkout-address-error')).toContainText('Select or add a delivery address');
    await expect(page.getByTestId('checkout-step-review')).toHaveCount(0);
  });

  test('TC-254 adding an address inline validates it, saves it to the address book and selects it', async ({ page }) => {
    const p = await h.createProduct({ price: 600, stock: 10 });
    const c = await atCheckout(page, [[p, 1]], { noAddress: true });
    // with no saved address the inline form is shown straight away
    await expect(page.getByTestId('checkout-address-form')).toBeVisible();
    await page.getByTestId('checkout-address-form-submit').click();
    await expect(page.getByTestId('checkout-address-form-pincode-error')).toBeVisible();
    await expect(page.getByTestId('checkout-address-form-phone-error')).toBeVisible();
    const f = (id, v) => page.getByTestId('checkout-address-form-' + id).fill(v);
    await f('name', 'Inline Person');
    await f('phone', '9123456780');
    await f('address-line', '22 Park Street');
    await f('city', 'Kolkata');
    await f('state', 'West Bengal');
    await f('pincode', '700016');
    await page.getByTestId('checkout-address-form-submit').click();
    await expect(page.getByTestId('checkout-address-item')).toHaveCount(1);
    await expect(page.getByTestId('checkout-address-radio')).toBeChecked();
    const saved = (await h.api('GET', '/addresses', { token: c.token })).body.items;
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ name: 'Inline Person', pincode: '700016', isDefault: true });
    await page.getByTestId('checkout-address-continue').click();
    await expect(page.getByTestId('checkout-step-review')).toBeVisible();
    await expect(page.getByTestId('checkout-review-address')).toContainText('Inline Person');
  });

  test('TC-255 a guest clicking Checkout is sent to login and, after logging in (cart merged), returned to checkout', async ({ page }) => {
    const c = await h.customerWithAddress();
    const p = await h.createProduct({ price: 600, stock: 10, name: 'Guest Checkout ' + h.uid() });
    await h.setGuestCart(page, [[p, 1]]);
    await page.getByTestId('cart-checkout').click();
    await expect(page).toHaveURL(/\/login/);
    await page.getByTestId('login-email').fill(c.email);
    await page.getByTestId('login-password').fill(c.password);
    await page.getByTestId('login-submit').click();
    await expect(page).toHaveURL(/\/checkout/);
    await expect(page.getByTestId('checkout-title')).toBeVisible();
    await page.getByTestId('checkout-address-continue').click();
    await expect(page.getByTestId('checkout-review-list')).toContainText(p.name);
  });

  test('TC-256 opening /checkout with an empty cart redirects to the cart showing "Your cart is empty"', async ({ page }) => {
    const c = await h.customerWithAddress();
    await h.setSession(page, c.token, '/checkout');
    await expect(page).toHaveURL(/\/cart/);
    await expect(page.getByTestId('cart-empty')).toContainText('Your cart is empty');
  });

  test('TC-262 the review step totals equal the cart page totals (subtotal, delivery, grand total)', async ({ page }) => {
    const p = await h.createProduct({ price: 300, discountedPrice: 249.5, stock: 10 });
    await atCheckout(page, [[p, 1]]);
    await page.goto('/cart');
    const cart = {
      sub: await page.getByTestId('cart-subtotal').innerText(),
      del: await page.getByTestId('cart-delivery').innerText(),
      grand: await page.getByTestId('cart-grand-total').innerText(),
    };
    expect(cart.grand).toContain('₹298.50');
    await page.goto('/checkout');
    await page.getByTestId('checkout-address-continue').click();
    await expect(page.getByTestId('checkout-step-review')).toBeVisible();
    await expect(page.getByTestId('checkout-subtotal')).toHaveText(cart.sub);
    await expect(page.getByTestId('checkout-delivery')).toHaveText(cart.del);
    await expect(page.getByTestId('checkout-grand-total')).toHaveText(cart.grand);
    await expect(page.getByTestId('checkout-review-item-price')).toContainText('₹249.50');
  });

  test('TC-261 the confirmation page shows order number, items, address, payment method, grand total and View order / Continue shopping links', async ({ page }) => {
    const p = await h.createProduct({ price: 600, stock: 10, name: 'Confirm Item ' + h.uid() });
    const c = await atCheckout(page, [[p, 1]]);
    await h.toPaymentStep(page, { method: 'cod' });
    await place(page);
    await expect(page).toHaveURL(/\/order-confirmation\//);
    await expect(page.getByTestId('confirmation-title')).toBeVisible();
    await expect(page.getByTestId('confirmation-order-number')).toContainText(ORDER_NO);
    await expect(page.getByTestId('confirmation-items')).toContainText(p.name);
    await expect(page.getByTestId('confirmation-address')).toContainText('Home Address');
    await expect(page.getByTestId('confirmation-payment-method')).toContainText('Cash on Delivery');
    await expect(page.getByTestId('confirmation-grand-total')).toContainText('₹600.00');
    await expect(page.getByTestId('confirmation-continue')).toBeVisible();
    const orders = await h.myOrders(c.token);
    await page.getByTestId('confirmation-view-order').click();
    await expect(page).toHaveURL(new RegExp('/orders/' + orders.items[0].id));
    await expect(page.getByTestId('order-number')).toContainText(orders.items[0].orderNumber);
  });
});

test.describe('FR-021 re-check before placing (UI)', () => {
  test('TC-257 price changed during review: no order, notice "Price of X changed from ₹500.00 to ₹550.00", updated totals, second Place order confirms', async ({ page }) => {
    const p = await h.createProduct({ price: 500, stock: 10, name: 'Price Shift ' + h.uid() });
    const c = await atCheckout(page, [[p, 1]]);
    await page.getByTestId('checkout-address-continue').click();
    await expect(page.getByTestId('checkout-review-item-price')).toContainText('₹500.00');
    await h.updateProduct(p.id, { price: 550 });
    await page.getByTestId('checkout-review-continue').click();
    await page.getByTestId('checkout-payment-cod').click();
    await place(page);
    await expect(page.getByTestId('checkout-changes')).toContainText(`Price of ${p.name} changed from ₹500.00 to ₹550.00`);
    expect((await h.myOrders(c.token)).total).toBe(0);
    await expect(page.getByTestId('checkout-step-review')).toBeVisible();
    await expect(page.getByTestId('checkout-review-item-price')).toContainText('₹550.00');
    await expect(page.getByTestId('checkout-grand-total')).toContainText('₹550.00');
    await page.getByTestId('checkout-review-continue').click();
    await page.getByTestId('checkout-payment-cod').click();
    await place(page);
    await expect(page).toHaveURL(/\/order-confirmation\//);
    const orders = await h.myOrders(c.token);
    expect(orders.total).toBe(1);
    expect(orders.items[0].grandTotal).toBe(550);
  });

  test('TC-258 stock dropped from 3 to 2: no order, "Only 2 of X available", quantity adjusted to 2 for re-confirmation', async ({ page }) => {
    const p = await h.createProduct({ price: 600, stock: 10, name: 'Stock Drop ' + h.uid() });
    const c = await atCheckout(page, [[p, 3]]);
    await page.getByTestId('checkout-address-continue').click();
    await expect(page.getByTestId('checkout-review-item-quantity')).toContainText('3');
    await h.updateProduct(p.id, { stock: 2 });
    await page.getByTestId('checkout-review-continue').click();
    await page.getByTestId('checkout-payment-cod').click();
    await place(page);
    await expect(page.getByTestId('checkout-changes')).toContainText(`Only 2 of ${p.name} available`);
    expect((await h.myOrders(c.token)).total).toBe(0);
    await expect(page.getByTestId('checkout-review-item-quantity')).toContainText('2');
    expect((await h.serverCart(c.token)).items[0].quantity).toBe(2);
    expect((await h.getProduct(p.id)).stock).toBe(2);
  });

  test('TC-259 a product that became unavailable is flagged and removed from the review; with no lines left the customer is sent to the empty cart', async ({ page }) => {
    const A = await h.createProduct({ price: 600, stock: 10, name: 'Vanishing A ' + h.uid() });
    const B = await h.createProduct({ price: 700, stock: 10, name: 'Remaining B ' + h.uid() });
    const c = await atCheckout(page, [[A, 1], [B, 1]]);
    await page.getByTestId('checkout-address-continue').click();
    await h.deleteProduct(A.id);
    await page.getByTestId('checkout-review-continue').click();
    await page.getByTestId('checkout-payment-cod').click();
    await place(page);
    await expect(page.getByTestId('checkout-changes')).toContainText(`${A.name} is no longer available`);
    await expect(page.getByTestId('checkout-review-item')).toHaveCount(1);
    await expect(page.getByTestId('checkout-review-list')).toContainText(B.name);
    expect((await h.myOrders(c.token)).total).toBe(0);
    await h.updateProduct(B.id, { stock: 0 });
    await page.getByTestId('checkout-review-continue').click();
    await page.getByTestId('checkout-payment-cod').click();
    await place(page);
    await expect(page).toHaveURL(/\/cart/);
    await expect(page.getByTestId('cart-empty')).toContainText('Your cart is empty');
    expect((await h.myOrders(c.token)).total).toBe(0);
  });

  test('TC-260 online payment: when the re-check finds a change the mock payment page is not shown until the customer re-confirms', async ({ page }) => {
    const p = await h.createProduct({ price: 500, stock: 10, name: 'Online Shift ' + h.uid() });
    const c = await atCheckout(page, [[p, 1]]);
    await page.getByTestId('checkout-address-continue').click();
    await h.updateProduct(p.id, { price: 520 });
    await page.getByTestId('checkout-review-continue').click();
    await page.getByTestId('checkout-payment-online').click();
    await place(page);
    await expect(page.getByTestId('checkout-changes')).toContainText('changed from ₹500.00 to ₹520.00');
    await expect(page.getByTestId('checkout-mock-payment')).toHaveCount(0);
    expect((await h.myOrders(c.token)).total).toBe(0);
    await page.getByTestId('checkout-review-continue').click();
    await page.getByTestId('checkout-payment-online').click();
    await place(page);
    await expect(page.getByTestId('checkout-mock-payment')).toBeVisible();
    await expect(page.getByTestId('checkout-mock-amount')).toContainText('₹520.00');
  });

  test('TC-298 nothing changed: no warning is shown and the order is placed on the first click', async ({ page }) => {
    const p = await h.createProduct({ price: 600, stock: 10 });
    const c = await atCheckout(page, [[p, 1]]);
    await h.toPaymentStep(page, { method: 'cod' });
    await place(page);
    await expect(page).toHaveURL(/\/order-confirmation\//);
    await expect(page.getByTestId('checkout-changes')).toHaveCount(0);
    expect((await h.myOrders(c.token)).total).toBe(1);
  });
});
