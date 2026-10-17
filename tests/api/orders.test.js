const h = require('../support/helpers');

const ORDER_NO = /^SE-\d{8}-[A-Z0-9]{4}$/;
const cartOf = async (token) => (await h.get('/api/cart', { token })).body;
const ordersOf = async (token) => (await h.get('/api/orders', { token })).body;

/** customer + address + cart with [[product, qty]] ready for checkout */
async function ready(lines, o = {}) {
  const c = o.customer || (await h.signupCustomer());
  const addr = o.address || (await h.addAddress(c.token));
  for (const [p, q] of lines) {
    const r = await h.addToCart(c.token, p.id, q);
    if (r.status !== 200) throw new Error('addToCart ' + r.status + JSON.stringify(r.body));
  }
  return { c, addr };
}
const reviewOf = (cart) => cart.items.map((i) => ({ productId: i.productId, unitPrice: i.unitPrice, quantity: i.quantity }));

describe('FR-020 place order', () => {
  test('TC-094 COD order: 201, status Placed, stock reduced, cart emptied, order number SE-<today>-XXXX, snapshot fields', async () => {
    const p = await h.createProduct({ name: 'Order Item ' + h.uid(), price: 400, stock: 10, images: ['https://example.com/o.jpg'] });
    const { c, addr } = await ready([[p, 2]]);
    const res = await h.placeOrderRaw(c.token, { addressId: addr.id, paymentMethod: 'COD' });
    expect(res.status).toBe(201);
    const o = res.body.order;
    expect(o.orderNumber).toMatch(ORDER_NO);
    expect(o.orderNumber.split('-')[1]).toBe(h.todayIST());
    expect(o.status).toBe('Placed');
    expect(o.paymentMethod).toBe('Cash on Delivery');
    expect(o.paymentStatus).toBe('Pending (pay on delivery)');
    expect(o.items).toHaveLength(1);
    expect(o.items[0]).toMatchObject({ name: p.name, image: 'https://example.com/o.jpg', unitPrice: 400, quantity: 2, lineTotal: 800 });
    expect(o).toMatchObject({ subtotal: 800, deliveryCharge: 0, grandTotal: 800 });
    expect(o.address).toMatchObject({ name: addr.name, phone: addr.phone, addressLine: addr.addressLine, city: addr.city, state: addr.state, pincode: addr.pincode });
    expect(await h.stockOf(p.id)).toBe(8);
    expect((await cartOf(c.token)).items).toEqual([]);
  });

  test('TC-093 after a successful order the customer cart is empty (server cart cleared)', async () => {
    const p = await h.createProduct({ price: 600, stock: 10 });
    const { c, addr } = await ready([[p, 1]]);
    expect((await cartOf(c.token)).itemCount).toBe(1);
    await h.placeOrderRaw(c.token, { addressId: addr.id, paymentMethod: 'COD' });
    const cart = await cartOf(c.token);
    expect(cart).toMatchObject({ items: [], itemCount: 0, grandTotal: 0 });
  });

  test('TC-095 two orders placed the same day have different order numbers', async () => {
    const p = await h.createProduct({ price: 600, stock: 20 });
    const c = await h.signupCustomer();
    const a = await h.placeOrderFor(c, [[p, 1]]);
    const b = await h.placeOrderFor(c, [[p, 1]]);
    expect(a.orderNumber).toMatch(ORDER_NO);
    expect(b.orderNumber).toMatch(ORDER_NO);
    expect(a.orderNumber).not.toBe(b.orderNumber);
    expect(a.id).not.toBe(b.id);
  });

  test('TC-096 two customers buying the last unit at the same time: exactly one succeeds, the other gets 409 "is out of stock", stock is 0', async () => {
    const p = await h.createProduct({ name: 'Last One ' + h.uid(), price: 600, stock: 1 });
    const x = await ready([[p, 1]]);
    const y = await ready([[p, 1]]);
    const [rx, ry] = await Promise.all([
      h.placeOrderRaw(x.c.token, { addressId: x.addr.id, paymentMethod: 'COD' }),
      h.placeOrderRaw(y.c.token, { addressId: y.addr.id, paymentMethod: 'COD' }),
    ]);
    expect([rx.status, ry.status].sort()).toEqual([201, 409]);
    const loser = rx.status === 409 ? rx : ry;
    expect(loser.body.message).toContain(`${p.name} is out of stock`);
    expect(await h.stockOf(p.id)).toBe(0);
    const winners = (await ordersOf(x.c.token)).total + (await ordersOf(y.c.token)).total;
    expect(winners).toBe(1);
  });

  test('TC-097 the order keeps name, image and unit price after the product is edited and then deleted', async () => {
    const p = await h.createProduct({ name: 'Snapshot Item ' + h.uid(), price: 700, stock: 10, images: ['https://example.com/snap.jpg'] });
    const c = await h.signupCustomer();
    const order = await h.placeOrderFor(c, [[p, 1]]);
    await h.updateProduct(p.id, { name: 'Renamed Item', price: 900, images: ['https://example.com/other.jpg'] });
    let res = await h.get('/api/orders/' + order.id, { token: c.token });
    expect(res.body.order.items[0]).toMatchObject({ name: p.name, image: 'https://example.com/snap.jpg', unitPrice: 700, quantity: 1 });
    await h.deleteProduct(p.id);
    res = await h.get('/api/orders/' + order.id, { token: c.token });
    expect(res.status).toBe(200);
    expect(res.body.order.items[0]).toMatchObject({ name: p.name, image: 'https://example.com/snap.jpg', unitPrice: 700 });
    expect(res.body.order.grandTotal).toBe(700);
  });

  test('TC-098 empty cart -> 400; address of another customer / unknown address -> 404; no order and no stock change', async () => {
    const p = await h.createProduct({ price: 600, stock: 10 });
    const c = await h.signupCustomer();
    const mine = await h.addAddress(c.token);
    const empty = await h.placeOrderRaw(c.token, { addressId: mine.id, paymentMethod: 'COD' });
    expect(empty.status).toBe(400);
    expect(empty.body.message).toBe('Your cart is empty');
    await h.addToCart(c.token, p.id, 2);
    const other = await h.signupCustomer();
    const theirs = await h.addAddress(other.token);
    for (const addressId of [theirs.id, '507f1f77bcf86cd799439011']) {
      const res = await h.placeOrderRaw(c.token, { addressId, paymentMethod: 'COD' });
      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Address not found');
    }
    const bad = await h.placeOrderRaw(c.token, { addressId: 'xyz', paymentMethod: 'COD' });
    expect([400, 404]).toContain(bad.status);
    expect(await h.stockOf(p.id)).toBe(10);
    expect((await ordersOf(c.token)).total).toBe(0);
    expect((await cartOf(c.token)).itemCount).toBe(2);
  });

  test('TC-108 client-sent prices, totals and items are ignored: totals are recomputed on the server', async () => {
    const p = await h.createProduct({ price: 300, stock: 10 });
    const { c, addr } = await ready([[p, 1]]);
    const res = await h.placeOrderRaw(c.token, {
      addressId: addr.id, paymentMethod: 'COD', subtotal: 1, deliveryCharge: 0, grandTotal: 1, total: 1,
      items: [{ productId: p.id, unitPrice: 1, quantity: 99, lineTotal: 1 }],
    });
    expect(res.status).toBe(201);
    expect(res.body.order).toMatchObject({ subtotal: 300, deliveryCharge: 49, grandTotal: 349 });
    expect(res.body.order.items[0]).toMatchObject({ unitPrice: 300, quantity: 1, lineTotal: 300 });
  });

  test('TC-109 userId / user / status fields in the order body are ignored: order belongs to the caller and starts Placed', async () => {
    const p = await h.createProduct({ price: 600, stock: 10 });
    const { c, addr } = await ready([[p, 1]]);
    const other = await h.signupCustomer();
    const res = await h.placeOrderRaw(c.token, { addressId: addr.id, paymentMethod: 'COD', userId: other.user.id, user: other.user.id, status: 'Delivered' });
    expect(res.status).toBe(201);
    expect(res.body.order.status).toBe('Placed');
    expect((await ordersOf(c.token)).total).toBe(1);
    expect((await ordersOf(other.token)).total).toBe(0);
    expect((await h.get('/api/orders/' + res.body.order.id, { token: other.token })).status).toBe(404);
  });

  test('TC-159 userId / user fields in cart requests are ignored: the authenticated user is used', async () => {
    const x = await h.signupCustomer();
    const y = await h.signupCustomer();
    const p = await h.createProduct({ stock: 10 });
    const res = await h.post('/api/cart/items', { token: x.token, body: { productId: p.id, quantity: 1, userId: y.user.id, user: y.user.id } });
    expect(res.status).toBe(200);
    expect((await cartOf(x.token)).itemCount).toBe(1);
    expect((await cartOf(y.token)).itemCount).toBe(0);
    const merge = await h.post('/api/cart/merge', { token: x.token, body: { items: [], userId: y.user.id } });
    expect(merge.status).toBe(200);
    expect((await cartOf(y.token)).itemCount).toBe(0);
  });
});

describe('FR-019 payment methods', () => {
  test('TC-099 ONLINE payment order is stored as "Online payment" with status "Paid (simulated)"', async () => {
    const p = await h.createProduct({ price: 600, stock: 10 });
    const c = await h.signupCustomer();
    const o = await h.placeOrderFor(c, [[p, 1]], { paymentMethod: 'ONLINE' });
    expect(o.paymentMethod).toBe('Online payment');
    expect(o.paymentStatus).toBe('Paid (simulated)');
    expect(o.status).toBe('Placed');
  });

  test('TC-100 invalid payment method ("card", "cod", object) returns 400 "Invalid payment method" on /orders and /orders/check', async () => {
    const p = await h.createProduct({ price: 600, stock: 10 });
    const { c, addr } = await ready([[p, 1]]);
    for (const paymentMethod of ['card', 'cod', 'Cash on Delivery', 123, { $ne: '' }]) {
      for (const url of ['/api/orders', '/api/orders/check']) {
        const res = await h.post(url, { token: c.token, body: { addressId: addr.id, paymentMethod } });
        expect(res.status).toBe(400);
        expect(res.body.message).toBe('Invalid payment method');
      }
    }
    expect(await h.stockOf(p.id)).toBe(10);
    expect((await ordersOf(c.token)).total).toBe(0);
  });

  test('TC-101 missing addressId / paymentMethod / empty body return 400 with per-field errors', async () => {
    const p = await h.createProduct({ price: 600, stock: 10 });
    const { c } = await ready([[p, 1]]);
    const res = await h.placeOrderRaw(c.token, {});
    expect(res.status).toBe(400);
    expect(res.body.errors.map((e) => e.field)).toEqual(expect.arrayContaining(['addressId', 'paymentMethod']));
    const noAddr = await h.placeOrderRaw(c.token, { paymentMethod: 'COD' });
    expect(noAddr.status).toBe(400);
    const objAddr = await h.placeOrderRaw(c.token, { addressId: { $gt: '' }, paymentMethod: 'COD' });
    expect(objAddr.status).toBe(400);
  });
});

describe('FR-021 re-check before placing', () => {
  test('TC-102 POST /orders/check with nothing changed returns 200 {ok:true, cart} and creates no order or stock change', async () => {
    const p = await h.createProduct({ price: 600, stock: 10 });
    const { c, addr } = await ready([[p, 2]]);
    const res = await h.post('/api/orders/check', { token: c.token, body: { addressId: addr.id, paymentMethod: 'ONLINE', reviewedItems: [{ productId: p.id, unitPrice: 600, quantity: 2 }] } });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.cart.itemCount).toBe(2);
    expect((await ordersOf(c.token)).total).toBe(0);
    expect(await h.stockOf(p.id)).toBe(10);
  });

  test('TC-103 price changed after review: 409 "Price of X changed from ₹500.00 to ₹550.00", no order, updated cart; confirming again succeeds', async () => {
    const p = await h.createProduct({ name: 'Price Shift ' + h.uid(), price: 500, stock: 10 });
    const { c, addr } = await ready([[p, 1]]);
    const reviewed = reviewOf(await cartOf(c.token));
    await h.updateProduct(p.id, { price: 550 });
    const msg = `Price of ${p.name} changed from ₹500.00 to ₹550.00`;
    const check = await h.post('/api/orders/check', { token: c.token, body: { addressId: addr.id, paymentMethod: 'COD', reviewedItems: reviewed } });
    expect(check.status).toBe(409);
    expect(check.body.message).toContain(msg);
    expect(check.body.changes).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'price', productId: p.id, oldUnitPrice: 500, newUnitPrice: 550 })]));
    expect(check.body.cart.items[0].unitPrice).toBe(550);
    expect(check.body.cart.subtotal).toBe(550);
    const direct = await h.placeOrderRaw(c.token, { addressId: addr.id, paymentMethod: 'COD', reviewedItems: reviewed });
    expect(direct.status).toBe(409);
    expect(direct.body.message).toContain(msg);
    expect((await ordersOf(c.token)).total).toBe(0);
    expect(await h.stockOf(p.id)).toBe(10);
    const again = await h.placeOrderRaw(c.token, { addressId: addr.id, paymentMethod: 'COD', reviewedItems: reviewOf(check.body.cart) });
    expect(again.status).toBe(201);
    expect(again.body.order.items[0].unitPrice).toBe(550);
  });

  test('TC-104 stock dropped below the quantity (3 -> 2): 409 "Only 2 of X available", cart lowered to 2, no order', async () => {
    const p = await h.createProduct({ name: 'Stock Drop ' + h.uid(), price: 600, stock: 10 });
    const { c, addr } = await ready([[p, 3]]);
    const reviewed = reviewOf(await cartOf(c.token));
    await h.updateProduct(p.id, { stock: 2 });
    const res = await h.placeOrderRaw(c.token, { addressId: addr.id, paymentMethod: 'COD', reviewedItems: reviewed });
    expect(res.status).toBe(409);
    expect(res.body.message).toContain(`Only 2 of ${p.name} available`);
    expect(res.body.changes).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'quantity', newQuantity: 2 })]));
    expect((await cartOf(c.token)).items[0].quantity).toBe(2);
    expect((await ordersOf(c.token)).total).toBe(0);
    expect(await h.stockOf(p.id)).toBe(2);
    const again = await h.placeOrderRaw(c.token, { addressId: addr.id, paymentMethod: 'COD' });
    expect(again.status).toBe(201);
    expect(again.body.order.items[0].quantity).toBe(2);
  });

  test('TC-105 out-of-stock and deleted products: 409, lines removed from the cart, no order; with no lines left the next attempt is 400 "Your cart is empty"', async () => {
    const oos = await h.createProduct({ name: 'Now OOS ' + h.uid(), price: 600, stock: 5 });
    const gone = await h.createProduct({ name: 'Now Gone ' + h.uid(), price: 600, stock: 5 });
    const { c, addr } = await ready([[oos, 1], [gone, 1]]);
    await h.updateProduct(oos.id, { stock: 0 });
    await h.deleteProduct(gone.id);
    const res = await h.placeOrderRaw(c.token, { addressId: addr.id, paymentMethod: 'COD' });
    expect(res.status).toBe(409);
    const removed = res.body.changes.filter((x) => x.type === 'removed');
    expect(removed).toHaveLength(2);
    expect(removed.map((x) => x.message)).toEqual(expect.arrayContaining([`${oos.name} is out of stock`, `${gone.name} is no longer available`]));
    expect(res.body.cart.items).toEqual([]);
    expect((await cartOf(c.token)).items).toEqual([]);
    expect((await ordersOf(c.token)).total).toBe(0);
    const next = await h.placeOrderRaw(c.token, { addressId: addr.id, paymentMethod: 'COD' });
    expect(next.status).toBe(400);
    expect(next.body.message).toBe('Your cart is empty');
  });

  test('TC-106 when nothing changed and reviewedItems match, the order is placed (201) without warnings', async () => {
    const p = await h.createProduct({ price: 600, stock: 10 });
    const { c, addr } = await ready([[p, 1]]);
    const res = await h.placeOrderRaw(c.token, { addressId: addr.id, paymentMethod: 'COD', reviewedItems: reviewOf(await cartOf(c.token)) });
    expect(res.status).toBe(201);
    expect(res.body.order.status).toBe('Placed');
    expect(res.body.changes).toBeUndefined();
  });

  test('TC-107 a price change that moves the subtotal below ₹499 reports the new delivery charge (₹0.00 -> ₹49.00)', async () => {
    const p = await h.createProduct({ name: 'Delivery Shift ' + h.uid(), price: 300, stock: 10 });
    const { c, addr } = await ready([[p, 2]]);
    const reviewed = reviewOf(await cartOf(c.token));
    await h.updateProduct(p.id, { price: 240 });
    const res = await h.post('/api/orders/check', { token: c.token, body: { addressId: addr.id, paymentMethod: 'COD', reviewedItems: reviewed } });
    expect(res.status).toBe(409);
    const delivery = res.body.changes.find((x) => x.type === 'delivery');
    expect(delivery).toMatchObject({ oldDeliveryCharge: 0, newDeliveryCharge: 49 });
    expect(res.body.message).toContain('Delivery charge changed from ₹0.00 to ₹49.00');
    expect(res.body.cart).toMatchObject({ subtotal: 480, deliveryCharge: 49, grandTotal: 529 });
  });
});

describe('FR-022 order history', () => {
  test('TC-110 order list is newest first, paginated 10 per page, with number/date/total/status', async () => {
    const p = await h.createProduct({ price: 600, stock: 30 });
    const c = await h.signupCustomer();
    const a = await h.placeOrderFor(c, [[p, 1]]);
    const b = await h.placeOrderFor(c, [[p, 1]]);
    const d = await h.placeOrderFor(c, [[p, 1]]);
    const res = await h.get('/api/orders', { token: c.token });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 1, limit: 10, total: 3, totalPages: 1 });
    expect(res.body.items.map((x) => x.id)).toEqual([d.id, b.id, a.id]);
    expect(res.body.items[0]).toMatchObject({ orderNumber: d.orderNumber, grandTotal: 600, status: 'Placed', itemCount: 1 });
    expect(res.body.items[0].createdAt).toBeTruthy();
  });

  test('TC-111 order details include number, date, items, address, payment, totals, status and status history', async () => {
    const p = await h.createProduct({ price: 600, stock: 10 });
    const c = await h.signupCustomer();
    const o = await h.placeOrderFor(c, [[p, 1]], { paymentMethod: 'ONLINE' });
    const res = await h.get('/api/orders/' + o.id, { token: c.token });
    expect(res.status).toBe(200);
    const d = res.body.order;
    for (const k of ['id', 'orderNumber', 'createdAt', 'items', 'address', 'paymentMethod', 'paymentStatus', 'subtotal', 'deliveryCharge', 'grandTotal', 'status', 'statusHistory']) {
      expect(d).toHaveProperty(k);
    }
    expect(d.items[0]).toEqual(expect.objectContaining({ name: p.name, unitPrice: 600, quantity: 1 }));
    expect(d.customer).toBeUndefined();
  });

  test('TC-112 a customer with no orders gets an empty list (200, items [], total 0)', async () => {
    const c = await h.signupCustomer();
    const res = await h.get('/api/orders', { token: c.token });
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  test("TC-113 another customer's order, an unknown id and a malformed id return 404 'Order not found' with no order data", async () => {
    const p = await h.createProduct({ price: 600, stock: 10 });
    const owner = await h.signupCustomer();
    const o = await h.placeOrderFor(owner, [[p, 1]]);
    const x = await h.signupCustomer();
    for (const id of [o.id, '507f1f77bcf86cd799439011', 'abc']) {
      const res = await h.get('/api/orders/' + id, { token: x.token });
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ message: 'Order not found' });
    }
    expect((await ordersOf(x.token)).items).toEqual([]);
  });

  test('TC-114 every customer order endpoint returns 401 for guests', async () => {
    const id = '507f1f77bcf86cd799439011';
    const b = { addressId: id, paymentMethod: 'COD' };
    expect((await h.get('/api/orders')).status).toBe(401);
    expect((await h.get('/api/orders/' + id)).status).toBe(401);
    expect((await h.post('/api/orders', { body: b })).status).toBe(401);
    expect((await h.post('/api/orders/check', { body: b })).status).toBe(401);
    expect((await h.post(`/api/orders/${id}/cancel`)).status).toBe(401);
  });

  test('TC-115 order list page=0 / abc / -1 returns 400; page beyond the last returns empty items', async () => {
    const c = await h.signupCustomer();
    for (const page of ['0', 'abc', '-1', '1.5']) {
      expect((await h.get('/api/orders?page=' + page, { token: c.token })).status).toBe(400);
    }
    const far = await h.get('/api/orders?page=99', { token: c.token });
    expect(far.status).toBe(200);
    expect(far.body.items).toEqual([]);
  });

  test('TC-036 deleting an address used in an earlier order does not change the order address', async () => {
    const p = await h.createProduct({ price: 600, stock: 10 });
    const c = await h.signupCustomer();
    const addr = await h.addAddress(c.token, { name: 'Original Name', city: 'Nashik' });
    const o = await h.placeOrderFor(c, [[p, 1]], { addressId: addr.id });
    const del = await h.del('/api/addresses/' + addr.id, { token: c.token });
    expect(del.status).toBe(200);
    const res = await h.get('/api/orders/' + o.id, { token: c.token });
    expect(res.body.order.address).toMatchObject({ name: 'Original Name', city: 'Nashik', pincode: '411001' });
  });

  test('TC-160 customer responses never contain password/hash keys or other users emails; there is no user-list endpoint', async () => {
    const p = await h.createProduct({ price: 600, stock: 10 });
    const c = await h.signupCustomer();
    const o = await h.placeOrderFor(c, [[p, 1]]);
    const responses = [
      await h.get('/api/profile', { token: c.token }),
      await h.get('/api/orders', { token: c.token }),
      await h.get('/api/orders/' + o.id, { token: c.token }),
      await h.get('/api/addresses', { token: c.token }),
      await h.get('/api/cart', { token: c.token }),
      await h.get('/api/products/' + p.id),
      await h.get('/api/products?q=Order'),
      await h.get('/api/categories'),
    ];
    for (const r of responses) {
      expect(h.hasSecretKey(r.body)).toBe(false);
      const text = JSON.stringify(r.body);
      expect(text).not.toContain('asha@example.com');
      expect(text).not.toContain('ravi@example.com');
      expect(text).not.toContain('admin@shopease.com');
      expect(text).not.toMatch(/\$2[aby]\$/);
    }
    for (const url of ['/api/users', '/api/admin/users', '/api/users/' + c.user.id]) {
      const r = await h.get(url, { token: c.token });
      expect([403, 404]).toContain(r.status);
      expect(h.hasSecretKey(r.body)).toBe(false);
    }
  });
});

describe('FR-023 customer cancels an order', () => {
  test('TC-116 cancelling a Placed order sets Cancelled, returns stock and records a Cancelled history entry', async () => {
    const p = await h.createProduct({ price: 600, stock: 10 });
    const c = await h.signupCustomer();
    const o = await h.placeOrderFor(c, [[p, 2]]);
    expect(await h.stockOf(p.id)).toBe(8);
    const res = await h.post(`/api/orders/${o.id}/cancel`, { token: c.token });
    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('Cancelled');
    expect(res.body.order.statusHistory.map((s) => s.status)).toEqual(['Placed', 'Cancelled']);
    expect(Number.isNaN(Date.parse(res.body.order.statusHistory[1].at))).toBe(false);
    expect(await h.stockOf(p.id)).toBe(10);
  });

  test('TC-117 cancelling a Confirmed / Shipped / Delivered / Cancelled order returns 409 with the exact message and no stock change', async () => {
    const p = await h.createProduct({ price: 600, stock: 20 });
    const c = await h.signupCustomer();
    const chain = ['Confirmed', 'Shipped', 'Delivered'];
    const o = await h.placeOrderFor(c, [[p, 1]]);
    for (const status of chain) {
      expect((await h.adminStatus(o.id, status)).status).toBe(200);
      const stockBefore = await h.stockOf(p.id);
      const res = await h.post(`/api/orders/${o.id}/cancel`, { token: c.token });
      expect(res.status).toBe(409);
      expect(res.body.message).toBe('Only orders in Placed status can be cancelled');
      expect(await h.stockOf(p.id)).toBe(stockBefore);
      expect((await h.get('/api/orders/' + o.id, { token: c.token })).body.order.status).toBe(status);
    }
    const o2 = await h.placeOrderFor(c, [[p, 1]]);
    await h.post(`/api/orders/${o2.id}/cancel`, { token: c.token });
    const stockBefore = await h.stockOf(p.id);
    const again = await h.post(`/api/orders/${o2.id}/cancel`, { token: c.token });
    expect(again.status).toBe(409);
    expect(again.body.message).toBe('Only orders in Placed status can be cancelled');
    expect(await h.stockOf(p.id)).toBe(stockBefore);
  });

  test("TC-118 cancelling another customer's order returns 404 and changes nothing", async () => {
    const p = await h.createProduct({ price: 600, stock: 10 });
    const owner = await h.signupCustomer();
    const o = await h.placeOrderFor(owner, [[p, 1]]);
    const x = await h.signupCustomer();
    const res = await h.post(`/api/orders/${o.id}/cancel`, { token: x.token });
    expect([403, 404]).toContain(res.status);
    expect((await h.get('/api/orders/' + o.id, { token: owner.token })).body.order.status).toBe('Placed');
    expect(await h.stockOf(p.id)).toBe(9);
    expect((await h.post('/api/orders/507f1f77bcf86cd799439011/cancel', { token: x.token })).status).toBe(404);
    expect((await h.post('/api/orders/abc/cancel', { token: x.token })).status).toBe(404);
  });

  test('TC-119 two simultaneous cancel requests return stock only once', async () => {
    const p = await h.createProduct({ price: 600, stock: 10 });
    const c = await h.signupCustomer();
    const o = await h.placeOrderFor(c, [[p, 3]]);
    expect(await h.stockOf(p.id)).toBe(7);
    const [a, b] = await Promise.all([
      h.post(`/api/orders/${o.id}/cancel`, { token: c.token }),
      h.post(`/api/orders/${o.id}/cancel`, { token: c.token }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await h.stockOf(p.id)).toBe(10);
  });
});

describe('FR-024 statuses and history', () => {
  test('TC-120 a new order has exactly one history entry: Placed with a valid recent timestamp', async () => {
    const p = await h.createProduct({ price: 600, stock: 10 });
    const c = await h.signupCustomer();
    const o = await h.placeOrderFor(c, [[p, 1]]);
    expect(o.statusHistory).toHaveLength(1);
    expect(o.statusHistory[0].status).toBe('Placed');
    const age = Date.now() - Date.parse(o.statusHistory[0].at);
    expect(age).toBeGreaterThanOrEqual(-5000);
    expect(age).toBeLessThan(120000);
  });

  test('TC-121 after admin moves the order to Confirmed then Shipped the customer sees Placed, Confirmed, Shipped in order with timestamps', async () => {
    const p = await h.createProduct({ price: 600, stock: 10 });
    const c = await h.signupCustomer();
    const o = await h.placeOrderFor(c, [[p, 1]]);
    expect((await h.adminStatus(o.id, 'Confirmed')).status).toBe(200);
    expect((await h.adminStatus(o.id, 'Shipped')).status).toBe(200);
    const res = await h.get('/api/orders/' + o.id, { token: c.token });
    expect(res.body.order.status).toBe('Shipped');
    const hist = res.body.order.statusHistory;
    expect(hist.map((s) => s.status)).toEqual(['Placed', 'Confirmed', 'Shipped']);
    const t = hist.map((s) => Date.parse(s.at));
    expect(t.every((x) => !Number.isNaN(x))).toBe(true);
    expect(t[1]).toBeGreaterThanOrEqual(t[0]);
    expect(t[2]).toBeGreaterThanOrEqual(t[1]);
  });

  test('TC-122 invalid status values, skipped steps, same-status and moves out of Delivered/Cancelled are rejected and the status is unchanged', async () => {
    const p = await h.createProduct({ price: 600, stock: 20 });
    const c = await h.signupCustomer();
    const o = await h.placeOrderFor(c, [[p, 1]]);
    for (const status of ['Foo', 'confirmed', '', 'In Transit', { $ne: '' }, 5]) {
      const r = await h.adminStatus(o.id, status);
      expect(r.status).toBe(400);
    }
    for (const status of ['Shipped', 'Delivered', 'Placed']) {
      const r = await h.adminStatus(o.id, status);
      expect([400, 409]).toContain(r.status);
    }
    expect((await h.get('/api/orders/' + o.id, { token: c.token })).body.order.status).toBe('Placed');
    await h.adminStatus(o.id, 'Confirmed');
    await h.adminStatus(o.id, 'Shipped');
    await h.adminStatus(o.id, 'Delivered');
    for (const status of ['Cancelled', 'Shipped', 'Placed', 'Confirmed', 'Delivered']) {
      const r = await h.adminStatus(o.id, status);
      expect([400, 409]).toContain(r.status);
      expect(r.body.message).toBeTruthy();
    }
    const stockBefore = await h.stockOf(p.id);
    expect((await h.get('/api/orders/' + o.id, { token: c.token })).body.order.status).toBe('Delivered');
    expect(await h.stockOf(p.id)).toBe(stockBefore);
    const o2 = await h.placeOrderFor(c, [[p, 1]]);
    await h.adminStatus(o2.id, 'Cancelled');
    for (const status of ['Confirmed', 'Placed', 'Cancelled']) {
      expect([400, 409]).toContain((await h.adminStatus(o2.id, status)).status);
    }
  });
});
