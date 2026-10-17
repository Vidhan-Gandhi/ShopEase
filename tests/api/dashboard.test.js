// FR-025 admin dashboard. This file wipes orders/products in its own in-memory database to get exact numbers.
const h = require('../support/helpers');

const dash = async () => {
  const res = await h.get('/api/admin/dashboard', { token: await h.adminToken() });
  expect(res.status).toBe(200);
  return res.body;
};

let customer;
beforeAll(async () => {
  customer = await h.signupCustomer({ name: 'Dash Customer' });
});

describe('FR-025 admin dashboard', () => {
  test('TC-126 with no orders: totalOrders 0, totalRevenue 0 and no recent orders', async () => {
    await h.db().collection('orders').deleteMany({});
    const d = await dash();
    expect(d.totalOrders).toBe(0);
    expect(d.totalRevenue).toBe(0);
    expect(d.recentOrders).toEqual([]);
  });

  test('TC-124 25 products of which 4 have stock <= 5: totalProducts 25 and lowStockProducts lists exactly those 4 (stock 0 included)', async () => {
    await h.db().collection('products').deleteMany({});
    const stocks = [0, 2, 5, 3, ...Array(21).fill(40)];
    const lowNames = [];
    for (let i = 0; i < stocks.length; i++) {
      const name = `Dash Product ${String(i).padStart(2, '0')}`;
      await h.createProduct({ name, stock: stocks[i], price: 100 });
      if (stocks[i] <= 5) lowNames.push([stocks[i], name]);
    }
    const d = await dash();
    expect(d.totalProducts).toBe(25);
    expect(d.lowStockProducts).toHaveLength(4);
    expect(d.lowStockProducts.map((p) => [p.stock, p.name])).toEqual(lowNames.sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1])));
    expect(d.lowStockProducts[0]).toHaveProperty('id');
  });

  test('TC-123 orders of ₹1000 (Delivered), ₹500 (Placed) and ₹700 (Cancelled): totalOrders 3, totalRevenue 1500', async () => {
    const p1000 = await h.createProduct({ price: 1000, stock: 10 });
    const p500 = await h.createProduct({ price: 500, stock: 10 });
    const p700 = await h.createProduct({ price: 700, stock: 10 });
    const o1 = await h.placeOrderFor(customer, [[p1000, 1]]);
    await h.placeOrderFor(customer, [[p500, 1]]);
    const o3 = await h.placeOrderFor(customer, [[p700, 1]]);
    for (const s of ['Confirmed', 'Shipped', 'Delivered']) await h.adminStatus(o1.id, s);
    await h.adminStatus(o3.id, 'Cancelled');
    const d = await dash();
    expect(d.totalOrders).toBe(3);
    expect(d.totalRevenue).toBe(1500);
  });

  test('TC-128 cancelling an order decreases total revenue by its grand total (total orders unchanged)', async () => {
    const before = await dash();
    const p = await h.createProduct({ price: 800, stock: 10 });
    const o = await h.placeOrderFor(customer, [[p, 1]]);
    const mid = await dash();
    expect(mid.totalRevenue).toBeCloseTo(before.totalRevenue + 800, 2);
    expect(mid.totalOrders).toBe(before.totalOrders + 1);
    await h.adminStatus(o.id, 'Cancelled');
    const after = await dash();
    expect(after.totalRevenue).toBeCloseTo(before.totalRevenue, 2);
    expect(after.totalOrders).toBe(mid.totalOrders);
  });

  test('TC-125 with 8 orders the dashboard lists exactly the 5 newest, newest first, with number/customer/total/status/date', async () => {
    const p = await h.createProduct({ price: 600, stock: 30 });
    const created = [];
    while ((await dash()).totalOrders < 8) {
      created.push(await h.placeOrderFor(customer, [[p, 1]]));
      await h.sleep(15);
    }
    const all = (await h.get('/api/admin/orders?page=1', { token: await h.adminToken() })).body.items;
    const d = await dash();
    expect(d.totalOrders).toBe(8);
    expect(d.recentOrders).toHaveLength(5);
    expect(d.recentOrders.map((o) => o.id)).toEqual(all.slice(0, 5).map((o) => o.id));
    expect(d.recentOrders[0]).toMatchObject({ customerName: 'Dash Customer' });
    for (const k of ['orderNumber', 'grandTotal', 'status', 'createdAt']) expect(d.recentOrders[0]).toHaveProperty(k);
    const t = d.recentOrders.map((o) => Date.parse(o.createdAt));
    for (let i = 1; i < t.length; i++) expect(t[i]).toBeLessThanOrEqual(t[i - 1]);
  });

  test('TC-127 dashboard API returns 403 for a customer and 401 for a guest', async () => {
    expect((await h.get('/api/admin/dashboard', { token: customer.token })).status).toBe(403);
    const g = await h.get('/api/admin/dashboard');
    expect(g.status).toBe(401);
  });
});
