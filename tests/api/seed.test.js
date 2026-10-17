// FR-029 seed script. jest.setup.js already ran the seed once against the in-memory database.
const { spawnSync } = require('child_process');
const h = require('../support/helpers');

const col = (n) => h.db().collection(n);
async function counts() {
  return {
    admins: await col('users').countDocuments({ role: 'admin' }),
    customers: await col('users').countDocuments({ role: 'customer' }),
    categories: await col('categories').countDocuments(),
    products: await col('products').countDocuments(),
    orders: await col('orders').countDocuments(),
  };
}

describe('FR-029 seed script', () => {
  test('TC-154 seeding an empty database creates 1 admin, 2 customers, 5 categories, >=25 products and >=5 orders', async () => {
    const c = await counts();
    expect(c.admins).toBe(1);
    expect(c.customers).toBe(2);
    expect(c.categories).toBe(5);
    expect(c.products).toBeGreaterThanOrEqual(25);
    expect(c.orders).toBeGreaterThanOrEqual(5);
  });

  test('TC-155 seeded data meets the minimums: >=6 featured, >=5 discounted (discount < price), >=3 low stock (1-5), >=1 out of stock, 1-4 images, all 5 categories, every order status', async () => {
    const products = await col('products').find({}).toArray();
    expect(products.filter((p) => p.featured).length).toBeGreaterThanOrEqual(6);
    const discounted = products.filter((p) => p.discountedPrice != null);
    expect(discounted.length).toBeGreaterThanOrEqual(5);
    discounted.forEach((p) => expect(p.discountedPrice).toBeLessThan(p.price));
    expect(products.filter((p) => p.stock >= 1 && p.stock <= 5).length).toBeGreaterThanOrEqual(3);
    expect(products.filter((p) => p.stock === 0).length).toBeGreaterThanOrEqual(1);
    products.forEach((p) => {
      expect(p.images.length).toBeGreaterThanOrEqual(1);
      expect(p.images.length).toBeLessThanOrEqual(4);
      p.images.forEach((u) => expect(u).toMatch(/^https?:\/\//));
    });
    const perCategory = new Set(products.map((p) => String(p.category)));
    expect(perCategory.size).toBe(5);
    const orders = await col('orders').find({}).toArray();
    const statuses = new Set(orders.map((o) => o.status));
    for (const s of ['Placed', 'Confirmed', 'Shipped', 'Delivered', 'Cancelled']) expect(statuses.has(s)).toBe(true);
    for (const o of orders) {
      expect(o.orderNumber).toMatch(/^SE-\d{8}-[A-Z0-9]{4}$/);
      expect(Math.round((o.subtotal + o.deliveryCharge) * 100)).toBe(Math.round(o.grandTotal * 100));
      expect(o.deliveryCharge).toBe(o.subtotal >= 499 ? 0 : 49);
      expect(Math.round(o.items.reduce((s, i) => s + i.lineTotal, 0) * 100)).toBe(Math.round(o.subtotal * 100));
    }
    products.forEach((p) => expect(p.stock).toBeGreaterThanOrEqual(0));
  });

  test('TC-156 running the seed a second time does not create duplicates (same counts, unique emails and order numbers)', async () => {
    const first = await counts();
    h.limiter.reset();
    global.runSeed();
    const second = await counts();
    expect(second).toEqual(first);
    const users = await col('users').find({}).toArray();
    expect(new Set(users.map((u) => u.email)).size).toBe(users.length);
    const orders = await col('orders').find({}).toArray();
    expect(new Set(orders.map((o) => o.orderNumber)).size).toBe(orders.length);
    const cats = await col('categories').find({}).toArray();
    expect(new Set(cats.map((c) => c.name.toLowerCase())).size).toBe(cats.length);
  });

  test('TC-157 the documented seed credentials log in with the right roles (admin, 2 customers)', async () => {
    const admin = await h.post('/api/auth/login', { body: h.SEED.admin });
    expect(admin.status).toBe(200);
    expect(admin.body.user.role).toBe('admin');
    for (const c of [h.SEED.asha, h.SEED.ravi]) {
      const res = await h.post('/api/auth/login', { body: c });
      expect(res.status).toBe(200);
      expect(res.body.user.role).toBe('customer');
    }
    const asha = await h.login(h.SEED.asha.email, h.SEED.asha.password);
    const addrs = await h.get('/api/addresses', { token: asha.token });
    expect(addrs.body.items.length).toBeGreaterThanOrEqual(1);
  });

  test('TC-158 seeding while MongoDB is unreachable exits non-zero with a clear message naming the connection problem', () => {
    const r = spawnSync(process.execPath, [global.SEED_PATH], {
      env: { ...process.env, MONGODB_URI: 'mongodb://127.0.0.1:27999/shopease_unreachable' },
      encoding: 'utf8',
      timeout: 60000,
    });
    expect(r.status).not.toBe(0);
    expect(r.status).not.toBeNull();
    const out = `${r.stdout}\n${r.stderr}`;
    expect(out).toMatch(/could not connect to MongoDB|connect/i);
    expect(out).toMatch(/MongoDB/);
    expect(out).toMatch(/Seed failed/);
  });
});
