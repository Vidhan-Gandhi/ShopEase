const h = require('./helpers');
const { test, expect } = h;

test.describe('FR-022 order history and details (UI)', () => {
  test('TC-263 "My orders" lists orders newest first with number, date, total and status; the detail page shows all order data and history', async ({ page }) => {
    const p = await h.createProduct({ price: 400, stock: 30, name: 'History Item ' + h.uid() });
    const c = await h.customerWithAddress({ addressName: 'History Address' });
    const o1 = await h.placeOrder(c, [[p, 1]]);
    const o2 = await h.placeOrder(c, [[p, 1]]);
    const o3 = await h.placeOrder(c, [[p, 2]]);
    await h.setSession(page, c.token, '/orders');
    await expect(page.getByTestId('orders-item')).toHaveCount(3);
    const numbers = (await page.getByTestId('orders-item-number').allInnerTexts()).map((x) => x.trim());
    expect(numbers).toEqual([o3.orderNumber, o2.orderNumber, o1.orderNumber]);
    const first = page.getByTestId('orders-item').first();
    await expect(first.getByTestId('orders-item-total')).toContainText('₹800.00');
    await expect(first.getByTestId('orders-item-status')).toContainText('Placed');
    await expect(first.getByTestId('orders-item-date')).not.toBeEmpty();
    await first.getByTestId('orders-item-number').click();
    await expect(page).toHaveURL(new RegExp('/orders/' + o3.id));
    await expect(page.getByTestId('order-number')).toContainText(o3.orderNumber);
    await expect(page.getByTestId('order-status')).toContainText('Placed');
    await expect(page.getByTestId('order-payment-method')).toContainText('Cash on Delivery');
    await expect(page.getByTestId('order-payment-status')).toContainText('Pending (pay on delivery)');
    await expect(page.getByTestId('order-items')).toContainText(p.name);
    await expect(page.getByTestId('order-item-unit-price')).toContainText('₹400.00');
    await expect(page.getByTestId('order-item-quantity')).toContainText('2');
    await expect(page.getByTestId('order-subtotal')).toContainText('₹800.00');
    await expect(page.getByTestId('order-delivery')).toContainText('Free');
    await expect(page.getByTestId('order-grand-total')).toContainText('₹800.00');
    await expect(page.getByTestId('order-address')).toContainText('History Address');
    await expect(page.getByTestId('order-history-item')).toHaveCount(1);
    await expect(page.getByTestId('order-history-item')).toContainText('Placed');
    await expect(page.getByTestId('order-history-time')).not.toBeEmpty();
  });

  test('TC-264 a customer without orders sees "You have not placed any orders yet" and a Start shopping link', async ({ page }) => {
    const c = await h.signup();
    await h.setSession(page, c.token, '/orders');
    await expect(page.getByTestId('orders-empty')).toContainText('You have not placed any orders yet');
    await expect(page.getByTestId('orders-start-shopping')).toBeVisible();
    await page.getByTestId('orders-start-shopping').click();
    await expect(page).toHaveURL(/\/products|\/$/);
  });

  test("TC-265 opening another customer's order or an unknown order id shows \"Order not found\" and no order data", async ({ page }) => {
    const p = await h.createProduct({ price: 600, stock: 10, name: 'Private Item ' + h.uid() });
    const owner = await h.customerWithAddress();
    const order = await h.placeOrder(owner, [[p, 1]]);
    const x = await h.signup();
    await h.setSession(page, x.token, '/orders/' + order.id);
    await expect(page.getByTestId('order-not-found')).toContainText('Order not found');
    await expect(page.locator('body')).not.toContainText(order.orderNumber);
    await expect(page.locator('body')).not.toContainText(p.name);
    await page.goto('/orders/507f1f77bcf86cd799439011');
    await expect(page.getByTestId('order-not-found')).toContainText('Order not found');
    await page.goto('/orders/zzzz');
    await expect(page.getByTestId('order-not-found')).toContainText('Order not found');
  });
});

test.describe('FR-023 / FR-024 cancel and status history (UI)', () => {
  test('TC-266 cancelling a Placed order: Cancel in the dialog keeps it, the confirm button cancels it, stock returns once and the history gets a Cancelled entry', async ({ page }) => {
    const p = await h.createProduct({ price: 600, stock: 10 });
    const c = await h.customerWithAddress();
    const order = await h.placeOrder(c, [[p, 2]]);
    expect((await h.getProduct(p.id)).stock).toBe(8);
    await h.setSession(page, c.token, '/orders/' + order.id);
    await page.getByTestId('order-cancel').click();
    await expect(page.getByTestId('confirm-dialog')).toBeVisible();
    await page.getByTestId('confirm-dialog-cancel').click();
    await expect(page.getByTestId('confirm-dialog')).toHaveCount(0);
    await expect(page.getByTestId('order-status')).toContainText('Placed');
    expect((await h.getProduct(p.id)).stock).toBe(8);
    await page.getByTestId('order-cancel').click();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('confirm-dialog')).toHaveCount(0);
    await expect(page.getByTestId('order-status')).toContainText('Placed');
    await page.getByTestId('order-cancel').click();
    await page.getByTestId('confirm-dialog-confirm').click();
    await expect(page.getByTestId('order-status')).toContainText('Cancelled');
    await expect(page.getByTestId('order-cancel')).toHaveCount(0);
    await expect(page.getByTestId('order-history-item')).toHaveCount(2);
    await expect(page.getByTestId('order-history-item').nth(1)).toContainText('Cancelled');
    expect((await h.getProduct(p.id)).stock).toBe(10);
  });

  test('TC-267 an order that is Confirmed (or later) has no cancel button, and the history lists Placed, Confirmed, Shipped in order', async ({ page }) => {
    const p = await h.createProduct({ price: 600, stock: 10 });
    const c = await h.customerWithAddress();
    const order = await h.placeOrder(c, [[p, 1]]);
    expect((await h.setStatus(order.id, 'Confirmed')).status).toBe(200);
    expect((await h.setStatus(order.id, 'Shipped')).status).toBe(200);
    await h.setSession(page, c.token, '/orders/' + order.id);
    await expect(page.getByTestId('order-status')).toContainText('Shipped');
    await expect(page.getByTestId('order-cancel')).toHaveCount(0);
    const hist = await page.getByTestId('order-history-item').allInnerTexts();
    expect(hist).toHaveLength(3);
    expect(hist[0]).toContain('Placed');
    expect(hist[1]).toContain('Confirmed');
    expect(hist[2]).toContain('Shipped');
    await expect(page.getByTestId('order-history-time')).toHaveCount(3);
  });
});
