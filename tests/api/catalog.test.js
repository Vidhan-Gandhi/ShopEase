const h = require('../support/helpers');

let cat; // dedicated category with a known data set
let special; // price 1000, discounted 800
const items = [];

const pad = (n) => String(n).padStart(2, '0');

beforeAll(async () => {
  cat = await h.createCategory('Catalog ' + h.uid());
  special = await h.createProduct({ name: 'Special Disc Item', price: 1000, discountedPrice: 800, category: cat.id, stock: 20 });
  for (let i = 1; i <= 25; i++) {
    const price = 100 + ((i * 37) % 25) * 10;
    const p = await h.createProduct({
      name: `${i % 2 ? 'zeta' : 'Alpha'} Item ${pad(i)}`,
      price,
      discountedPrice: i % 3 === 0 ? price - 20 : undefined,
      category: cat.id,
      stock: 30,
    });
    items.push(p);
  }
});

async function allPages(query) {
  const out = [];
  for (let page = 1; page < 10; page++) {
    const res = await h.get(`/api/products?${query}&page=${page}`);
    expect(res.status).toBe(200);
    out.push(...res.body.items);
    if (page >= res.body.totalPages) break;
  }
  return out;
}

describe('FR-007 home page data', () => {
  test('TC-042 featured endpoint returns only featured products, max 8, newest first', async () => {
    const res = await h.get('/api/products/featured');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(8);
    expect(res.body.items.every((p) => p.featured === true)).toBe(true);
    const times = res.body.items.map((p) => new Date(p.createdAt).getTime());
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeLessThanOrEqual(times[i - 1]);
  });

  test('TC-043 categories endpoint lists all 5 seeded categories with names and product counts', async () => {
    const res = await h.get('/api/categories');
    expect(res.status).toBe(200);
    const names = res.body.items.map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(['Electronics', 'Fashion', 'Books', 'Home & Kitchen', 'Sports & Fitness']));
    const books = res.body.items.find((c) => c.name === 'Books');
    expect(books.productCount).toBeGreaterThanOrEqual(6);
    expect(typeof books.id).toBe('string');
    const lower = names.map((n) => n.toLowerCase());
    expect([...lower].sort()).toEqual(lower);
  });

  test('TC-044 when no product is featured the featured list is empty (200, items [])', async () => {
    const col = h.db().collection('products');
    const featured = await col.find({ featured: true }).project({ _id: 1 }).toArray();
    await col.updateMany({ featured: true }, { $set: { featured: false } });
    try {
      const res = await h.get('/api/products/featured');
      expect(res.status).toBe(200);
      expect(res.body.items).toEqual([]);
    } finally {
      await col.updateMany({ _id: { $in: featured.map((f) => f._id) } }, { $set: { featured: true } });
    }
  });
});

describe('FR-008 search', () => {
  test('TC-045 search "shirt", "SHIRT" and "otton" find "Cotton T-Shirt" (case-insensitive partial)', async () => {
    for (const q of ['shirt', 'SHIRT', 'otton']) {
      const res = await h.get('/api/products?q=' + q);
      expect(res.status).toBe(200);
      expect(res.body.items.map((p) => p.name)).toContain('Cotton T-Shirt');
    }
  });

  test('TC-046 search with no match returns 200 with empty items and total 0', async () => {
    const res = await h.get('/api/products?q=zzzz');
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  test('TC-047 regex special characters "(" and ".*" are literal: 200, no matches, no error', async () => {
    for (const q of ['(', '.*', '[', '\\', '+', '$^']) {
      const res = await h.get('/api/products?q=' + encodeURIComponent(q));
      expect(res.status).toBe(200);
      expect(res.body.items).toEqual([]);
    }
  });

  test('TC-048 a search of only spaces behaves as no search', async () => {
    const all = await h.get('/api/products');
    const blank = await h.get('/api/products?q=' + encodeURIComponent('   '));
    expect(blank.status).toBe(200);
    expect(blank.body.total).toBe(all.body.total);
    expect(blank.body.total).toBeGreaterThanOrEqual(30);
  });

  test('TC-049 q longer than 100 chars and q given as an object are rejected with 400', async () => {
    const long = await h.get('/api/products?q=' + 'a'.repeat(101));
    expect(long.status).toBe(400);
    expect(long.body.errors.map((e) => e.field)).toContain('q');
    const ok = await h.get('/api/products?q=' + 'a'.repeat(100));
    expect(ok.status).toBe(200);
    const obj = await h.get('/api/products?q[$ne]=x');
    expect(obj.status).toBe(400);
  });
});

describe('FR-009 filters', () => {
  test('TC-050 price filter uses the effective (discounted) price: 700-900 includes ₹1000/₹800 product, min 900 excludes it', async () => {
    const inc = await h.get(`/api/products?category=${cat.id}&minPrice=700&maxPrice=900`);
    expect(inc.status).toBe(200);
    expect(inc.body.items.map((p) => p.id)).toContain(special.id);
    const exc = await h.get(`/api/products?category=${cat.id}&minPrice=900`);
    expect(exc.body.items.map((p) => p.id)).not.toContain(special.id);
    const exc2 = await h.get(`/api/products?category=${cat.id}&maxPrice=799.99`);
    expect(exc2.body.items.map((p) => p.id)).not.toContain(special.id);
    const edge = await h.get(`/api/products?category=${cat.id}&minPrice=800&maxPrice=800`);
    expect(edge.body.items.map((p) => p.id)).toContain(special.id);
  });

  test('TC-051 category "Books" AND search "novel" returns only Books products containing "novel"', async () => {
    const cats = (await h.get('/api/categories')).body.items;
    const books = cats.find((c) => c.name === 'Books');
    const res = await h.get(`/api/products?category=${books.id}&q=novel`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThanOrEqual(1);
    for (const p of res.body.items) {
      expect(p.category.name).toBe('Books');
      expect(p.name.toLowerCase()).toContain('novel');
    }
  });

  test('TC-052 minPrice greater than maxPrice returns 400 "Minimum price cannot be more than maximum price"', async () => {
    const res = await h.get('/api/products?minPrice=500&maxPrice=100');
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(expect.arrayContaining([{ field: 'minPrice', message: 'Minimum price cannot be more than maximum price' }]));
  });

  test('TC-053 minPrice "abc", negative, or 3 decimals return 400 with a field message', async () => {
    for (const qs of ['minPrice=abc', 'minPrice=-5', 'maxPrice=abc', 'maxPrice=-1', 'minPrice=10.555']) {
      const res = await h.get('/api/products?' + qs);
      expect(res.status).toBe(400);
      expect(res.body.errors.length).toBeGreaterThanOrEqual(1);
      expect(res.body.errors[0].message).toBeTruthy();
    }
  });

  test('TC-054 invalid category value returns 400; unknown but well-formed category id returns an empty list', async () => {
    const bad = await h.get('/api/products?category=xyz');
    expect(bad.status).toBe(400);
    expect(bad.body.errors).toEqual(expect.arrayContaining([{ field: 'category', message: 'Invalid category' }]));
    const unknown = await h.get('/api/products?category=507f1f77bcf86cd799439011');
    expect(unknown.status).toBe(200);
    expect(unknown.body.items).toEqual([]);
    const operator = await h.get('/api/products?category[$ne]=1');
    expect(operator.status).toBe(400);
  });
});

describe('FR-010 sort', () => {
  test('TC-055 sort=price_asc gives non-decreasing effective prices across all pages', async () => {
    const list = await allPages(`category=${cat.id}&sort=price_asc`);
    expect(list).toHaveLength(26);
    const prices = list.map((p) => p.effectivePrice);
    for (let i = 1; i < prices.length; i++) expect(prices[i]).toBeGreaterThanOrEqual(prices[i - 1]);
    list.forEach((p) => expect(p.effectivePrice).toBe(p.discountedPrice == null ? p.price : p.discountedPrice));
  });

  test('TC-056 sort=price_desc gives non-increasing effective prices across all pages', async () => {
    const list = await allPages(`category=${cat.id}&sort=price_desc`);
    expect(list).toHaveLength(26);
    const prices = list.map((p) => p.effectivePrice);
    for (let i = 1; i < prices.length; i++) expect(prices[i]).toBeLessThanOrEqual(prices[i - 1]);
  });

  test('TC-057 default sort is newest first (createdAt non-increasing) and equals sort=newest', async () => {
    const def = await h.get(`/api/products?category=${cat.id}`);
    const newest = await h.get(`/api/products?category=${cat.id}&sort=newest`);
    expect(def.body.items.map((p) => p.id)).toEqual(newest.body.items.map((p) => p.id));
    const t = def.body.items.map((p) => new Date(p.createdAt).getTime());
    for (let i = 1; i < t.length; i++) expect(t[i]).toBeLessThanOrEqual(t[i - 1]);
  });

  test('TC-058 sort=name_asc orders names alphabetically, case-insensitive', async () => {
    const list = await allPages(`category=${cat.id}&sort=name_asc`);
    const names = list.map((p) => p.name.toLowerCase());
    expect(names).toEqual([...names].sort());
    expect(names[0].startsWith('alpha')).toBe(true);
  });

  test('TC-059 unknown sort value returns 400 {field: sort, message: Invalid sort option}', async () => {
    const res = await h.get('/api/products?sort=cheapest');
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(expect.arrayContaining([{ field: 'sort', message: 'Invalid sort option' }]));
  });
});

describe('FR-011 pagination', () => {
  test('TC-060 listing returns 12 per page: page 1 and 2 have 12 items, page 3 the remainder, with totals', async () => {
    const p1 = await h.get(`/api/products?category=${cat.id}&page=1`);
    expect(p1.status).toBe(200);
    expect(p1.body).toMatchObject({ page: 1, limit: 12, total: 26, totalPages: 3 });
    expect(p1.body.items).toHaveLength(12);
    const p2 = await h.get(`/api/products?category=${cat.id}&page=2`);
    expect(p2.body.items).toHaveLength(12);
    const p3 = await h.get(`/api/products?category=${cat.id}&page=3`);
    expect(p3.body.items).toHaveLength(2);
    const ids = [...p1.body.items, ...p2.body.items, ...p3.body.items].map((p) => p.id);
    expect(new Set(ids).size).toBe(26);
  });

  test('TC-061 page=999 returns 200 with empty items; page=0, abc, -1, 1.5 return 400', async () => {
    const far = await h.get('/api/products?page=999');
    expect(far.status).toBe(200);
    expect(far.body.items).toEqual([]);
    for (const page of ['0', 'abc', '-1', '1.5']) {
      const res = await h.get('/api/products?page=' + page);
      expect(res.status).toBe(400);
      expect(res.body.errors).toEqual(expect.arrayContaining([{ field: 'page', message: 'Page must be a positive whole number' }]));
    }
  });

  test('TC-062 12 or fewer matches give totalPages 1 (so the UI can hide pagination)', async () => {
    const res = await h.get('/api/products?q=shirt');
    expect(res.body.total).toBeLessThanOrEqual(12);
    expect(res.body.totalPages).toBe(1);
    const empty = await h.get('/api/products?q=zzzz');
    expect(empty.body.totalPages === 0 || empty.body.totalPages === 1).toBe(true);
  });
});

describe('FR-012 product details', () => {
  test('TC-063 GET /api/products/:id returns all detail fields incl. discounted effective price and images', async () => {
    const p = await h.createProduct({ name: 'Detail Item', price: 1000, discountedPrice: 800, stock: 10, images: ['https://example.com/a.jpg', 'https://example.com/b.jpg', 'https://example.com/c.jpg'] });
    const res = await h.get('/api/products/' + p.id);
    expect(res.status).toBe(200);
    expect(res.body.product).toMatchObject({
      id: p.id, name: 'Detail Item', price: 1000, discountedPrice: 800, effectivePrice: 800, stock: 10,
    });
    expect(res.body.product.images).toHaveLength(3);
    expect(res.body.product.category.name).toBeTruthy();
    expect(res.body.product.description).toBeTruthy();
  });

  test('TC-064 stock status text: 6 "In stock", 5 "Only 5 left", 1 "Only 1 left", 0 "Out of stock"', async () => {
    const expected = { 6: 'In stock', 5: 'Only 5 left', 1: 'Only 1 left', 0: 'Out of stock' };
    for (const [stock, text] of Object.entries(expected)) {
      const p = await h.createProduct({ stock: Number(stock) });
      const res = await h.get('/api/products/' + p.id);
      expect(res.body.product.stockStatus).toBe(text);
    }
  });

  test('TC-065 product without a discount has discountedPrice null and effectivePrice = price', async () => {
    const p = await h.createProduct({ price: 349 });
    const res = await h.get('/api/products/' + p.id);
    expect(res.body.product.discountedPrice).toBeNull();
    expect(res.body.product.effectivePrice).toBe(349);
  });

  test('TC-066 unknown or malformed product id returns 404 "Product not found"', async () => {
    for (const id of ['507f1f77bcf86cd799439011', 'abc', '123']) {
      const res = await h.get('/api/products/' + id);
      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Product not found');
    }
  });
});

describe('FR-013 out-of-stock visibility', () => {
  test('TC-067 out-of-stock products stay in listings with stockStatus "Out of stock"', async () => {
    const res = await h.get('/api/products?q=' + encodeURIComponent('USB-C Cable'));
    expect(res.status).toBe(200);
    const usb = res.body.items.find((p) => p.name === 'USB-C Cable 2m');
    expect(usb).toBeTruthy();
    expect(usb.stock).toBe(0);
    expect(usb.stockStatus).toBe('Out of stock');
  });
});
