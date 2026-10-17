// FR-032 pagination of order history and admin lists. Wipes orders in its own database for exact counts.
const h = require('../support/helpers');

let customer;
let admin;
let product;
const orders = [];

beforeAll(async () => {
  admin = await h.adminToken();
  await h.db().collection('orders').deleteMany({});
  customer = await h.signupCustomer();
  product = await h.createProduct({ price: 600, stock: 100 });
  const addr = await h.addAddress(customer.token);
  for (let i = 0; i < 23; i++) {
    orders.push(await h.placeOrderFor(customer, [[product, 1]], { addressId: addr.id }));
  }
  // 11 of them move to Confirmed, so exactly 12 stay Placed
  for (let i = 0; i < 11; i++) await h.adminStatus(orders[i].id, 'Confirmed');
}, 120000);

describe('FR-032 pagination', () => {
  test('TC-162 admin order list: 23 orders -> page 1 has 10, page 2 has 10, page 3 has 3, total 23', async () => {
    const sizes = [];
    for (const page of [1, 2, 3]) {
      const res = await h.get('/api/admin/orders?page=' + page, { token: admin });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ page, limit: 10, total: 23, totalPages: 3 });
      sizes.push(res.body.items.length);
    }
    expect(sizes).toEqual([10, 10, 3]);
    const four = await h.get('/api/admin/orders?page=4', { token: admin });
    expect(four.status).toBe(200);
    expect(four.body.items).toEqual([]);
  });

  test('TC-163 status filter "Placed" with 12 matches: page 1 has 10, page 2 has 2; "Confirmed" has 11; filter combined with page', async () => {
    const p1 = await h.get('/api/admin/orders?status=Placed&page=1', { token: admin });
    const p2 = await h.get('/api/admin/orders?status=Placed&page=2', { token: admin });
    expect(p1.body).toMatchObject({ total: 12, totalPages: 2, limit: 10 });
    expect(p1.body.items).toHaveLength(10);
    expect(p2.body.items).toHaveLength(2);
    expect([...p1.body.items, ...p2.body.items].every((o) => o.status === 'Placed')).toBe(true);
    const c2 = await h.get('/api/admin/orders?status=Confirmed&page=2', { token: admin });
    expect(c2.body.total).toBe(11);
    expect(c2.body.items).toHaveLength(1);
    const all = await h.get('/api/admin/orders?status=All', { token: admin });
    expect(all.body.total).toBe(23);
    const none = await h.get('/api/admin/orders?status=Delivered', { token: admin });
    expect(none.body).toMatchObject({ total: 0, items: [] });
  });

  test('TC-164 customer order history and admin product list use 10 rows per page with total counts', async () => {
    const mine = await h.get('/api/orders?page=3', { token: customer.token });
    expect(mine.body).toMatchObject({ page: 3, limit: 10, total: 23, totalPages: 3 });
    expect(mine.body.items).toHaveLength(3);
    const prods = await h.get('/api/admin/products?page=1', { token: admin });
    expect(prods.status).toBe(200);
    expect(prods.body.limit).toBe(10);
    expect(prods.body.items).toHaveLength(10);
    expect(prods.body.total).toBeGreaterThanOrEqual(31);
    const lastPage = await h.get('/api/admin/products?page=' + prods.body.totalPages, { token: admin });
    expect(lastPage.body.items.length).toBeGreaterThanOrEqual(1);
    expect(lastPage.body.items.length).toBeLessThanOrEqual(10);
    const q = await h.get('/api/admin/products?q=' + encodeURIComponent(product.name), { token: admin });
    expect(q.body.total).toBe(1);
  });

  test('TC-165 page=0 / abc / -1 / 1.5 return 400 on the order history, admin products and admin orders lists', async () => {
    for (const page of ['0', 'abc', '-1', '1.5']) {
      expect((await h.get('/api/orders?page=' + page, { token: customer.token })).status).toBe(400);
      expect((await h.get('/api/admin/orders?page=' + page, { token: admin })).status).toBe(400);
      expect((await h.get('/api/admin/products?page=' + page, { token: admin })).status).toBe(400);
    }
    const res = await h.get('/api/admin/orders?page=0', { token: admin });
    expect(res.body.errors).toEqual(expect.arrayContaining([{ field: 'page', message: 'Page must be a positive whole number' }]));
  });
});
