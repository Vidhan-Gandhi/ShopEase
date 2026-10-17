const h = require('../support/helpers');

let admin;
let customer;
beforeAll(async () => {
  admin = await h.adminToken();
  customer = await h.signupCustomer();
});

const validProduct = async (o = {}) => ({
  name: 'Admin Product ' + h.uid(), description: 'Some description', price: 500, stock: 10,
  images: ['https://example.com/a.jpg'], featured: false, category: await h.qaCategoryId(), ...o,
});
const fieldsOf = (res) => (res.body.errors || []).map((e) => e.field);

describe('FR-026 admin product management', () => {
  test('TC-129 creating a valid product returns 201, shows in admin list and storefront, and can be added to a cart', async () => {
    const body = await validProduct({ name: 'Brand New Gadget ' + h.uid(), price: 1299.5, discountedPrice: 999.25, stock: 7, featured: true });
    const res = await h.post('/api/admin/products', { token: admin, body });
    expect(res.status).toBe(201);
    const p = res.body.product;
    expect(p).toMatchObject({ name: body.name, price: 1299.5, discountedPrice: 999.25, effectivePrice: 999.25, stock: 7, featured: true });
    expect(p.category.id).toBe(body.category);
    const adminList = await h.get('/api/admin/products?q=' + encodeURIComponent(body.name), { token: admin });
    expect(adminList.body.items.map((x) => x.id)).toContain(p.id);
    const store = await h.get('/api/products?q=' + encodeURIComponent(body.name));
    expect(store.body.items.map((x) => x.id)).toContain(p.id);
    const one = await h.get('/api/admin/products/' + p.id, { token: admin });
    expect(one.status).toBe(200);
    expect((await h.addToCart(customer.token, p.id, 1)).status).toBe(200);
  });

  test('TC-130 editing price and stock is reflected on the storefront', async () => {
    const p = await h.createProduct({ price: 500, stock: 10 });
    const res = await h.put('/api/admin/products/' + p.id, { token: admin, body: await validProduct({ name: p.name, price: 650, stock: 3 }) });
    expect(res.status).toBe(200);
    const pub = (await h.get('/api/products/' + p.id)).body.product;
    expect(pub).toMatchObject({ price: 650, stock: 3, stockStatus: 'Only 3 left' });
  });

  test('TC-131 discountedPrice >= price (equal or higher) is rejected with "Discounted price must be less than price"', async () => {
    for (const discountedPrice of [500, 600]) {
      const res = await h.post('/api/admin/products', { token: admin, body: await validProduct({ price: 500, discountedPrice }) });
      expect(res.status).toBe(400);
      expect(res.body.errors).toEqual(expect.arrayContaining([{ field: 'discountedPrice', message: 'Discounted price must be less than price' }]));
    }
    const p = await h.createProduct({ price: 500 });
    const upd = await h.put('/api/admin/products/' + p.id, { token: admin, body: await validProduct({ name: p.name, price: 500, discountedPrice: 500 }) });
    expect(upd.status).toBe(400);
    const ok = await h.post('/api/admin/products', { token: admin, body: await validProduct({ price: 500, discountedPrice: 499.99 }) });
    expect(ok.status).toBe(201);
  });

  test('TC-132 invalid fields are rejected with 400 and a message per field (images, price, stock, name, category)', async () => {
    const cases = [
      [{ images: [] }, 'images'],
      [{ images: ['ftp://x'] }, 'images.0'],
      [{ images: ['abc'] }, 'images.0'],
      [{ price: 0 }, 'price'],
      [{ price: -10 }, 'price'],
      [{ stock: -1 }, 'stock'],
      [{ stock: 1.5 }, 'stock'],
      [{ name: '' }, 'name'],
      [{ description: '' }, 'description'],
      [{ category: undefined }, 'category'],
      [{ category: '507f1f77bcf86cd799439011' }, 'category'],
    ];
    for (const [patch, field] of cases) {
      const body = { ...(await validProduct()), ...patch };
      if ('category' in patch && patch.category === undefined) delete body.category;
      const res = await h.post('/api/admin/products', { token: admin, body });
      expect(res.status).toBe(400);
      expect(fieldsOf(res)).toContain(field);
      expect(res.body.errors.find((e) => e.field === field).message).toBeTruthy();
    }
    const empty = await h.post('/api/admin/products', { token: admin, body: {} });
    expect(empty.status).toBe(400);
    expect(fieldsOf(empty)).toEqual(expect.arrayContaining(['name', 'description', 'price', 'stock', 'images', 'category']));
    const noImg = await h.post('/api/admin/products', { token: admin, body: { ...(await validProduct()), images: [] } });
    expect(noImg.body.errors).toEqual(expect.arrayContaining([{ field: 'images', message: 'At least one image URL is required' }]));
  });

  test('TC-133 a deleted product disappears from the storefront (404) and from the admin list; deleting returns 200', async () => {
    const p = await h.createProduct({ name: 'To Delete ' + h.uid() });
    const del = await h.del('/api/admin/products/' + p.id, { token: admin });
    expect(del.status).toBe(200);
    expect(del.body.message).toBe('Product deleted');
    expect((await h.get('/api/products/' + p.id)).status).toBe(404);
    expect((await h.get('/api/admin/products/' + p.id, { token: admin })).status).toBe(404);
    const list = await h.get('/api/products?q=' + encodeURIComponent(p.name));
    expect(list.body.items).toEqual([]);
  });

  test('TC-134 clearing the discounted price (null or omitted) leaves the product with no discount', async () => {
    const p = await h.createProduct({ price: 500, discountedPrice: 400 });
    const nullRes = await h.put('/api/admin/products/' + p.id, { token: admin, body: await validProduct({ name: p.name, price: 500, discountedPrice: null }) });
    expect(nullRes.status).toBe(200);
    expect(nullRes.body.product.discountedPrice).toBeNull();
    expect(nullRes.body.product.effectivePrice).toBe(500);
    await h.updateProduct(p.id, { discountedPrice: 300 });
    const omit = await h.put('/api/admin/products/' + p.id, { token: admin, body: await validProduct({ name: p.name, price: 500 }) });
    expect(omit.body.product.discountedPrice).toBeNull();
  });

  test('TC-135 customer gets 403 and guest 401 on product create / update / delete, and nothing changes', async () => {
    const p = await h.createProduct({ price: 500, stock: 10 });
    const body = await validProduct({ name: 'Hacked ' + h.uid(), price: 1 });
    for (const [token, status] of [[customer.token, 403], [undefined, 401]]) {
      expect((await h.post('/api/admin/products', { token, body })).status).toBe(status);
      expect((await h.put('/api/admin/products/' + p.id, { token, body })).status).toBe(status);
      expect((await h.del('/api/admin/products/' + p.id, { token })).status).toBe(status);
      expect((await h.get('/api/admin/products', { token })).status).toBe(status);
    }
    const now = (await h.get('/api/products/' + p.id)).body.product;
    expect(now).toMatchObject({ name: p.name, price: 500, stock: 10 });
    expect((await h.get('/api/products?q=Hacked')).body.items).toEqual([]);
  });

  test('TC-136 editing or deleting a non-existent product returns 404 "Product not found"', async () => {
    const body = await validProduct();
    for (const id of ['507f1f77bcf86cd799439011', 'abc']) {
      const put = await h.put('/api/admin/products/' + id, { token: admin, body });
      expect(put.status).toBe(404);
      expect(put.body.message).toBe('Product not found');
      const del = await h.del('/api/admin/products/' + id, { token: admin });
      expect(del.status).toBe(404);
      expect(del.body.message).toBe('Product not found');
    }
  });

  test('TC-137 boundary values: over-limit name/description/price/stock/decimals/images are rejected; limits themselves are accepted', async () => {
    const bad = [
      { name: 'x'.repeat(121) }, { name: 'x' }, { description: 'd'.repeat(2001) }, { price: 10000001 }, { price: 12.345 },
      { stock: 100001 }, { images: Array(9).fill('https://example.com/a.jpg') }, { images: ['https://example.com/' + 'a'.repeat(2050)] },
      { discountedPrice: 0 }, { discountedPrice: -5 },
    ];
    for (const patch of bad) {
      const res = await h.post('/api/admin/products', { token: admin, body: { ...(await validProduct()), ...patch } });
      expect(res.status).toBe(400);
    }
    const ok = await h.post('/api/admin/products', {
      token: admin,
      body: await validProduct({ name: 'n'.repeat(120), description: 'd'.repeat(2000), price: 10000000, stock: 100000, images: Array(8).fill('https://example.com/a.jpg') }),
    });
    expect(ok.status).toBe(201);
    const zero = await h.post('/api/admin/products', { token: admin, body: await validProduct({ stock: 0 }) });
    expect(zero.status).toBe(201);
  });

  test('TC-138 wrong types (string price, object price, string featured, object name, images as string) are rejected with 400', async () => {
    const bad = [{ price: '100' }, { price: { $gt: 0 } }, { stock: '5' }, { featured: 'yes' }, { name: { $ne: '' } }, { images: 'https://example.com/a.jpg' }, { category: { $ne: null } }, { discountedPrice: '10' }];
    for (const patch of bad) {
      const res = await h.post('/api/admin/products', { token: admin, body: { ...(await validProduct()), ...patch } });
      expect(res.status).toBe(400);
    }
  });
});

describe('FR-027 admin category management', () => {
  test('TC-139 creating category "Toys" returns 201 and it appears in the public category list with productCount 0', async () => {
    const name = 'Toys' + h.uid().slice(0, 6);
    const res = await h.post('/api/admin/categories', { token: admin, body: { name } });
    expect(res.status).toBe(201);
    expect(res.body.category).toMatchObject({ name, productCount: 0 });
    const list = await h.get('/api/categories');
    expect(list.body.items.map((c) => c.name)).toContain(name);
  });

  test('TC-140 renaming a category is reflected in its products', async () => {
    const cat = await h.createCategory('Old' + h.uid().slice(0, 6));
    const p = await h.createProduct({ category: cat.id });
    const newName = 'New' + h.uid().slice(0, 6);
    const res = await h.put('/api/admin/categories/' + cat.id, { token: admin, body: { name: newName } });
    expect(res.status).toBe(200);
    expect(res.body.category.name).toBe(newName);
    expect((await h.get('/api/products/' + p.id)).body.product.category.name).toBe(newName);
  });

  test('TC-141 deleting a category that still has products returns 409 "Cannot delete a category that still has products" and keeps it', async () => {
    const cat = await h.createCategory('Busy' + h.uid().slice(0, 6));
    await h.createProduct({ category: cat.id });
    const res = await h.del('/api/admin/categories/' + cat.id, { token: admin });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Cannot delete a category that still has products');
    expect((await h.get('/api/categories')).body.items.map((c) => c.id)).toContain(cat.id);
  });

  test('TC-142 deleting an empty category returns 200 and removes it', async () => {
    const cat = await h.createCategory('Empty' + h.uid().slice(0, 6));
    const res = await h.del('/api/admin/categories/' + cat.id, { token: admin });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Category deleted');
    expect((await h.get('/api/categories')).body.items.map((c) => c.id)).not.toContain(cat.id);
  });

  test('TC-143 duplicate (case-insensitive), empty, 1-char, 41-char, blank and non-string names are rejected', async () => {
    const name = 'Dup' + h.uid().slice(0, 6);
    expect((await h.post('/api/admin/categories', { token: admin, body: { name } })).status).toBe(201);
    const dup = await h.post('/api/admin/categories', { token: admin, body: { name: name.toLowerCase() } });
    expect(dup.status).toBe(409);
    expect(dup.body.message).toBe('A category with this name already exists');
    expect(dup.body.errors).toEqual(expect.arrayContaining([{ field: 'name', message: 'A category with this name already exists' }]));
    for (const bad of ['', 'A', 'x'.repeat(41), '   ', { $ne: '' }, 5]) {
      const res = await h.post('/api/admin/categories', { token: admin, body: { name: bad } });
      expect(res.status).toBe(400);
      expect(fieldsOf(res)).toContain('name');
    }
    expect((await h.post('/api/admin/categories', { token: admin, body: { name: 'x'.repeat(40) } })).status).toBe(201);
    expect((await h.post('/api/admin/categories', { token: admin, body: { name: 'Zz' } })).status).toBe(201);
    const other = await h.createCategory('Other' + h.uid().slice(0, 6));
    const clash = await h.put('/api/admin/categories/' + other.id, { token: admin, body: { name: name.toUpperCase() } });
    expect(clash.status).toBe(409);
    const self = await h.put('/api/admin/categories/' + other.id, { token: admin, body: { name: other.name.toUpperCase() } });
    expect(self.status).toBe(200);
  });

  test('TC-144 customer gets 403 and guest 401 on category create / update / delete, and nothing changes', async () => {
    const cat = await h.createCategory('Guarded' + h.uid().slice(0, 6));
    for (const [token, status] of [[customer.token, 403], [undefined, 401]]) {
      expect((await h.post('/api/admin/categories', { token, body: { name: 'Hacker' + h.uid().slice(0, 5) } })).status).toBe(status);
      expect((await h.put('/api/admin/categories/' + cat.id, { token, body: { name: 'Hacked' } })).status).toBe(status);
      expect((await h.del('/api/admin/categories/' + cat.id, { token })).status).toBe(status);
    }
    const list = (await h.get('/api/categories')).body.items;
    expect(list.find((c) => c.id === cat.id).name).toBe(cat.name);
    expect(list.map((c) => c.name)).not.toContain('Hacked');
  });

  test('TC-145 updating or deleting an unknown / malformed category id returns 404 "Category not found"', async () => {
    for (const id of ['507f1f77bcf86cd799439011', 'abc']) {
      const put = await h.put('/api/admin/categories/' + id, { token: admin, body: { name: 'Whatever' } });
      expect(put.status).toBe(404);
      expect(put.body.message).toBe('Category not found');
      const del = await h.del('/api/admin/categories/' + id, { token: admin });
      expect(del.status).toBe(404);
      expect(del.body.message).toBe('Category not found');
    }
  });
});

describe('FR-028 admin order management', () => {
  test('TC-146 order list can be filtered by status; "All" and no filter list every order; counts add up', async () => {
    const p = await h.createProduct({ price: 600, stock: 30 });
    const o = await h.placeOrderFor(customer, [[p, 1]]);
    await h.adminStatus(o.id, 'Confirmed');
    await h.adminStatus(o.id, 'Shipped');
    const all = await h.get('/api/admin/orders?status=All', { token: admin });
    const none = await h.get('/api/admin/orders', { token: admin });
    expect(all.status).toBe(200);
    expect(all.body.total).toBe(none.body.total);
    let sum = 0;
    for (const s of ['Placed', 'Confirmed', 'Shipped', 'Delivered', 'Cancelled']) {
      const r = await h.get('/api/admin/orders?status=' + s, { token: admin });
      expect(r.status).toBe(200);
      expect(r.body.items.every((x) => x.status === s)).toBe(true);
      sum += r.body.total;
    }
    expect(sum).toBe(all.body.total);
    const shipped = await h.get('/api/admin/orders?status=Shipped', { token: admin });
    expect(shipped.body.items.map((x) => x.id)).toContain(o.id);
  });

  test('TC-147 moving a Placed order to Confirmed returns 200 and appends a history entry', async () => {
    const p = await h.createProduct({ price: 600, stock: 10 });
    const o = await h.placeOrderFor(customer, [[p, 1]]);
    const res = await h.adminStatus(o.id, 'Confirmed');
    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('Confirmed');
    expect(res.body.order.statusHistory.map((s) => s.status)).toEqual(['Placed', 'Confirmed']);
    expect(Number.isNaN(Date.parse(res.body.order.statusHistory[1].at))).toBe(false);
    const next = await h.adminStatus(o.id, 'Shipped');
    expect(next.status).toBe(200);
  });

  test('TC-148 admin cancelling a Shipped order (2 x A) sets Cancelled, increases stock by 2 and records the cancellation', async () => {
    const p = await h.createProduct({ price: 600, stock: 10 });
    const o = await h.placeOrderFor(customer, [[p, 2]]);
    await h.adminStatus(o.id, 'Confirmed');
    await h.adminStatus(o.id, 'Shipped');
    expect(await h.stockOf(p.id)).toBe(8);
    const res = await h.adminStatus(o.id, 'Cancelled');
    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('Cancelled');
    expect(res.body.order.statusHistory.map((s) => s.status)).toEqual(['Placed', 'Confirmed', 'Shipped', 'Cancelled']);
    expect(await h.stockOf(p.id)).toBe(10);
    for (const from of ['Placed', 'Confirmed']) {
      const o2 = await h.placeOrderFor(customer, [[p, 1]]);
      if (from === 'Confirmed') await h.adminStatus(o2.id, 'Confirmed');
      const stock = await h.stockOf(p.id);
      expect((await h.adminStatus(o2.id, 'Cancelled')).status).toBe(200);
      expect(await h.stockOf(p.id)).toBe(stock + 1);
    }
  });

  test('TC-149 cancelling a Delivered or Cancelled order returns 409 "Cannot change status from X to Cancelled" and stock is unchanged', async () => {
    const p = await h.createProduct({ price: 600, stock: 10 });
    const delivered = await h.placeOrderFor(customer, [[p, 1]]);
    for (const s of ['Confirmed', 'Shipped', 'Delivered']) await h.adminStatus(delivered.id, s);
    const cancelled = await h.placeOrderFor(customer, [[p, 1]]);
    await h.adminStatus(cancelled.id, 'Cancelled');
    const stock = await h.stockOf(p.id);
    const a = await h.adminStatus(delivered.id, 'Cancelled');
    expect(a.status).toBe(409);
    expect(a.body.message).toBe('Cannot change status from Delivered to Cancelled');
    const b = await h.adminStatus(cancelled.id, 'Cancelled');
    expect(b.status).toBe(409);
    expect(b.body.message).toBe('Cannot change status from Cancelled to Cancelled');
    expect(await h.stockOf(p.id)).toBe(stock);
  });

  test('TC-150 a Placed order cannot be set directly to Shipped or Delivered (409/400) and stays Placed', async () => {
    const p = await h.createProduct({ price: 600, stock: 10 });
    const o = await h.placeOrderFor(customer, [[p, 1]]);
    for (const s of ['Shipped', 'Delivered']) {
      const r = await h.adminStatus(o.id, s);
      expect([400, 409]).toContain(r.status);
    }
    const detail = await h.get('/api/admin/orders/' + o.id, { token: admin });
    expect(detail.body.order.status).toBe('Placed');
    expect(detail.body.order.statusHistory).toHaveLength(1);
  });

  test('TC-151 customer gets 403 and guest 401 on every admin order endpoint', async () => {
    const p = await h.createProduct({ price: 600, stock: 10 });
    const o = await h.placeOrderFor(customer, [[p, 1]]);
    for (const [token, status] of [[customer.token, 403], [undefined, 401]]) {
      expect((await h.get('/api/admin/orders', { token })).status).toBe(status);
      expect((await h.get('/api/admin/orders/' + o.id, { token })).status).toBe(status);
      const patch = await h.patch(`/api/admin/orders/${o.id}/status`, { token, body: { status: 'Confirmed' } });
      expect(patch.status).toBe(status);
    }
    expect((await h.get('/api/admin/orders/' + o.id, { token: admin })).body.order.status).toBe('Placed');
  });

  test('TC-152 an order cancelled by the admin shows status Cancelled to the customer', async () => {
    const p = await h.createProduct({ price: 600, stock: 10 });
    const c = await h.signupCustomer();
    const o = await h.placeOrderFor(c, [[p, 1]]);
    await h.adminStatus(o.id, 'Cancelled');
    const res = await h.get('/api/orders/' + o.id, { token: c.token });
    expect(res.body.order.status).toBe('Cancelled');
    const list = await h.get('/api/orders', { token: c.token });
    expect(list.body.items[0].status).toBe('Cancelled');
  });

  test('TC-153 invalid status filter -> 400; admin detail includes customer data; unknown / malformed order id -> 404 "Order not found"', async () => {
    const bad = await h.get('/api/admin/orders?status=Shipping', { token: admin });
    expect(bad.status).toBe(400);
    expect(bad.body.errors).toEqual(expect.arrayContaining([{ field: 'status', message: 'Invalid status' }]));
    const p = await h.createProduct({ price: 600, stock: 10 });
    const c = await h.signupCustomer({ name: 'Visible Customer' });
    const o = await h.placeOrderFor(c, [[p, 1]]);
    const detail = await h.get('/api/admin/orders/' + o.id, { token: admin });
    expect(detail.status).toBe(200);
    expect(detail.body.order.customer).toMatchObject({ id: c.user.id, name: 'Visible Customer', email: c.email });
    expect(h.hasSecretKey(detail.body)).toBe(false);
    for (const id of ['507f1f77bcf86cd799439011', 'abc']) {
      const r = await h.get('/api/admin/orders/' + id, { token: admin });
      expect(r.status).toBe(404);
      expect(r.body.message).toBe('Order not found');
      expect((await h.adminStatus(id, 'Confirmed')).status).toBe(404);
    }
  });
});
