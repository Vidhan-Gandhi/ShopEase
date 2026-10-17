// Route protection (FR-006) and NFR-003/004/005/007/008 checks.
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const h = require('../support/helpers');

const ID = '507f1f77bcf86cd799439011';
const VALID_PRODUCT = {
  name: 'Sec Product', description: 'd', price: 100, stock: 1, images: ['https://example.com/a.jpg'], category: ID,
};
// [method, url, body]
const ADMIN_ENDPOINTS = [
  ['get', '/api/admin/dashboard'],
  ['get', '/api/admin/products'],
  ['get', '/api/admin/products/' + ID],
  ['post', '/api/admin/products', VALID_PRODUCT],
  ['put', '/api/admin/products/' + ID, VALID_PRODUCT],
  ['delete', '/api/admin/products/' + ID],
  ['post', '/api/admin/categories', { name: 'Sec Cat' }],
  ['put', '/api/admin/categories/' + ID, { name: 'Sec Cat' }],
  ['delete', '/api/admin/categories/' + ID],
  ['get', '/api/admin/orders'],
  ['get', '/api/admin/orders/' + ID],
  ['patch', `/api/admin/orders/${ID}/status`, { status: 'Confirmed' }],
];
const CUSTOMER_ENDPOINTS = [
  ['get', '/api/profile'],
  ['put', '/api/profile', { name: 'Sec Name' }],
  ['put', '/api/profile/password', { currentPassword: 'x', newPassword: 'Newpass99' }],
  ['get', '/api/addresses'],
  ['post', '/api/addresses', h.addressBody()],
  ['put', '/api/addresses/' + ID, h.addressBody()],
  ['patch', `/api/addresses/${ID}/default`],
  ['delete', '/api/addresses/' + ID],
  ['get', '/api/cart'],
  ['post', '/api/cart/items', { productId: ID, quantity: 1 }],
  ['put', '/api/cart/items/' + ID, { quantity: 1 }],
  ['delete', '/api/cart/items/' + ID],
  ['post', '/api/cart/merge', { items: [] }],
  ['post', '/api/orders/check', { addressId: ID, paymentMethod: 'COD' }],
  ['post', '/api/orders', { addressId: ID, paymentMethod: 'COD' }],
  ['get', '/api/orders'],
  ['get', '/api/orders/' + ID],
  ['post', `/api/orders/${ID}/cancel`],
];
const CART_ORDER_ONLY = CUSTOMER_ENDPOINTS.filter(([, u]) => u.startsWith('/api/cart') || u.startsWith('/api/orders'));

let customer;
beforeAll(async () => {
  customer = await h.signupCustomer();
});
beforeEach(() => h.limiter.reset());

describe('FR-006 route protection', () => {
  test('TC-038 a customer calling any admin endpoint gets 403 {"message":"Not authorised"}', async () => {
    for (const [method, url, body] of ADMIN_ENDPOINTS) {
      const res = await h.call(method, url, { token: customer.token, body });
      expect([method, url, res.status]).toEqual([method, url, 403]);
      expect(res.body).toEqual({ message: 'Not authorised' });
    }
  });

  test('TC-039 a guest calling any admin endpoint gets 401', async () => {
    for (const [method, url, body] of ADMIN_ENDPOINTS) {
      const res = await h.call(method, url, { body });
      expect([method, url, res.status]).toEqual([method, url, 401]);
      expect(res.body.message).toBe('Please log in to continue');
    }
  });

  test('TC-040 the admin calling cart / order endpoints gets 403 "Admin accounts cannot place orders"', async () => {
    const token = await h.adminToken();
    for (const [method, url, body] of CART_ORDER_ONLY) {
      const res = await h.call(method, url, { token, body });
      expect([method, url, res.status]).toEqual([method, url, 403]);
      expect(res.body.message).toBe('Admin accounts cannot place orders');
    }
    const validate = await h.post('/api/cart/validate', { token, body: { items: [] } });
    expect(validate.status).toBe(200);
  });

  test('TC-041 the admin can use admin endpoints (200) and the signup API offers no way to create an admin', async () => {
    const token = await h.adminToken();
    for (const url of ['/api/admin/dashboard', '/api/admin/products', '/api/admin/orders']) {
      expect((await h.get(url, { token })).status).toBe(200);
    }
    const res = await h.post('/api/auth/signup', { body: { name: 'Sneaky', email: h.uniqueEmail(), password: 'Shop1234', role: 'admin', isAdmin: true, admin: true } });
    expect(res.body.user.role).toBe('customer');
    expect((await h.get('/api/admin/dashboard', { token: res.body.token })).status).toBe(403);
    for (const url of ['/api/auth/admin-signup', '/api/auth/signup/admin', '/api/admin/signup', '/api/admin/users']) {
      const r = await h.post(url, { body: { name: 'Sneaky', email: h.uniqueEmail(), password: 'Shop1234' } });
      expect([401, 404]).toContain(r.status);
    }
  });

  test('TC-185 every customer endpoint rejects a request without a token with 401', async () => {
    for (const [method, url, body] of CUSTOMER_ENDPOINTS) {
      const res = await h.call(method, url, { body });
      expect([method, url, res.status]).toEqual([method, url, 401]);
      expect(res.body.message).toBe('Please log in to continue');
    }
  });

  test('TC-188 forged tokens are rejected with 401: alg "none", token of a deleted user, token missing the id, wrong-secret admin token', async () => {
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const noneToken = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ id: customer.user.id, role: 'admin' })}.`;
    const ghost = await h.signupCustomer();
    await h.db().collection('users').deleteOne({ email: ghost.email });
    const noId = h.signToken({ role: 'admin' }, { expiresIn: '1h' });
    const forgedAdmin = h.signToken({ id: customer.user.id, role: 'admin' }, { expiresIn: '1h' }, 'guessed_secret');
    for (const token of [noneToken, ghost.token, noId, forgedAdmin]) {
      const res = await h.get('/api/admin/dashboard', { token });
      expect(res.status).toBe(401);
      const res2 = await h.get('/api/profile', { token });
      expect(res2.status).toBe(401);
    }
    // a validly signed token whose payload claims admin but belongs to a customer must not grant admin access
    const claim = h.signToken({ id: customer.user.id, role: 'admin' }, { expiresIn: '1h' });
    const r = await h.get('/api/admin/dashboard', { token: claim });
    expect(r.status).toBe(403);
  });
});

describe('NFR-007 security headers and CORS', () => {
  test('TC-176 responses carry nosniff and no X-Powered-By; CORS allows only the configured origin (not *)', async () => {
    for (const url of ['/health', '/api/products', '/api/does-not-exist']) {
      const res = await h.get(url);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-powered-by']).toBeUndefined();
    }
    const ok = await h.get('/api/products', { headers: { Origin: 'http://localhost:5173' } });
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    const evil = await h.get('/api/products', { headers: { Origin: 'http://evil.example.com' } });
    expect(evil.headers['access-control-allow-origin']).not.toBe('http://evil.example.com');
    expect(evil.headers['access-control-allow-origin']).not.toBe('*');
    expect(ok.headers['access-control-allow-origin']).not.toBe('*');
    const pre = await request(h.app).options('/api/auth/login').set('Origin', 'http://evil.example.com').set('Access-Control-Request-Method', 'POST');
    expect(pre.headers['access-control-allow-origin']).not.toBe('http://evil.example.com');
    expect(pre.headers['access-control-allow-origin']).not.toBe('*');
  });
});

describe('NFR-008 consistent error responses', () => {
  test('TC-177 unknown routes -> 404 {message}; malformed JSON -> 400 "Invalid JSON body"; validation errors have message + errors[{field,message}]', async () => {
    const nf = await h.get('/api/this/does/not/exist');
    expect(nf.status).toBe(404);
    expect(nf.body).toEqual({ message: 'Route not found' });
    const nf2 = await h.post('/nothing-here');
    expect(nf2.status).toBe(404);
    expect(typeof nf2.body.message).toBe('string');
    const bad = await request(h.app).post('/api/auth/login').set('X-Forwarded-For', h.freshIp()).set('Content-Type', 'application/json').send('{"email": ');
    expect(bad.status).toBe(400);
    expect(bad.body).toEqual({ message: 'Invalid JSON body' });
    const val = await h.post('/api/auth/signup', { body: {} });
    expect(val.status).toBe(400);
    expect(typeof val.body.message).toBe('string');
    expect(Array.isArray(val.body.errors)).toBe(true);
    val.body.errors.forEach((e) => {
      expect(typeof e.field).toBe('string');
      expect(typeof e.message).toBe('string');
    });
    const un = await h.get('/api/profile');
    expect(Object.keys(un.body)).toEqual(['message']);
  });

  test('TC-178 an unexpected server error returns 500 {"message":"Something went wrong. Please try again later."} without stack, paths or DB details', async () => {
    const Product = require('../../backend/src/models/Product');
    const spy = jest.spyOn(Product, 'findById').mockImplementation(() => {
      throw new Error('boom at C:\\secret\\path\\file.js mongodb://user:pw@db.internal:27017/shopease');
    });
    try {
      const res = await h.get('/api/products/' + ID);
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ message: 'Something went wrong. Please try again later.' });
      const text = JSON.stringify(res.body) + res.text;
      for (const leak of ['boom', 'secret', 'mongodb://', 'stack', '.js', 'node_modules']) expect(text).not.toContain(leak);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('NFR-003 / NFR-004 / NFR-005 security of inputs and secrets', () => {
  test('TC-179 passwords are stored only as bcrypt hashes (cost >= 10), never plaintext, and never appear in API responses', async () => {
    const c = await h.signupCustomer({ password: 'Plain1234' });
    const doc = await h.db().collection('users').findOne({ email: c.email });
    expect(doc.password).toMatch(/^\$2[aby]\$(\d{2})\$/);
    expect(Number(doc.password.match(/^\$2[aby]\$(\d{2})\$/)[1])).toBeGreaterThanOrEqual(10);
    expect(doc.password).not.toContain('Plain1234');
    const other = await h.signupCustomer({ password: 'Plain1234' });
    const doc2 = await h.db().collection('users').findOne({ email: other.email });
    expect(doc2.password).not.toBe(doc.password); // salted
    const logs = [];
    const spies = ['log', 'error', 'warn', 'info'].map((m) => jest.spyOn(console, m).mockImplementation((...a) => logs.push(a.join(' '))));
    try {
      await h.post('/api/auth/login', { body: { email: c.email, password: 'WrongSecret99' } });
      await h.put('/api/profile/password', { token: c.token, body: { currentPassword: 'Plain1234', newPassword: 'Brandnew99' } });
      await h.post('/api/auth/signup', { body: { name: '', email: 'bad', password: 'LeakCheck99' } });
    } finally {
      spies.forEach((s) => s.mockRestore());
    }
    const all = logs.join('\n');
    for (const secret of ['WrongSecret99', 'Plain1234', 'Brandnew99', 'LeakCheck99']) expect(all).not.toContain(secret);
  });

  test('TC-189 the JWT secret and database URL come from environment variables: nothing hard-coded in source, .env is git-ignored', async () => {
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
    const root = path.join(__dirname, '..', '..');
    const files = walk(path.join(root, 'backend', 'src')).filter((f) => f.endsWith('.js'));
    expect(files.length).toBeGreaterThan(10);
    for (const f of files) {
      const text = fs.readFileSync(f, 'utf8');
      expect([f, /JWT_SECRET\s*(=|:)\s*['"`][^'"`]+['"`]/.test(text)]).toEqual([f, false]);
      expect([f, /process\.env\.JWT_SECRET\s*\|\|\s*['"`]/.test(text)]).toEqual([f, false]);
      expect([f, /mongodb(\+srv)?:\/\/[^'"`\s]*:[^'"`\s]*@/.test(text)]).toEqual([f, false]);
    }
    const ignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8').split(/\r?\n/).map((l) => l.trim());
    expect(ignore).toContain('.env');
    expect(fs.existsSync(path.join(root, 'backend', '.env.example'))).toBe(true);
    const saved = process.env.JWT_SECRET;
    const claims = h.jwt.decode((await h.login(h.SEED.asha.email, h.SEED.asha.password)).token);
    expect(claims.exp - claims.iat).toBe(7 * 24 * 3600);
    expect(saved).toBe('test_secret');
  });

  test('TC-180 script/HTML payloads in text fields never cause a 500; responses are JSON (never HTML) so nothing can execute', async () => {
    const xss = '<script>alert(1)</script>';
    const signup = await h.post('/api/auth/signup', { body: { name: xss + ' Bob', email: h.uniqueEmail('xss'), password: 'Shop1234' } });
    expect([201, 400]).toContain(signup.status);
    expect(signup.headers['content-type']).toMatch(/application\/json/);
    const token = signup.status === 201 ? signup.body.token : customer.token;
    const prof = await h.put('/api/profile', { token, body: { name: xss, phone: '' } });
    expect([200, 400]).toContain(prof.status);
    const addr = await h.post('/api/addresses', { token, body: h.addressBody({ addressLine: xss + ' lane', city: '<img src=x onerror=alert(1)>' }) });
    expect([201, 400]).toContain(addr.status);
    const search = await h.get('/api/products?q=' + encodeURIComponent(xss));
    expect(search.status).toBe(200);
    expect(search.headers['content-type']).toMatch(/application\/json/);
    const prod = await h.post('/api/admin/products', { token: await h.adminToken(), body: { ...VALID_PRODUCT, name: xss + h.uid(), category: await h.qaCategoryId() } });
    expect([201, 400]).toContain(prod.status);
    const nf = await h.get('/api/' + encodeURIComponent(xss));
    expect(nf.status).toBe(404);
    expect(nf.text).not.toContain('<script>');
  });

  test('TC-181 NoSQL operators in query strings, bodies and ids are rejected or treated as plain data (never 500, never auth bypass)', async () => {
    const queries = ['q[$ne]=x', 'q[$regex]=.*', 'category[$ne]=1', 'sort[$ne]=x', 'page[$gt]=0', 'minPrice[$gt]=0', 'maxPrice[$ne]=1'];
    for (const qs of queries) {
      const res = await h.get('/api/products?' + qs);
      expect([qs, res.status]).toEqual([qs, 400]);
    }
    const lg = await h.post('/api/auth/login', { body: { email: { $gt: '' }, password: { $gt: '' } } });
    expect(lg.status).toBe(400);
    expect(lg.body.token).toBeUndefined();
    const add = await h.post('/api/cart/items', { token: customer.token, body: { productId: { $ne: null }, quantity: 1 } });
    expect(add.status).toBe(400);
    const ord = await h.post('/api/orders', { token: customer.token, body: { addressId: { $ne: null }, paymentMethod: 'COD' } });
    expect(ord.status).toBe(400);
    const status = await h.patch(`/api/admin/orders/${ID}/status`, { token: await h.adminToken(), body: { status: { $ne: '' } } });
    expect([400, 404]).toContain(status.status);
    const prof = await h.put('/api/profile', { token: customer.token, body: { name: { $gt: '' } } });
    expect(prof.status).toBe(400);
    const adminSearch = await h.get('/api/admin/products?q[$ne]=x', { token: await h.adminToken() });
    expect(adminSearch.status).toBe(400);
  });

  test('TC-182 a request body over 100 KB is refused (413/400) with a JSON error, not a crash', async () => {
    const res = await h.post('/api/auth/signup', { body: { name: 'x'.repeat(150000), email: h.uniqueEmail(), password: 'Shop1234' } });
    expect([400, 413]).toContain(res.status);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(typeof res.body.message).toBe('string');
    expect(res.text).not.toMatch(/at .*\.js/);
  });

  test('TC-183 there is no upload endpoint and image fields accept only absolute http/https URLs', async () => {
    const token = await h.adminToken();
    for (const url of ['/api/upload', '/api/uploads', '/api/admin/upload', '/api/products/upload', '/api/admin/products/upload', '/api/admin/products/image']) {
      const res = await h.post(url, { token, body: {} });
      expect([404, 405]).toContain(res.status);
    }
    const cat = await h.qaCategoryId();
    for (const bad of ['javascript:alert(1)', 'data:image/png;base64,AAAA', 'file:///etc/passwd', '//example.com/a.png', '/relative/a.png', 'ftp://example.com/a.png']) {
      const res = await h.post('/api/admin/products', { token, body: { ...VALID_PRODUCT, name: 'Img ' + h.uid(), category: cat, images: [bad] } });
      expect([bad, res.status]).toEqual([bad, 400]);
    }
    const ok = await h.post('/api/admin/products', { token, body: { ...VALID_PRODUCT, name: 'Img ' + h.uid(), category: cat, images: ['http://example.com/a.png', 'https://example.com/b.png'] } });
    expect(ok.status).toBe(201);
  });
});
