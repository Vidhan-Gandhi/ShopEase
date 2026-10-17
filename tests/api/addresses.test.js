const h = require('../support/helpers');

describe('FR-004 addresses', () => {
  test('TC-029 the first saved address becomes the default automatically', async () => {
    const c = await h.signupCustomer();
    const res = await h.post('/api/addresses', { token: c.token, body: h.addressBody() });
    expect(res.status).toBe(201);
    expect(res.body.address.isDefault).toBe(true);
    const list = await h.get('/api/addresses', { token: c.token });
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].isDefault).toBe(true);
  });

  test('TC-030 marking address B as default leaves exactly one default (B)', async () => {
    const c = await h.signupCustomer();
    const a = await h.addAddress(c.token, { name: 'Addr A' });
    const b = await h.addAddress(c.token, { name: 'Addr B' });
    expect(b.isDefault).toBe(false);
    const res = await h.patch(`/api/addresses/${b.id}/default`, { token: c.token });
    expect(res.status).toBe(200);
    const defaults = res.body.items.filter((x) => x.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].id).toBe(b.id);
    expect(res.body.items.find((x) => x.id === a.id).isDefault).toBe(false);
    const c3 = await h.post('/api/addresses', { token: c.token, body: h.addressBody({ name: 'Addr C', isDefault: true }) });
    expect(c3.body.address.isDefault).toBe(true);
    const list = await h.get('/api/addresses', { token: c.token });
    expect(list.body.items.filter((x) => x.isDefault)).toHaveLength(1);
  });

  test('TC-031 deleting the default address makes the most recently added remaining address default', async () => {
    const c = await h.signupCustomer();
    const a = await h.addAddress(c.token, { name: 'Addr A' });
    await h.addAddress(c.token, { name: 'Addr B' });
    const third = await h.addAddress(c.token, { name: 'Addr C' });
    const res = await h.del(`/api/addresses/${a.id}`, { token: c.token });
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    const defaults = res.body.items.filter((x) => x.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].id).toBe(third.id);
  });

  test('TC-032 invalid pincode / phone / empty city are rejected with per-field messages and nothing is saved', async () => {
    const c = await h.signupCustomer();
    for (const pincode of ['0123', '12345a', '012345', '1234567']) {
      const res = await h.post('/api/addresses', { token: c.token, body: h.addressBody({ pincode }) });
      expect(res.status).toBe(400);
      expect(res.body.errors).toEqual(expect.arrayContaining([{ field: 'pincode', message: 'Enter a valid 6-digit pincode' }]));
    }
    const city = await h.post('/api/addresses', { token: c.token, body: h.addressBody({ city: '' }) });
    expect(city.status).toBe(400);
    expect(city.body.errors.map((e) => e.field)).toContain('city');
    const phone = await h.post('/api/addresses', { token: c.token, body: h.addressBody({ phone: '5876543210' }) });
    expect(phone.status).toBe(400);
    expect(phone.body.errors).toEqual(expect.arrayContaining([{ field: 'phone', message: 'Enter a valid 10-digit mobile number' }]));
    const missing = await h.post('/api/addresses', { token: c.token, body: {} });
    expect(missing.status).toBe(400);
    expect((await h.get('/api/addresses', { token: c.token })).body.items).toHaveLength(0);
  });

  test("TC-033 customer X cannot read, edit, set default or delete customer Y's address (404, unchanged)", async () => {
    const x = await h.signupCustomer();
    const y = await h.signupCustomer();
    const addr = await h.addAddress(y.token, { name: 'Y Home' });
    const put = await h.put(`/api/addresses/${addr.id}`, { token: x.token, body: h.addressBody({ name: 'Hacked' }) });
    expect([403, 404]).toContain(put.status);
    expect((await h.patch(`/api/addresses/${addr.id}/default`, { token: x.token })).status).toBe(404);
    expect((await h.del(`/api/addresses/${addr.id}`, { token: x.token })).status).toBe(404);
    const xList = await h.get('/api/addresses', { token: x.token });
    expect(xList.body.items).toHaveLength(0);
    const yList = await h.get('/api/addresses', { token: y.token });
    expect(yList.body.items).toHaveLength(1);
    expect(yList.body.items[0].name).toBe('Y Home');
  });

  test('TC-034 guest calls to every address endpoint return 401', async () => {
    const id = '507f1f77bcf86cd799439011';
    expect((await h.get('/api/addresses')).status).toBe(401);
    expect((await h.post('/api/addresses', { body: h.addressBody() })).status).toBe(401);
    expect((await h.put(`/api/addresses/${id}`, { body: h.addressBody() })).status).toBe(401);
    expect((await h.patch(`/api/addresses/${id}/default`)).status).toBe(401);
    expect((await h.del(`/api/addresses/${id}`)).status).toBe(401);
  });

  test('TC-035 PUT replaces fields; isDefault:false on the current default is ignored; unknown id is 404', async () => {
    const c = await h.signupCustomer();
    const a = await h.addAddress(c.token, { name: 'Old Name' });
    const res = await h.put(`/api/addresses/${a.id}`, { token: c.token, body: h.addressBody({ name: 'New Name', city: 'Mumbai', isDefault: false }) });
    expect(res.status).toBe(200);
    expect(res.body.address).toMatchObject({ name: 'New Name', city: 'Mumbai', isDefault: true });
    expect((await h.put('/api/addresses/507f1f77bcf86cd799439011', { token: c.token, body: h.addressBody() })).status).toBe(404);
    expect((await h.put('/api/addresses/not-an-id', { token: c.token, body: h.addressBody() })).status).toBe(404);
    const bad = await h.put(`/api/addresses/${a.id}`, { token: c.token, body: h.addressBody({ pincode: '0123' }) });
    expect(bad.status).toBe(400);
  });

  test('TC-037 field maximum lengths: addressLine 151, name 51, city 51, state 51 chars are rejected; 150/50 accepted', async () => {
    const c = await h.signupCustomer();
    for (const o of [{ addressLine: 'x'.repeat(151) }, { name: 'x'.repeat(51) }, { city: 'x'.repeat(51) }, { state: 'x'.repeat(51) }, { addressLine: 'abcd' }]) {
      const res = await h.post('/api/addresses', { token: c.token, body: h.addressBody(o) });
      expect(res.status).toBe(400);
    }
    const ok = await h.post('/api/addresses', { token: c.token, body: h.addressBody({ addressLine: 'x'.repeat(150), name: 'n'.repeat(50) }) });
    expect(ok.status).toBe(201);
    const xss = await h.post('/api/addresses', { token: c.token, body: h.addressBody({ name: 'Bob', addressLine: '<script>alert(1)</script> street' }) });
    expect([201, 400]).toContain(xss.status);
    const wrongType = await h.post('/api/addresses', { token: c.token, body: h.addressBody({ city: { $gt: '' } }) });
    expect(wrongType.status).toBe(400);
  });
});
