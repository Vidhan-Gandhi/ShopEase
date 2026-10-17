const h = require('../support/helpers');

const cartOf = async (token) => (await h.get('/api/cart', { token })).body;
const line = (cart, productId) => cart.items.find((i) => i.productId === productId);

describe('FR-013 out-of-stock products and the cart', () => {
  test('TC-068 adding a stock-0 product returns 409 "This product is out of stock" and the cart is unchanged', async () => {
    const c = await h.signupCustomer();
    const p = await h.createProduct({ stock: 0 });
    const res = await h.addToCart(c.token, p.id, 1);
    expect([400, 409]).toContain(res.status);
    expect(res.body.message).toBe('This product is out of stock');
    const cart = await cartOf(c.token);
    expect(cart.items).toEqual([]);
    expect(cart.itemCount).toBe(0);
  });

  test('TC-069 guest cart validation marks a product whose stock became 0 (or was deleted) as unavailable and excludes it from totals', async () => {
    const a = await h.createProduct({ stock: 5, price: 100 });
    const b = await h.createProduct({ stock: 5, price: 200 });
    const keep = await h.createProduct({ stock: 5, price: 300 });
    await h.updateProduct(a.id, { stock: 0 });
    await h.deleteProduct(b.id);
    const res = await h.post('/api/cart/validate', { body: { items: [{ productId: a.id, quantity: 1 }, { productId: b.id, quantity: 1 }, { productId: keep.id, quantity: 1 }] } });
    expect(res.status).toBe(200);
    expect(res.body.items.map((i) => i.productId)).toEqual([keep.id]);
    expect(res.body.subtotal).toBe(300);
    const reasons = Object.fromEntries(res.body.unavailable.map((u) => [u.productId, u.reason]));
    expect(reasons[a.id]).toBe('out_of_stock');
    expect(reasons[b.id]).toBe('deleted');
    expect(res.body.notices.length).toBeGreaterThanOrEqual(2);
  });
});

describe('FR-014 cart operations', () => {
  test('TC-070 adding the same product twice gives one line of quantity 2 and itemCount 2', async () => {
    const c = await h.signupCustomer();
    const p = await h.createProduct({ stock: 10 });
    await h.addToCart(c.token, p.id, 1);
    const res = await h.addToCart(c.token, p.id, 1);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({ productId: p.id, quantity: 2 });
    expect(res.body.itemCount).toBe(2);
  });

  test('TC-071 PUT quantity 5 (stock 10) updates the line, line total and totals', async () => {
    const c = await h.signupCustomer();
    const p = await h.createProduct({ stock: 10, price: 120 });
    await h.addToCart(c.token, p.id, 2);
    const res = await h.put('/api/cart/items/' + p.id, { token: c.token, body: { quantity: 5 } });
    expect(res.status).toBe(200);
    expect(line(res.body, p.id)).toMatchObject({ quantity: 5, lineTotal: 600 });
    expect(res.body.subtotal).toBe(600);
    expect(res.body.itemCount).toBe(5);
  });

  test('TC-072 increasing above stock (4 in cart, stock 4) returns 400 "Only 4 available" and keeps quantity 4', async () => {
    const c = await h.signupCustomer();
    const p = await h.createProduct({ stock: 4 });
    await h.addToCart(c.token, p.id, 4);
    const add = await h.addToCart(c.token, p.id, 1);
    expect(add.status).toBe(400);
    expect(add.body.message).toBe('Only 4 available');
    const put = await h.put('/api/cart/items/' + p.id, { token: c.token, body: { quantity: 5 } });
    expect(put.status).toBe(400);
    expect(put.body.message).toBe('Only 4 available');
    expect(line(await cartOf(c.token), p.id).quantity).toBe(4);
  });

  test('TC-073 quantity 0, -1, 2.5 and "abc" are rejected with 400 and the previous quantity is kept', async () => {
    const c = await h.signupCustomer();
    const p = await h.createProduct({ stock: 10 });
    await h.addToCart(c.token, p.id, 2);
    for (const quantity of [0, -1, 2.5, 'abc', null, { $gt: 0 }]) {
      const res = await h.put('/api/cart/items/' + p.id, { token: c.token, body: { quantity } });
      expect(res.status).toBe(400);
      expect(res.body.errors).toEqual(expect.arrayContaining([{ field: 'quantity', message: 'Quantity must be a whole number of at least 1' }]));
    }
    expect(line(await cartOf(c.token), p.id).quantity).toBe(2);
  });

  test('TC-074 DELETE removes the line and totals update; removing a line that is not in the cart is still 200', async () => {
    const c = await h.signupCustomer();
    const a = await h.createProduct({ stock: 10, price: 100 });
    const b = await h.createProduct({ stock: 10, price: 200 });
    await h.addToCart(c.token, a.id, 1);
    await h.addToCart(c.token, b.id, 1);
    const res = await h.del('/api/cart/items/' + a.id, { token: c.token });
    expect(res.status).toBe(200);
    expect(res.body.items.map((i) => i.productId)).toEqual([b.id]);
    expect(res.body.subtotal).toBe(200);
    const again = await h.del('/api/cart/items/' + a.id, { token: c.token });
    expect(again.status).toBe(200);
  });

  test('TC-075 a deleted product is dropped with "<name> is no longer available"; a stock drop lowers the quantity with a notice', async () => {
    const c = await h.signupCustomer();
    const gone = await h.createProduct({ name: 'Vanishing Item ' + h.uid(), stock: 10 });
    const shrink = await h.createProduct({ name: 'Shrinking Item ' + h.uid(), stock: 10 });
    await h.addToCart(c.token, gone.id, 1);
    await h.addToCart(c.token, shrink.id, 5);
    await h.deleteProduct(gone.id);
    await h.updateProduct(shrink.id, { stock: 3 });
    const cart = await cartOf(c.token);
    expect(cart.items.map((i) => i.productId)).toEqual([shrink.id]);
    expect(cart.items[0].quantity).toBe(3);
    expect(cart.notices).toEqual(expect.arrayContaining([`${gone.name} is no longer available`, `Quantity for ${shrink.name} reduced to 3 (stock limit)`]));
    expect(cart.unavailable.map((u) => u.productId)).toContain(gone.id);
    const stored = await cartOf(c.token);
    expect(stored.items.map((i) => i.productId)).toEqual([shrink.id]);
  });

  test('TC-076 an empty cart has zero totals, zero delivery charge and no items', async () => {
    const c = await h.signupCustomer();
    const cart = await cartOf(c.token);
    expect(cart).toMatchObject({ items: [], itemCount: 0, subtotal: 0, deliveryCharge: 0, grandTotal: 0 });
  });

  test('TC-077 add-to-cart edge cases: unknown product 404, bad quantity 400, bad ids 400/404, default quantity 1', async () => {
    const c = await h.signupCustomer();
    const p = await h.createProduct({ stock: 10 });
    const unknown = await h.addToCart(c.token, '507f1f77bcf86cd799439011', 1);
    expect(unknown.status).toBe(404);
    expect(unknown.body.message).toBe('Product not found');
    for (const quantity of [0, -3, 1.5, 'x', 100001]) {
      const res = await h.addToCart(c.token, p.id, quantity);
      expect(res.status).toBe(400);
    }
    const bad = await h.addToCart(c.token, 'not-an-id', 1);
    expect([400, 404]).toContain(bad.status);
    const obj = await h.addToCart(c.token, { $gt: '' }, 1);
    expect(obj.status).toBe(400);
    const noQty = await h.post('/api/cart/items', { token: c.token, body: { productId: p.id } });
    expect(noQty.status).toBe(200);
    expect(line(noQty.body, p.id).quantity).toBe(1);
  });

  test('TC-078 PUT on a product that is not in the cart returns 404 "Item not found in cart"', async () => {
    const c = await h.signupCustomer();
    const p = await h.createProduct({ stock: 10 });
    const res = await h.put('/api/cart/items/' + p.id, { token: c.token, body: { quantity: 2 } });
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Item not found in cart');
  });
});

describe('FR-015 totals and delivery charge', () => {
  const totalsFor = async (price, discountedPrice, qty) => {
    const c = await h.signupCustomer();
    const p = await h.createProduct({ price, discountedPrice, stock: 50 });
    await h.addToCart(c.token, p.id, qty);
    return { cart: await cartOf(c.token), p };
  };

  test('TC-079 subtotal 498.99 gives delivery 49 and grand total 547.99', async () => {
    const { cart } = await totalsFor(498.99, undefined, 1);
    expect(cart).toMatchObject({ subtotal: 498.99, deliveryCharge: 49, grandTotal: 547.99 });
  });

  test('TC-080 subtotal exactly 499.00 gives free delivery (0) and grand total 499', async () => {
    const { cart } = await totalsFor(499, undefined, 1);
    expect(cart).toMatchObject({ subtotal: 499, deliveryCharge: 0, grandTotal: 499 });
  });

  test('TC-081 price 600 with discounted 450 gives subtotal 450, delivery 49, grand total 499 (threshold on discounted price)', async () => {
    const { cart } = await totalsFor(600, 450, 1);
    expect(cart).toMatchObject({ subtotal: 450, deliveryCharge: 49, grandTotal: 499 });
    expect(cart.items[0]).toMatchObject({ price: 600, discountedPrice: 450, unitPrice: 450, lineTotal: 450 });
  });

  test('TC-082 unit price 199.50 x 3 gives line total 598.50 and free delivery', async () => {
    const { cart } = await totalsFor(199.5, undefined, 3);
    expect(cart.items[0].lineTotal).toBe(598.5);
    expect(cart).toMatchObject({ subtotal: 598.5, deliveryCharge: 0, grandTotal: 598.5 });
  });

  test('TC-083 no floating-point artifacts: 3 x ₹0.10 gives subtotal 0.3 and grand total 49.3; sum of lines equals subtotal', async () => {
    const c = await h.signupCustomer();
    const a = await h.createProduct({ price: 0.1, stock: 50 });
    const b = await h.createProduct({ price: 0.2, stock: 50 });
    await h.addToCart(c.token, a.id, 3);
    await h.addToCart(c.token, b.id, 1);
    const cart = await cartOf(c.token);
    expect(cart.subtotal).toBe(0.5);
    expect(cart.items.reduce((s, i) => Math.round((s + i.lineTotal) * 100) / 100, 0)).toBe(cart.subtotal);
    expect(cart.deliveryCharge).toBe(49);
    expect(cart.grandTotal).toBe(49.5);
    const sum = await totalsFor(0.1, undefined, 3);
    expect(sum.cart.subtotal).toBe(0.3);
    expect(sum.cart.grandTotal).toBe(49.3);
  });
});

describe('FR-016 guest cart validate and merge', () => {
  test('TC-084 POST /cart/validate needs no login, prices lines with current prices and sums duplicate product ids', async () => {
    const p = await h.createProduct({ price: 250, discountedPrice: 200, stock: 10 });
    const res = await h.post('/api/cart/validate', { body: { items: [{ productId: p.id, quantity: 1 }, { productId: p.id, quantity: 2 }] } });
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({ quantity: 3, unitPrice: 200, lineTotal: 600 });
    expect(res.body).toMatchObject({ itemCount: 3, subtotal: 600, deliveryCharge: 0, grandTotal: 600 });
    const over = await h.post('/api/cart/validate', { body: { items: [{ productId: p.id, quantity: 50 }] } });
    expect(over.body.items[0].quantity).toBe(10);
    expect(over.body.notices.join(' ')).toContain('reduced to 10 (stock limit)');
  });

  test('TC-085 merge: guest 1 x B plus server 1 x C gives both lines of quantity 1', async () => {
    const c = await h.signupCustomer();
    const B = await h.createProduct({ stock: 10 });
    const C = await h.createProduct({ stock: 10 });
    await h.addToCart(c.token, C.id, 1);
    const res = await h.post('/api/cart/merge', { token: c.token, body: { items: [{ productId: B.id, quantity: 1 }] } });
    expect(res.status).toBe(200);
    expect(line(res.body, B.id).quantity).toBe(1);
    expect(line(res.body, C.id).quantity).toBe(1);
    const stored = await cartOf(c.token);
    expect(stored.items).toHaveLength(2);
  });

  test('TC-086 merge: guest 3 x A + server 4 x A with stock 5 gives 5 x A and a stock-limit notice', async () => {
    const c = await h.signupCustomer();
    const A = await h.createProduct({ name: 'Merge Cap ' + h.uid(), stock: 5 });
    await h.addToCart(c.token, A.id, 4);
    const res = await h.post('/api/cart/merge', { token: c.token, body: { items: [{ productId: A.id, quantity: 3 }] } });
    expect(res.status).toBe(200);
    expect(line(res.body, A.id).quantity).toBe(5);
    expect(res.body.notices).toEqual(expect.arrayContaining([`Quantity for ${A.name} reduced to 5 (stock limit)`]));
  });

  test('TC-087 merge: guest 2 x A + server 1 x A with stock 10 gives 3 x A and no stock notice', async () => {
    const c = await h.signupCustomer();
    const A = await h.createProduct({ stock: 10 });
    await h.addToCart(c.token, A.id, 1);
    const res = await h.post('/api/cart/merge', { token: c.token, body: { items: [{ productId: A.id, quantity: 2 }] } });
    expect(line(res.body, A.id).quantity).toBe(3);
    expect(res.body.notices.filter((n) => n.includes('stock limit'))).toEqual([]);
  });

  test('TC-088 merge skips out-of-stock and deleted lines with notices while valid lines still merge', async () => {
    const c = await h.signupCustomer();
    const ok = await h.createProduct({ stock: 10 });
    const oos = await h.createProduct({ name: 'OOS Merge ' + h.uid(), stock: 3 });
    const gone = await h.createProduct({ name: 'Gone Merge ' + h.uid(), stock: 3 });
    await h.updateProduct(oos.id, { stock: 0 });
    await h.deleteProduct(gone.id);
    const res = await h.post('/api/cart/merge', {
      token: c.token,
      body: { items: [{ productId: oos.id, quantity: 1 }, { productId: gone.id, quantity: 1 }, { productId: ok.id, quantity: 2 }] },
    });
    expect(res.status).toBe(200);
    expect(res.body.items.map((i) => i.productId)).toEqual([ok.id]);
    expect(line(res.body, ok.id).quantity).toBe(2);
    expect(res.body.notices.length).toBeGreaterThanOrEqual(2);
    expect(res.body.notices.join(' ')).toContain(oos.name);
    expect(res.body.notices.join(' ')).toContain('no longer available');
  });

  test('TC-089 validate / merge reject malformed bodies with 400 (items not an array, quantity 0 / text, more than 100 lines)', async () => {
    const c = await h.signupCustomer();
    const p = await h.createProduct({ stock: 10 });
    const bodies = [
      {},
      { items: 'abc' },
      { items: [{ productId: p.id, quantity: 0 }] },
      { items: [{ productId: p.id, quantity: 'a' }] },
      { items: [{ productId: p.id, quantity: 1.5 }] },
      { items: Array.from({ length: 101 }, () => ({ productId: p.id, quantity: 1 })) },
      { items: [{ productId: { $gt: '' }, quantity: 1 }] },
    ];
    for (const body of bodies) {
      expect((await h.post('/api/cart/validate', { body })).status).toBe(400);
      expect((await h.post('/api/cart/merge', { token: c.token, body })).status).toBe(400);
    }
  });

  test('TC-090 POST /cart/merge without a token returns 401', async () => {
    const res = await h.post('/api/cart/merge', { body: { items: [] } });
    expect(res.status).toBe(401);
  });
});

describe('FR-017 server-stored cart', () => {
  test('TC-091 the cart is stored on the server: a brand new login sees the same lines', async () => {
    const c = await h.signupCustomer();
    const p = await h.createProduct({ stock: 10 });
    await h.addToCart(c.token, p.id, 2);
    const second = await h.login(c.email, c.password);
    const cart = await cartOf(second.token);
    expect(line(cart, p.id).quantity).toBe(2);
  });

  test('TC-092 every server-cart endpoint returns 401 for guests, and customers only see their own cart', async () => {
    const id = '507f1f77bcf86cd799439011';
    expect((await h.get('/api/cart')).status).toBe(401);
    expect((await h.post('/api/cart/items', { body: { productId: id, quantity: 1 } })).status).toBe(401);
    expect((await h.put('/api/cart/items/' + id, { body: { quantity: 1 } })).status).toBe(401);
    expect((await h.del('/api/cart/items/' + id)).status).toBe(401);
    const x = await h.signupCustomer();
    const y = await h.signupCustomer();
    const p = await h.createProduct({ stock: 10 });
    await h.addToCart(x.token, p.id, 2);
    const yCart = await cartOf(y.token);
    expect(yCart.items).toEqual([]);
  });
});
