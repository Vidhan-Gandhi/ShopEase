const h = require('../support/helpers');

const WEAK = 'Password must be at least 8 characters and contain a letter and a number';
beforeEach(() => h.limiter.reset());

describe('FR-001 sign up', () => {
  test('TC-001 signup with valid data returns 201, token, role customer and no password', async () => {
    const email = h.uniqueEmail('asha');
    const res = await h.post('/api/auth/signup', { body: { name: 'Asha Rao', email, password: 'Shop1234' } });
    expect(res.status).toBe(201);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.user.role).toBe('customer');
    expect(res.body.user.email).toBe(email);
    expect(res.body.user.name).toBe('Asha Rao');
    expect(h.hasSecretKey(res.body)).toBe(false);
    const profile = await h.get('/api/profile', { token: res.body.token });
    expect(profile.status).toBe(200);
    expect(h.hasSecretKey(profile.body)).toBe(false);
  });

  test.each(['abcdefgh', '12345678', 'ab1'])('TC-002 weak password "%s" is rejected with the exact message', async (pw) => {
    const email = h.uniqueEmail();
    const res = await h.post('/api/auth/signup', { body: { name: 'Asha Rao', email, password: pw } });
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(expect.arrayContaining([{ field: 'password', message: WEAK }]));
    const again = await h.post('/api/auth/login', { body: { email, password: pw } });
    expect(again.status).toBe(401); // no account was created
  });

  test('TC-003 duplicate email (different case) returns 409 and exact message', async () => {
    const email = h.uniqueEmail('dup');
    await h.post('/api/auth/signup', { body: { name: 'Asha Rao', email, password: 'Shop1234' } });
    const res = await h.post('/api/auth/signup', { body: { name: 'Asha Two', email: email.toUpperCase(), password: 'Shop1234' } });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('An account with this email already exists');
    expect(res.body.errors).toEqual(expect.arrayContaining([{ field: 'email', message: 'An account with this email already exists' }]));
  });

  test('TC-004 empty name and invalid email return 400 with a message per field', async () => {
    const res = await h.post('/api/auth/signup', { body: { name: '', email: 'not-an-email', password: 'Shop1234' } });
    expect(res.status).toBe(400);
    const fields = res.body.errors.map((e) => e.field);
    expect(fields).toEqual(expect.arrayContaining(['name', 'email']));
    expect(res.body.errors.find((e) => e.field === 'email').message).toBe('Enter a valid email');
    expect(res.body.errors.find((e) => e.field === 'name').message).toBe('Name is required');
  });

  test('TC-005 role "admin" sent by the client is ignored (user is customer)', async () => {
    const res = await h.post('/api/auth/signup', { body: { name: 'Mallory', email: h.uniqueEmail(), password: 'Shop1234', role: 'admin' } });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('customer');
    const adminCall = await h.get('/api/admin/dashboard', { token: res.body.token });
    expect(adminCall.status).toBe(403);
  });

  test('TC-006 boundary lengths: name 1/51 chars, password 73 chars, email over 254 chars are rejected; 2/50/72 accepted', async () => {
    const bad = [
      { name: 'A', email: h.uniqueEmail(), password: 'Shop1234' },
      { name: 'A'.repeat(51), email: h.uniqueEmail(), password: 'Shop1234' },
      { name: 'Asha', email: h.uniqueEmail(), password: 'a1' + 'x'.repeat(71) },
      { name: 'Asha', email: 'a'.repeat(250) + '@example.com', password: 'Shop1234' },
    ];
    for (const body of bad) {
      const res = await h.post('/api/auth/signup', { body });
      expect(res.status).toBe(400);
    }
    const ok1 = await h.post('/api/auth/signup', { body: { name: 'Ab', email: h.uniqueEmail(), password: 'a1' + 'x'.repeat(70) } });
    expect(ok1.status).toBe(201);
    const ok2 = await h.post('/api/auth/signup', { body: { name: 'A'.repeat(50), email: h.uniqueEmail(), password: 'Shop1234' } });
    expect(ok2.status).toBe(201);
  });

  test('TC-007 NoSQL-operator objects and wrong types in signup fields are rejected with 400', async () => {
    const bodies = [
      { name: { $gt: '' }, email: h.uniqueEmail(), password: 'Shop1234' },
      { name: 'Asha', email: { $gt: '' }, password: 'Shop1234' },
      { name: 'Asha', email: h.uniqueEmail(), password: { $gt: '' } },
      { name: 12345, email: h.uniqueEmail(), password: 'Shop1234' },
      { name: 'Asha', email: ['a@b.co'], password: 'Shop1234' },
    ];
    for (const body of bodies) {
      const res = await h.post('/api/auth/signup', { body });
      expect(res.status).toBe(400);
      expect(res.body.message).toBeTruthy();
    }
  });

  test('TC-008 empty body returns 400 listing name, email and password', async () => {
    const res = await h.post('/api/auth/signup', { body: {} });
    expect(res.status).toBe(400);
    expect(res.body.errors.map((e) => e.field)).toEqual(expect.arrayContaining(['name', 'email', 'password']));
  });

  test('TC-009 email is stored trimmed and lowercase and login works with any case', async () => {
    const base = h.uniqueEmail('mixed');
    const res = await h.post('/api/auth/signup', { body: { name: 'Mixed Case', email: `  ${base.toUpperCase()}  `, password: 'Shop1234' } });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(base.toLowerCase());
    const login = await h.post('/api/auth/login', { body: { email: base, password: 'Shop1234' } });
    expect(login.status).toBe(200);
  });
});

describe('FR-002 login', () => {
  test('TC-010 seeded customer logs in: 200, token, role customer, no password', async () => {
    const res = await h.post('/api/auth/login', { body: h.SEED.asha });
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.user.role).toBe('customer');
    expect(res.body.user.email).toBe('asha@example.com');
    expect(h.hasSecretKey(res.body)).toBe(false);
  });

  test('TC-011 seeded admin logs in with role admin', async () => {
    const res = await h.post('/api/auth/login', { body: h.SEED.admin });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('admin');
  });

  test('TC-012 wrong password and unknown email give the identical 401 message and no token', async () => {
    const wrong = await h.post('/api/auth/login', { body: { email: 'asha@example.com', password: 'WrongPass1' } });
    const unknown = await h.post('/api/auth/login', { body: { email: h.uniqueEmail('nobody'), password: 'WrongPass1' } });
    for (const r of [wrong, unknown]) {
      expect(r.status).toBe(401);
      expect(r.body.message).toBe('Invalid email or password');
      expect(r.body.token).toBeUndefined();
    }
    expect(wrong.body).toEqual(unknown.body);
  });

  test('TC-013 empty email / empty password return 400 with "Email is required" / "Password is required"', async () => {
    const a = await h.post('/api/auth/login', { body: { email: '', password: 'Shop1234' } });
    expect(a.status).toBe(400);
    expect(a.body.errors).toEqual(expect.arrayContaining([{ field: 'email', message: 'Email is required' }]));
    const b = await h.post('/api/auth/login', { body: { email: 'asha@example.com', password: '' } });
    expect(b.status).toBe(400);
    expect(b.body.errors).toEqual(expect.arrayContaining([{ field: 'password', message: 'Password is required' }]));
    const c = await h.post('/api/auth/login', { body: {} });
    expect(c.status).toBe(400);
  });

  test('TC-014 login email match is case-insensitive and trimmed', async () => {
    const res = await h.post('/api/auth/login', { body: { email: '  ASHA@Example.COM ', password: 'Shop1234' } });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('asha@example.com');
  });

  test('TC-015 expired, tampered and wrong-secret tokens get 401 "Your session has expired. Please log in again"', async () => {
    const asha = await h.login(h.SEED.asha.email, h.SEED.asha.password);
    const expired = h.signToken({ id: asha.user.id, role: 'customer' }, { expiresIn: -60 });
    const tampered = asha.token.slice(0, -3) + (asha.token.endsWith('abc') ? 'xyz' : 'abc');
    const wrongSecret = h.signToken({ id: asha.user.id, role: 'customer' }, { expiresIn: '1h' }, 'another_secret');
    for (const token of [expired, tampered, wrongSecret, 'not.a.jwt']) {
      const res = await h.get('/api/profile', { token });
      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Your session has expired. Please log in again');
    }
  });

  test('TC-016 login with NoSQL operator objects is rejected (400) and never returns a token', async () => {
    for (const body of [
      { email: { $gt: '' }, password: 'Shop1234' },
      { email: 'asha@example.com', password: { $ne: null } },
      { email: { $regex: '.*' }, password: { $regex: '.*' } },
    ]) {
      const res = await h.post('/api/auth/login', { body });
      expect([400, 401]).toContain(res.status);
      expect(res.body.token).toBeUndefined();
    }
  });

  test('TC-017 protected endpoint without a token returns 401 "Please log in to continue"', async () => {
    const res = await h.get('/api/profile');
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Please log in to continue');
    const bad = await h.get('/api/profile', { headers: { Authorization: 'Token abc' } });
    expect(bad.status).toBe(401);
  });
});
