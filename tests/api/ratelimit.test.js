// FR-033 login rate limiting. Client IPs are chosen with X-Forwarded-For (TRUST_PROXY=true in jest.setup.js).
const h = require('../support/helpers');

const MSG = 'Too many failed login attempts. Please try again later.';
let ipSeq = 0;
const ip = () => `172.16.${Math.floor(++ipSeq / 250)}.${(ipSeq % 250) + 1}`;
const attempt = (email, password, from) => h.post('/api/auth/login', { body: { email, password }, ip: from });
const bad = (email, from) => attempt(email, 'WrongPass99', from);

beforeEach(() => {
  h.limiter.reset();
  delete process.env.LOGIN_RATE_LIMIT_WINDOW_MS;
  delete process.env.LOGIN_RATE_LIMIT_MAX;
});
afterEach(() => {
  delete process.env.LOGIN_RATE_LIMIT_WINDOW_MS;
  delete process.env.LOGIN_RATE_LIMIT_MAX;
});

describe('FR-033 login rate limit', () => {
  test('TC-166 4 wrong attempts then the correct password succeeds (200) and resets the email counter', async () => {
    const c = await h.signupCustomer();
    const ipA = ip();
    for (let i = 0; i < 4; i++) expect((await bad(c.email, ipA)).status).toBe(401);
    const ok = await attempt(c.email, c.password, ipA);
    expect(ok.status).toBe(200);
    expect(ok.body.token).toBeTruthy();
    // email counter was reset: 4 more failures from other IPs do not block the email
    for (let i = 0; i < 4; i++) expect((await bad(c.email, ip())).status).toBe(401);
    expect((await attempt(c.email, c.password, ip())).status).toBe(200);
  });

  test('TC-167 after 5 failed attempts the 6th (even with the correct password) is 429 with the exact message, Retry-After and no token', async () => {
    const c = await h.signupCustomer();
    const from = ip();
    for (let i = 0; i < 5; i++) expect((await bad(c.email, from)).status).toBe(401);
    const res = await attempt(c.email, c.password, from);
    expect(res.status).toBe(429);
    expect(res.body).toEqual({ message: MSG });
    expect(res.body.token).toBeUndefined();
    const retry = Number(res.headers['retry-after']);
    expect(Number.isInteger(retry)).toBe(true);
    expect(retry).toBeGreaterThanOrEqual(1);
    expect(retry).toBeLessThanOrEqual(900);
  });

  test('TC-168 per-email: 5 failures from 5 different IPs block that email from a 6th IP, but another email from that IP still logs in', async () => {
    const x = await h.signupCustomer();
    const y = await h.signupCustomer();
    for (let i = 0; i < 5; i++) expect((await bad(x.email, ip())).status).toBe(401);
    const sixth = ip();
    const blocked = await attempt(x.email, x.password, sixth);
    expect(blocked.status).toBe(429);
    expect(blocked.body.message).toBe(MSG);
    const other = await attempt(y.email, y.password, sixth);
    expect(other.status).toBe(200);
  });

  test('TC-169 per-IP: 5 failures from one IP with 5 different emails (incl. unregistered) block that IP; the same credentials from another IP work', async () => {
    const users = [await h.signupCustomer(), await h.signupCustomer(), await h.signupCustomer()];
    const clean = await h.signupCustomer();
    const from = ip();
    const emails = [users[0].email, users[1].email, users[2].email, h.uniqueEmail('ghost1'), h.uniqueEmail('ghost2')];
    for (const e of emails) expect((await bad(e, from)).status).toBe(401);
    const blocked = await attempt(clean.email, clean.password, from);
    expect(blocked.status).toBe(429);
    expect(blocked.body.message).toBe(MSG);
    expect((await attempt(h.uniqueEmail('ghost3'), 'Whatever1', from)).status).toBe(429);
    const elsewhere = await attempt(clean.email, clean.password, ip());
    expect(elsewhere.status).toBe(200);
  });

  test('TC-170 window expiry: still 429 inside the window, and a correct login succeeds after it ends (window set to 2.5 s for the test)', async () => {
    process.env.LOGIN_RATE_LIMIT_WINDOW_MS = '2500';
    const c = await h.signupCustomer();
    const from = ip();
    const t0 = Date.now();
    for (let i = 0; i < 5; i++) expect((await bad(c.email, from)).status).toBe(401);
    expect((await attempt(c.email, c.password, from)).status).toBe(429);
    await h.sleep(800);
    expect(Date.now() - t0).toBeLessThan(2400);
    expect((await attempt(c.email, c.password, from)).status).toBe(429);
    await h.sleep(Math.max(0, t0 + 2700 - Date.now()));
    const ok = await attempt(c.email, c.password, from);
    expect(ok.status).toBe(200);
    // counters were reset: a fresh failure is a plain 401 again
    expect((await bad(c.email, from)).status).toBe(401);
  });

  test('TC-171 email matching is case-insensitive: 3 failures for "Mixed@Case" + 2 for lowercase -> 6th with either spelling is 429', async () => {
    const c = await h.signupCustomer({ email: h.uniqueEmail('mixedcase') });
    const upper = c.email.replace(/^[a-z]/, (m) => m.toUpperCase()).replace('@example', '@Example');
    for (let i = 0; i < 3; i++) expect((await bad(upper, ip())).status).toBe(401);
    for (let i = 0; i < 2; i++) expect((await bad(c.email, ip())).status).toBe(401);
    expect((await attempt(c.email, c.password, ip())).status).toBe(429);
    expect((await attempt(upper, c.password, ip())).status).toBe(429);
    expect((await attempt('  ' + c.email.toUpperCase() + ' ', c.password, ip())).status).toBe(429);
  });

  test('TC-172 requests rejected with 400 (empty email / password) are never counted and never answered with 429', async () => {
    const c = await h.signupCustomer();
    const from = ip();
    for (let i = 0; i < 10; i++) {
      const a = await attempt('', 'Shop1234', from);
      const b = await attempt(c.email, '', from);
      expect(a.status).toBe(400);
      expect(b.status).toBe(400);
    }
    // not counted: five real failures are still plain 401s, the sixth attempt is the first 429
    for (let i = 0; i < 5; i++) expect((await bad(c.email, from)).status).toBe(401);
    expect((await attempt(c.email, c.password, from)).status).toBe(429);
  });

  test('TC-173 the 429 body has the NFR-008 shape and is identical for registered and unregistered emails (no existence leak)', async () => {
    const c = await h.signupCustomer();
    const ghost = h.uniqueEmail('ghost');
    for (let i = 0; i < 5; i++) {
      await bad(c.email, ip());
      await bad(ghost, ip());
    }
    const a = await attempt(c.email, 'Anything1', ip());
    const b = await attempt(ghost, 'Anything1', ip());
    for (const r of [a, b]) {
      expect(r.status).toBe(429);
      expect(r.body).toEqual({ message: MSG });
      expect(r.headers['retry-after']).toBeDefined();
      expect(r.headers['content-type']).toMatch(/json/);
    }
    expect(a.body).toEqual(b.body);
  });

  test('TC-174 blocked requests do not extend the window: Retry-After keeps shrinking', async () => {
    process.env.LOGIN_RATE_LIMIT_WINDOW_MS = '6000';
    const c = await h.signupCustomer();
    const from = ip();
    for (let i = 0; i < 5; i++) await bad(c.email, from);
    const first = await attempt(c.email, c.password, from);
    expect(first.status).toBe(429);
    const r1 = Number(first.headers['retry-after']);
    await h.sleep(1300);
    for (let i = 0; i < 3; i++) expect((await attempt(c.email, c.password, from)).status).toBe(429);
    const later = await attempt(c.email, c.password, from);
    expect(later.status).toBe(429);
    expect(Number(later.headers['retry-after'])).toBeLessThan(r1);
  });

  test('TC-175 sign-up is not rate limited: 8 sign-ups from one IP all succeed, also while that IP is blocked for login', async () => {
    const from = ip();
    for (let i = 0; i < 8; i++) {
      const res = await h.post('/api/auth/signup', { body: { name: 'Bulk User', email: h.uniqueEmail('bulk'), password: 'Shop1234' }, ip: from });
      expect(res.status).toBe(201);
    }
    for (let i = 0; i < 5; i++) await bad(h.uniqueEmail('ghost'), from);
    expect((await attempt(h.uniqueEmail('ghost'), 'Shop1234', from)).status).toBe(429);
    const res = await h.post('/api/auth/signup', { body: { name: 'Bulk User', email: h.uniqueEmail('bulk'), password: 'Shop1234' }, ip: from });
    expect(res.status).toBe(201);
  });

  test('TC-190 LOGIN_RATE_LIMIT_MAX is honoured at runtime (max 2); a success resets that email counter but not the IP counter', async () => {
    process.env.LOGIN_RATE_LIMIT_MAX = '2';
    const a = await h.signupCustomer();
    const b = await h.signupCustomer();
    const c = await h.signupCustomer();
    const from = ip();
    expect((await bad(a.email, from)).status).toBe(401); // IP count 1, a count 1
    expect((await attempt(b.email, b.password, from)).status).toBe(200); // success: resets b only
    expect((await bad(c.email, from)).status).toBe(401); // IP count 2 (not reset by the success)
    const blocked = await attempt(b.email, b.password, from);
    expect(blocked.status).toBe(429);
    // email counter: 1 failure, success (reset), 2 failures -> third attempt blocked, proving the reset
    const e = await h.signupCustomer();
    expect((await bad(e.email, ip())).status).toBe(401);
    expect((await attempt(e.email, e.password, ip())).status).toBe(200);
    expect((await bad(e.email, ip())).status).toBe(401);
    expect((await bad(e.email, ip())).status).toBe(401);
    expect((await attempt(e.email, e.password, ip())).status).toBe(429);
  });
});
