const h = require('../support/helpers');

beforeEach(() => h.limiter.reset());

describe('FR-003 profile', () => {
  test('TC-018 GET /api/profile returns name, email, phone and no password', async () => {
    const c = await h.signupCustomer({ name: 'Profile One' });
    const res = await h.get('/api/profile', { token: c.token });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ name: 'Profile One', email: c.email, phone: '', role: 'customer' });
    expect(h.hasSecretKey(res.body)).toBe(false);
  });

  test('TC-019 PUT /api/profile updates name and phone and the values persist', async () => {
    const c = await h.signupCustomer();
    const res = await h.put('/api/profile', { token: c.token, body: { name: 'Asha R', phone: '9876543210' } });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ name: 'Asha R', phone: '9876543210' });
    const again = await h.get('/api/profile', { token: c.token });
    expect(again.body.user).toMatchObject({ name: 'Asha R', phone: '9876543210' });
  });

  test('TC-020 invalid phone "12345" and empty name are rejected with exact messages and data is unchanged', async () => {
    const c = await h.signupCustomer({ name: 'Keep Me' });
    const a = await h.put('/api/profile', { token: c.token, body: { name: 'New Name', phone: '12345' } });
    expect(a.status).toBe(400);
    expect(a.body.errors).toEqual(expect.arrayContaining([{ field: 'phone', message: 'Enter a valid 10-digit mobile number' }]));
    const b = await h.put('/api/profile', { token: c.token, body: { name: '', phone: '9876543210' } });
    expect(b.status).toBe(400);
    expect(b.body.errors).toEqual(expect.arrayContaining([{ field: 'name', message: 'Name is required' }]));
    for (const phone of ['5876543210', '98765432101', '98765abcde']) {
      const r = await h.put('/api/profile', { token: c.token, body: { name: 'New Name', phone } });
      expect(r.status).toBe(400);
    }
    const now = await h.get('/api/profile', { token: c.token });
    expect(now.body.user).toMatchObject({ name: 'Keep Me', phone: '' });
  });

  test('TC-021 an empty phone clears the stored phone', async () => {
    const c = await h.signupCustomer();
    await h.put('/api/profile', { token: c.token, body: { name: 'Has Phone', phone: '9876543210' } });
    const res = await h.put('/api/profile', { token: c.token, body: { name: 'Has Phone', phone: '' } });
    expect(res.status).toBe(200);
    expect(res.body.user.phone).toBe('');
  });

  test('TC-022 email, role and userId in the profile body are ignored', async () => {
    const c = await h.signupCustomer();
    const other = await h.signupCustomer();
    const res = await h.put('/api/profile', {
      token: c.token,
      body: { name: 'Same Person', email: 'hacker@example.com', role: 'admin', userId: other.user.id, user: other.user.id, _id: other.user.id },
    });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(c.email);
    expect(res.body.user.role).toBe('customer');
    expect(res.body.user.id).toBe(c.user.id);
    const otherProfile = await h.get('/api/profile', { token: other.token });
    expect(otherProfile.body.user.name).toBe('QA Customer');
  });

  test('TC-023 guest GET/PUT /api/profile returns 401', async () => {
    expect((await h.get('/api/profile')).status).toBe(401);
    expect((await h.put('/api/profile', { body: { name: 'X Y' } })).status).toBe(401);
  });
});

describe('FR-005 change password', () => {
  test('TC-024 correct current password and valid new password: 200, new works, old no longer works', async () => {
    const c = await h.signupCustomer();
    const res = await h.put('/api/profile/password', { token: c.token, body: { currentPassword: c.password, newPassword: 'Newpass99' } });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Password changed successfully');
    expect((await h.post('/api/auth/login', { body: { email: c.email, password: 'Newpass99' } })).status).toBe(200);
    expect((await h.post('/api/auth/login', { body: { email: c.email, password: c.password } })).status).toBe(401);
  });

  test('TC-025 wrong current password returns 400 "Current password is incorrect" and password unchanged', async () => {
    const c = await h.signupCustomer();
    const res = await h.put('/api/profile/password', { token: c.token, body: { currentPassword: 'WrongPass1', newPassword: 'Newpass99' } });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Current password is incorrect');
    expect((await h.post('/api/auth/login', { body: { email: c.email, password: c.password } })).status).toBe(200);
  });

  test('TC-026 new password "short1", no digit, no letter, or same as current is rejected', async () => {
    const c = await h.signupCustomer();
    const weak = 'Password must be at least 8 characters and contain a letter and a number';
    for (const newPassword of ['short1', 'abcdefghi', '123456789']) {
      const res = await h.put('/api/profile/password', { token: c.token, body: { currentPassword: c.password, newPassword } });
      expect(res.status).toBe(400);
      expect(res.body.errors).toEqual(expect.arrayContaining([{ field: 'newPassword', message: weak }]));
    }
    const same = await h.put('/api/profile/password', { token: c.token, body: { currentPassword: c.password, newPassword: c.password } });
    expect(same.status).toBe(400);
    expect(same.body.message).toBe('New password must be different');
    expect((await h.post('/api/auth/login', { body: { email: c.email, password: c.password } })).status).toBe(200);
  });

  test('TC-027 guest PUT /api/profile/password returns 401', async () => {
    const res = await h.put('/api/profile/password', { body: { currentPassword: 'Shop1234', newPassword: 'Newpass99' } });
    expect(res.status).toBe(401);
  });

  test('TC-028 missing currentPassword or object-typed passwords return 400', async () => {
    const c = await h.signupCustomer();
    const a = await h.put('/api/profile/password', { token: c.token, body: { newPassword: 'Newpass99' } });
    expect(a.status).toBe(400);
    expect(a.body.errors.map((e) => e.field)).toContain('currentPassword');
    const b = await h.put('/api/profile/password', { token: c.token, body: { currentPassword: { $ne: '' }, newPassword: 'Newpass99' } });
    expect(b.status).toBe(400);
    const d = await h.put('/api/profile/password', { token: c.token, body: { currentPassword: c.password, newPassword: 'a1' + 'x'.repeat(71) } });
    expect(d.status).toBe(400);
  });
});
