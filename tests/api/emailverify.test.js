// ONC-001 email verification: API tests (TC-300 ...).
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const h = require('../support/helpers');
const bcrypt = require('../../backend/node_modules/bcryptjs');
const resendLimiter = require('../../backend/src/utils/resendLimiter');
const emailService = require('../../backend/src/utils/emailService');

const INVALID = 'This verification link is invalid or has expired';
const DISPOSABLE = 'Disposable email addresses are not allowed. Please use a permanent email';
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const tokensCol = () => h.db().collection('emailverificationtokens');
const usersCol = () => h.db().collection('users');

beforeEach(() => {
  h.limiter.reset();
  resendLimiter.reset();
});

/** Runs fn with env vars temporarily changed (undefined = delete). */
async function withEnv(vars, fn) {
  const saved = {};
  for (const k of Object.keys(vars)) {
    saved[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  }
  try {
    return await fn();
  } finally {
    for (const k of Object.keys(vars)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}
async function newUnverified(prefix = 'unv') {
  const email = h.uniqueEmail(prefix);
  const res = await h.signupRaw('Unverified User', email);
  if (res.status !== 201) throw new Error('signup failed ' + res.status + JSON.stringify(res.body));
  return { email, password: 'Shop1234', token: await h.latestToken(email) };
}

describe('ONC-001-1 sign-up creates an unverified account and sends a verification email', () => {
  test('TC-300 signup returns 201 {message,user.emailVerified=false}, no token, and sends exactly one email with a verify link containing a 64-hex token', async () => {
    const email = h.uniqueEmail('s1');
    const res = await h.signupRaw('Asha Rao', email);
    expect(res.status).toBe(201);
    expect(typeof res.body.message).toBe('string');
    expect(res.body.user.emailVerified).toBe(false);
    expect(res.body.user.email).toBe(email);
    expect(res.body.token).toBeUndefined();
    const mails = await h.emailsFor(email);
    expect(mails).toHaveLength(1);
    expect(mails[0].to).toBe(email);
    expect(mails[0].link).toMatch(/\/verify-email\?token=[0-9a-f]{64}$/);
    expect(mails[0].token).toMatch(/^[0-9a-f]{64}$/);
    expect(mails[0].link).toContain(mails[0].token);
  });

  test('TC-301 signup with an already registered email still returns 409 and sends no extra email', async () => {
    const email = h.uniqueEmail('dup');
    expect((await h.signupRaw('First', email)).status).toBe(201);
    const second = await h.signupRaw('Second', email.toUpperCase());
    expect(second.status).toBe(409);
    expect(second.body.message).toBe('An account with this email already exists');
    expect(await h.emailsFor(email)).toHaveLength(1);
    const seeded = await h.signupRaw('Asha Again', h.SEED.asha.email);
    expect(seeded.status).toBe(409);
  });

  test('TC-302 signup still returns 201 when SMTP is not configured or unreachable (account is created, error only logged)', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const a = h.uniqueEmail('nosmtp');
      const r1 = await withEnv({ NODE_ENV: 'production', SMTP_HOST: undefined }, () => h.signupRaw('No Smtp', a));
      expect(r1.status).toBe(201);
      expect(r1.body.user.emailVerified).toBe(false);
      expect(warn).toHaveBeenCalled(); // SMTP_HOST empty: a warning is logged
      expect(await h.emailsFor(a)).toHaveLength(0); // nothing captured, nothing sent
      const b = h.uniqueEmail('badsmtp');
      const r2 = await withEnv({ NODE_ENV: 'production', SMTP_HOST: '127.0.0.1', SMTP_PORT: '1' }, () => h.signupRaw('Bad Smtp', b));
      expect(r2.status).toBe(201);
      expect(await usersCol().countDocuments({ email: { $in: [a, b] } })).toBe(2);
    } finally {
      warn.mockRestore();
      err.mockRestore();
      log.mockRestore();
    }
  });

  test('TC-303 signup field rules are unchanged: invalid fields return 400 with field errors, no account and no email', async () => {
    const email = h.uniqueEmail('rules');
    const res = await h.post('/api/auth/signup', { body: { name: 'A', email: 'not-an-email', password: 'abc' } });
    expect(res.status).toBe(400);
    expect(res.body.errors.map((e) => e.field)).toEqual(expect.arrayContaining(['name', 'email', 'password']));
    const weak = await h.signupRaw('Valid Name', email, 'abcdefgh');
    expect(weak.status).toBe(400);
    expect(await h.emailsFor(email)).toHaveLength(0);
    expect(await usersCol().countDocuments({ email })).toBe(0);
  });

  test('TC-304 signup response never exposes a password or token; HTML in the name is escaped in the email body', async () => {
    const email = h.uniqueEmail('xssmail');
    const res = await h.signupRaw('<script>alert(1)</script>', email);
    expect(res.status).toBe(201);
    expect(h.hasSecretKey(res.body)).toBe(false);
    expect(JSON.stringify(res.body)).not.toMatch(/[0-9a-f]{64}/);
    const [mail] = await h.emailsFor(email);
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
  });
});

describe('ONC-001-2 token: hashed, single use, 24 hours', () => {
  test('TC-305 POST /api/auth/verify-email with a valid token returns 200 and the user becomes emailVerified=true', async () => {
    const u = await newUnverified('v1');
    const res = await h.post('/api/auth/verify-email', { body: { token: u.token } });
    expect(res.status).toBe(200);
    expect(typeof res.body.message).toBe('string');
    const doc = await usersCol().findOne({ email: u.email });
    expect(doc.emailVerified).toBe(true);
    const login = await h.post('/api/auth/login', { body: { email: u.email, password: u.password } });
    expect(login.status).toBe(200);
    expect(login.body.user.emailVerified).toBe(true);
  });

  test('TC-306 using the same token a second time returns 400 "This verification link is invalid or has expired"', async () => {
    const u = await newUnverified('v2');
    expect((await h.post('/api/auth/verify-email', { body: { token: u.token } })).status).toBe(200);
    const again = await h.post('/api/auth/verify-email', { body: { token: u.token } });
    expect(again.status).toBe(400);
    expect(again.body.message).toBe(INVALID);
  });

  test('TC-307 an expired token (older than 24 hours) returns 400 with the same message and does not verify the user', async () => {
    const u = await newUnverified('v3');
    await tokensCol().updateOne({ tokenHash: sha(u.token) }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const res = await h.post('/api/auth/verify-email', { body: { token: u.token } });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(INVALID);
    expect((await usersCol().findOne({ email: u.email })).emailVerified).toBe(false);
  });

  test('TC-308 unknown and malformed tokens return 400 with the same message', async () => {
    for (const token of [crypto.randomBytes(32).toString('hex'), 'abc', 'x'.repeat(64), '../../etc/passwd', 'a'.repeat(65)]) {
      const res = await h.post('/api/auth/verify-email', { body: { token } });
      expect([token, res.status]).toEqual([token, 400]);
      expect(res.body.message).toBe(INVALID);
    }
  });

  test('TC-309 missing, empty or non-string token returns 400 with field "token" and message "Token is required"', async () => {
    for (const body of [{}, { token: '' }, { token: '   ' }, { token: null }, { token: 12345 }, { token: { $gt: '' } }, { token: ['a'] }]) {
      const res = await h.post('/api/auth/verify-email', { body });
      expect([JSON.stringify(body), res.status]).toEqual([JSON.stringify(body), 400]);
      const e = (res.body.errors || []).find((x) => x.field === 'token');
      expect(e).toBeTruthy();
      expect(e.message).toBe('Token is required');
    }
  });

  test('TC-310 only the SHA-256 hash of the token is stored in collection emailverificationtokens, never the raw value', async () => {
    const u = await newUnverified('v4');
    const doc = await tokensCol().findOne({ tokenHash: sha(u.token) });
    expect(doc).toBeTruthy();
    expect(doc.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(doc.tokenHash).not.toBe(u.token);
    expect(await tokensCol().countDocuments({ tokenHash: u.token })).toBe(0);
    expect(JSON.stringify(doc)).not.toContain(u.token);
    expect(doc.expiresAt.getTime()).toBeGreaterThan(Date.now() + 23 * 3600 * 1000);
    expect(doc.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 24 * 3600 * 1000 + 60000);
  });

  test('TC-311 after a resend the older token no longer works and the new one does', async () => {
    const u = await newUnverified('v5');
    const r = await h.post('/api/auth/resend-verification', { body: { email: u.email } });
    expect(r.status).toBe(200);
    const mails = await h.emailsFor(u.email);
    expect(mails).toHaveLength(2);
    const [oldT, newT] = [mails[0].token, mails[1].token];
    expect(newT).not.toBe(oldT);
    const old = await h.post('/api/auth/verify-email', { body: { token: oldT } });
    expect(old.status).toBe(400);
    expect(old.body.message).toBe(INVALID);
    expect((await h.post('/api/auth/verify-email', { body: { token: newT } })).status).toBe(200);
  });

  test("TC-312 two signups get different random tokens and one user's token cannot verify another user", async () => {
    const a = await newUnverified('v6a');
    const b = await newUnverified('v6b');
    expect(a.token).not.toBe(b.token);
    expect((await h.post('/api/auth/verify-email', { body: { token: a.token } })).status).toBe(200);
    expect((await usersCol().findOne({ email: b.email })).emailVerified).toBe(false);
    expect((await h.post('/api/auth/login', { body: { email: b.email, password: b.password } })).status).toBe(403);
  });
});

describe('ONC-001-4 unverified customers cannot log in', () => {
  test('TC-313 login with the correct password of an unverified customer returns 403 {message,code,email} and no token', async () => {
    const u = await newUnverified('l1');
    const res = await h.post('/api/auth/login', { body: { email: u.email, password: u.password } });
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Please verify your email first');
    expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
    expect(res.body.email).toBe(u.email);
    expect(res.body.token).toBeUndefined();
  });

  test('TC-314 login with a wrong password for an unverified account returns 401 "Invalid email or password" (same as unknown email, no leak)', async () => {
    const u = await newUnverified('l2');
    const wrong = await h.post('/api/auth/login', { body: { email: u.email, password: 'Wrong1234' } });
    const unknown = await h.post('/api/auth/login', { body: { email: h.uniqueEmail('ghost'), password: 'Wrong1234' } });
    expect(wrong.status).toBe(401);
    expect(wrong.body.message).toBe('Invalid email or password');
    expect(wrong.body).toEqual(unknown.body);
    expect(wrong.body.code).toBeUndefined();
  });

  test('TC-315 after verifying, the customer logs in with 200 and a token that works on protected endpoints', async () => {
    const u = await newUnverified('l3');
    expect((await h.post('/api/auth/login', { body: { email: u.email, password: u.password } })).status).toBe(403);
    await h.post('/api/auth/verify-email', { body: { token: u.token } });
    const res = await h.post('/api/auth/login', { body: { email: u.email, password: u.password } });
    expect(res.status).toBe(200);
    expect((await h.get('/api/profile', { token: res.body.token })).status).toBe(200);
  });

  test('TC-316 an unverified customer has no way to get a session: no token from signup, login or verify-email', async () => {
    const email = h.uniqueEmail('l4');
    const s = await h.signupRaw('No Session', email);
    expect(s.body.token).toBeUndefined();
    const l = await h.post('/api/auth/login', { body: { email, password: 'Shop1234' } });
    expect(l.body.token).toBeUndefined();
    const v = await h.post('/api/auth/verify-email', { body: { token: await h.latestToken(email) } });
    expect(v.body.token).toBeUndefined();
    expect(JSON.stringify(v.body)).not.toMatch(/eyJ/);
  });

  test('TC-317 repeated 403 unverified logins do not trigger the failed-login rate limiter (FR-033 counts only wrong passwords)', async () => {
    const u = await newUnverified('l5');
    const ip = '10.200.1.1';
    for (let i = 0; i < 7; i += 1) {
      const r = await h.post('/api/auth/login', { body: { email: u.email, password: u.password }, ip });
      expect(r.status).toBe(403);
    }
  });
});

describe('ONC-001-5 resend verification, max 3 per hour', () => {
  test('TC-318 resend for an unverified customer returns 200 with a generic message and sends a new email with a new token', async () => {
    const u = await newUnverified('r1');
    const res = await h.post('/api/auth/resend-verification', { body: { email: u.email } });
    expect(res.status).toBe(200);
    expect(typeof res.body.message).toBe('string');
    const mails = await h.emailsFor(u.email);
    expect(mails).toHaveLength(2);
    expect(mails[1].token).not.toBe(mails[0].token);
    expect(mails[1].link).toMatch(/\/verify-email\?token=[0-9a-f]{64}$/);
  });

  test('TC-319 the 4th resend within an hour returns 429 with a positive Retry-After header and sends no email; the signup email does not count', async () => {
    const u = await newUnverified('r2');
    for (let i = 0; i < 3; i += 1) {
      const ok = await h.post('/api/auth/resend-verification', { body: { email: u.email } });
      expect([i, ok.status]).toEqual([i, 200]);
    }
    expect(await h.emailsFor(u.email)).toHaveLength(4); // 1 signup + 3 resends
    const blocked = await h.post('/api/auth/resend-verification', { body: { email: u.email } });
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(Number(blocked.headers['retry-after'])).toBeLessThanOrEqual(3600);
    expect(typeof blocked.body.message).toBe('string');
    expect(await h.emailsFor(u.email)).toHaveLength(4);
  });

  test('TC-320 resend for unknown, verified or admin emails returns the same generic 200 body and sends no email (no enumeration)', async () => {
    const u = await newUnverified('r3');
    const real = await h.post('/api/auth/resend-verification', { body: { email: u.email } });
    const unknown = await h.post('/api/auth/resend-verification', { body: { email: h.uniqueEmail('nobody') } });
    const verified = await h.post('/api/auth/resend-verification', { body: { email: h.SEED.asha.email } });
    const admin = await h.post('/api/auth/resend-verification', { body: { email: h.SEED.admin.email } });
    for (const r of [unknown, verified, admin]) {
      expect(r.status).toBe(200);
      expect(r.body).toEqual(real.body);
    }
    expect(await h.emailsFor(h.SEED.asha.email)).toHaveLength(0);
    expect(await h.emailsFor(h.SEED.admin.email)).toHaveLength(0);
  });

  test('TC-321 resend attempts for unknown emails still count toward the limit (4th gets 429, same as a real account)', async () => {
    const ghost = h.uniqueEmail('ghost');
    const codes = [];
    for (let i = 0; i < 4; i += 1) codes.push((await h.post('/api/auth/resend-verification', { body: { email: ghost } })).status);
    expect(codes).toEqual([200, 200, 200, 429]);
  });

  test('TC-322 resend with a missing, empty, malformed or non-string email returns 400 with field "email"', async () => {
    for (const body of [{}, { email: '' }, { email: 'not-an-email' }, { email: 123 }, { email: { $gt: '' } }, { email: 'a'.repeat(250) + '@example.com' }]) {
      const res = await h.post('/api/auth/resend-verification', { body });
      const label = JSON.stringify(body).slice(0, 40);
      expect([label, res.status]).toEqual([label, 400]);
      expect((res.body.errors || []).some((e) => e.field === 'email')).toBe(true);
    }
  });

  test('TC-323 the resend limit is per email and case-insensitive; other emails are not affected', async () => {
    const a = await newUnverified('r4a');
    const b = await newUnverified('r4b');
    for (let i = 0; i < 3; i += 1) await h.post('/api/auth/resend-verification', { body: { email: i % 2 ? a.email.toUpperCase() : a.email } });
    expect((await h.post('/api/auth/resend-verification', { body: { email: a.email } })).status).toBe(429);
    expect((await h.post('/api/auth/resend-verification', { body: { email: ` ${a.email.toUpperCase()} ` } })).status).toBe(429);
    expect((await h.post('/api/auth/resend-verification', { body: { email: b.email } })).status).toBe(200);
  });

  test('TC-324 resend response never contains a token or link', async () => {
    const u = await newUnverified('r5');
    const res = await h.post('/api/auth/resend-verification', { body: { email: u.email } });
    expect(JSON.stringify(res.body)).not.toMatch(/[0-9a-f]{64}/);
    expect(JSON.stringify(res.body)).not.toContain('verify-email');
  });
});

describe('ONC-001-6 disposable email domains are blocked at sign-up', () => {
  test('TC-325 sign-up with mailinator.com, yopmail.com, guerrillamail.com or 10minutemail.com returns 400 field email with the exact message and creates no account', async () => {
    for (const domain of ['mailinator.com', 'yopmail.com', 'guerrillamail.com', '10minutemail.com']) {
      const email = `blocked.${h.uid()}@${domain}`;
      const res = await h.signupRaw('Temp User', email);
      expect([domain, res.status]).toEqual([domain, 400]);
      expect(res.body.errors).toEqual([{ field: 'email', message: DISPOSABLE }]);
      expect(await usersCol().countDocuments({ email })).toBe(0);
      expect(await h.emailsFor(email)).toHaveLength(0);
    }
  });

  test('TC-326 subdomains of a disposable domain and upper-case domains are blocked as well', async () => {
    for (const email of [`a.${h.uid()}@sub.yopmail.com`, `a.${h.uid()}@MAILINATOR.COM`, `a.${h.uid()}@Deep.Sub.Mailinator.Com`]) {
      const res = await h.signupRaw('Temp User', email);
      expect([email, res.status]).toEqual([email, 400]);
      expect(res.body.errors[0]).toEqual({ field: 'email', message: DISPOSABLE });
    }
  });

  test('TC-327 normal domains (example.com, gmail.com) and look-alike domains (notmailinator.com, mailinator.example.org) are accepted', async () => {
    for (const email of [`ok.${h.uid()}@example.com`, `ok.${h.uid()}@gmail.com`, `ok.${h.uid()}@notmailinator.com`, `ok.${h.uid()}@mailinator.example.org`]) {
      const res = await h.signupRaw('Normal User', email);
      expect([email, res.status]).toEqual([email, 201]);
    }
  });
});

describe('ONC-001-7 SMTP configuration', () => {
  test('TC-328 backend/.env.example lists SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM and APP_URL with empty values', () => {
    const text = fs.readFileSync(path.join(__dirname, '..', '..', 'backend', '.env.example'), 'utf8');
    for (const key of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM', 'APP_URL']) {
      expect([key, new RegExp(`^${key}=\\s*$`, 'm').test(text)]).toEqual([key, true]);
    }
  });

  test('TC-329 the verification link uses APP_URL when set and falls back to http://localhost:5173 when APP_URL is empty', async () => {
    const a = h.uniqueEmail('app1');
    await withEnv({ APP_URL: 'https://shop.example.org/' }, () => h.signupRaw('App Url', a));
    expect((await h.emailsFor(a))[0].link).toMatch(/^https:\/\/shop\.example\.org\/verify-email\?token=[0-9a-f]{64}$/);
    const b = h.uniqueEmail('app2');
    await withEnv({ APP_URL: '' }, () => h.signupRaw('App Url', b));
    expect((await h.emailsFor(b))[0].link).toMatch(/^http:\/\/localhost:5173\/verify-email\?token=[0-9a-f]{64}$/);
  });

  test('TC-330 emails are captured in memory (not sent) when NODE_ENV=test, with the right recipient and a subject', async () => {
    const email = h.uniqueEmail('cap');
    await h.signupRaw('Capture Me', email);
    const outbox = emailService.getOutbox(email);
    expect(outbox).toHaveLength(1);
    expect(outbox[0].to).toBe(email);
    expect(typeof outbox[0].subject).toBe('string');
    expect(outbox[0].subject.length).toBeGreaterThan(0);
  });
});

describe('ONC-001-8 test mode captures emails', () => {
  test('TC-331 GET /api/test/emails?to=<email> returns items[] with link and token, filtered by recipient', async () => {
    const a = await newUnverified('t1a');
    const b = await newUnverified('t1b');
    const res = await h.get('/api/test/emails?to=' + encodeURIComponent(a.email));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].token).toBe(a.token);
    expect(res.body.items[0].link).toContain(a.token);
    const all = await h.get('/api/test/emails');
    expect(all.status).toBe(200);
    const tos = all.body.items.map((i) => i.to);
    expect(tos).toEqual(expect.arrayContaining([a.email, b.email]));
  });

  test('TC-332 DELETE /api/test/emails clears the captured emails and resets the resend counters', async () => {
    const u = await newUnverified('t2');
    for (let i = 0; i < 3; i += 1) await h.post('/api/auth/resend-verification', { body: { email: u.email } });
    expect((await h.post('/api/auth/resend-verification', { body: { email: u.email } })).status).toBe(429);
    const del = await h.del('/api/test/emails');
    expect(del.status).toBe(200);
    expect(await h.emailsFor(u.email)).toHaveLength(0);
    expect((await h.get('/api/test/emails')).body.items).toHaveLength(0);
    expect((await h.post('/api/auth/resend-verification', { body: { email: u.email } })).status).toBe(200);
  });

  test('TC-333 GET and DELETE /api/test/emails answer 404 when NODE_ENV is not "test" and expose nothing', async () => {
    const u = await newUnverified('t3');
    for (const env of ['production', 'development', '']) {
      await withEnv({ NODE_ENV: env }, async () => {
        const g = await h.get('/api/test/emails?to=' + encodeURIComponent(u.email));
        expect([env, g.status]).toEqual([env, 404]);
        expect(JSON.stringify(g.body)).not.toContain(u.token);
        const d = await h.del('/api/test/emails');
        expect([env, d.status]).toEqual([env, 404]);
      });
    }
    expect(await h.emailsFor(u.email)).toHaveLength(1); // the 404 DELETE did not clear anything
  });
});

describe('ONC-001-9 seed users and legacy users stay verified, admin unaffected', () => {
  test('TC-334 seeded admin, asha and ravi have emailVerified=true and log in without verification', async () => {
    for (const u of [h.SEED.admin, h.SEED.asha, h.SEED.ravi]) {
      const doc = await usersCol().findOne({ email: u.email });
      expect([u.email, doc.emailVerified]).toEqual([u.email, true]);
      const res = await h.post('/api/auth/login', { body: u });
      expect([u.email, res.status]).toEqual([u.email, 200]);
      expect(res.body.user.emailVerified).toBe(true);
    }
  });

  test('TC-335 a legacy user without an emailVerified field is treated as verified (login 200, serialized emailVerified=true)', async () => {
    const email = h.uniqueEmail('legacy');
    await usersCol().insertOne({ name: 'Legacy User', email, password: await bcrypt.hash('Shop1234', 4), role: 'customer', addresses: [], createdAt: new Date(), updatedAt: new Date() });
    const res = await h.post('/api/auth/login', { body: { email, password: 'Shop1234' } });
    expect(res.status).toBe(200);
    expect(res.body.user.emailVerified).toBe(true);
  });

  test('TC-336 an admin account is exempt from the verified check even if emailVerified=false', async () => {
    const email = h.uniqueEmail('adm');
    await usersCol().insertOne({ name: 'Odd Admin', email, password: await bcrypt.hash('Admin@123', 4), role: 'admin', emailVerified: false, addresses: [], createdAt: new Date(), updatedAt: new Date() });
    const res = await h.post('/api/auth/login', { body: { email, password: 'Admin@123' } });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('admin');
  });
});

describe('ONC-001 security', () => {
  test('TC-337 verify-email and resend-verification are public endpoints (no login token needed) and ignore a bogus Authorization header', async () => {
    const u = await newUnverified('sec1');
    const r = await h.post('/api/auth/resend-verification', { body: { email: u.email }, token: 'garbage.token.value' });
    expect(r.status).toBe(200);
    const v = await h.post('/api/auth/verify-email', { body: { token: await h.latestToken(u.email) }, token: 'garbage.token.value' });
    expect(v.status).toBe(200);
  });

  test('TC-338 NoSQL operator and script payloads in token and email fields are rejected safely (400, never 500, never a verification)', async () => {
    const u = await newUnverified('sec2');
    const payloads = [{ token: { $ne: null } }, { token: { $regex: '.*' } }, { token: { $gt: '' } }, { token: '<script>alert(1)</script>' }, { token: "' OR '1'='1" }];
    for (const body of payloads) {
      const res = await h.post('/api/auth/verify-email', { body });
      expect([JSON.stringify(body), res.status]).toEqual([JSON.stringify(body), 400]);
      expect(res.headers['content-type']).toMatch(/application\/json/);
    }
    expect((await usersCol().findOne({ email: u.email })).emailVerified).toBe(false);
    for (const body of [{ email: { $ne: null } }, { email: '<script>alert(1)</script>@example.com' }]) {
      const res = await h.post('/api/auth/resend-verification', { body });
      expect([JSON.stringify(body), res.status]).toEqual([JSON.stringify(body), 400]);
    }
  });

  test('TC-339 a client cannot set emailVerified=true or role at sign-up (extra fields ignored; account stays unverified)', async () => {
    const email = h.uniqueEmail('sec3');
    const res = await h.signupRaw('Sneaky', email, 'Shop1234', { emailVerified: true, role: 'admin', isAdmin: true });
    expect(res.status).toBe(201);
    expect(res.body.user.emailVerified).toBe(false);
    expect(res.body.user.role).toBe('customer');
    expect((await h.post('/api/auth/login', { body: { email, password: 'Shop1234' } })).status).toBe(403);
  });

  test('TC-340 no database document contains the raw token', async () => {
    const u = await newUnverified('sec4');
    const all = await tokensCol().find({}).toArray();
    expect(JSON.stringify(all)).not.toContain(u.token);
    const user = await usersCol().findOne({ email: u.email });
    expect(JSON.stringify(user)).not.toContain(u.token);
  });

  test('TC-341 verify-email rejects an oversize token (5000 chars) with 400, not 500', async () => {
    const res = await h.post('/api/auth/verify-email', { body: { token: 'a'.repeat(5000) } });
    expect(res.status).toBe(400);
  });
});
