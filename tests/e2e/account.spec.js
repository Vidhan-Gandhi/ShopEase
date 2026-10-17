const h = require('./helpers');
const { test, expect } = h;

const WEAK = 'Password must be at least 8 characters and contain a letter and a number';

async function fillAddress(page, prefix, a = {}) {
  const v = { name: 'Asha Rao', phone: '9876543210', line: '12 MG Road', city: 'Pune', state: 'Maharashtra', pincode: '411001', ...a };
  await page.getByTestId(`${prefix}-name`).fill(v.name);
  await page.getByTestId(`${prefix}-phone`).fill(v.phone);
  await page.getByTestId(`${prefix}-address-line`).fill(v.line);
  await page.getByTestId(`${prefix}-city`).fill(v.city);
  await page.getByTestId(`${prefix}-state`).fill(v.state);
  await page.getByTestId(`${prefix}-pincode`).fill(v.pincode);
}

test.describe('FR-003 profile (UI)', () => {
  test('TC-210 profile shows name, read-only email and phone; edits are saved and survive a reload', async ({ page }) => {
    const c = await h.signup({ name: 'Asha Rao' });
    await h.setSession(page, c.token, '/profile');
    await expect(page.getByTestId('profile-name')).toHaveValue('Asha Rao');
    await expect(page.getByTestId('profile-email')).toHaveValue(c.email);
    const ro = await page.getByTestId('profile-email').evaluate((el) => el.readOnly || el.disabled);
    expect(ro).toBe(true);
    await page.getByTestId('profile-name').fill('Asha R');
    await page.getByTestId('profile-phone').fill('9876543210');
    await page.getByTestId('profile-submit').click();
    await expect(page.getByTestId('profile-success')).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('profile-name')).toHaveValue('Asha R');
    await expect(page.getByTestId('profile-phone')).toHaveValue('9876543210');
  });

  test('TC-211 phone "12345" and an empty name are blocked with exact messages and stored data stays unchanged', async ({ page }) => {
    const c = await h.signup({ name: 'Keep Name' });
    await h.setSession(page, c.token, '/profile');
    await page.getByTestId('profile-phone').fill('12345');
    await page.getByTestId('profile-submit').click();
    await expect(page.getByTestId('profile-phone-error')).toContainText('Enter a valid 10-digit mobile number');
    await page.getByTestId('profile-phone').fill('');
    await page.getByTestId('profile-name').fill('');
    await page.getByTestId('profile-submit').click();
    await expect(page.getByTestId('profile-name-error')).toContainText('Name is required');
    await page.reload();
    await expect(page.getByTestId('profile-name')).toHaveValue('Keep Name');
  });
});

test.describe('FR-004 addresses (UI)', () => {
  test('TC-213 first address is marked Default; marking a second one as default leaves exactly one Default', async ({ page }) => {
    const c = await h.signup();
    await h.setSession(page, c.token, '/profile/addresses');
    await expect(page.getByTestId('addresses-empty')).toBeVisible();
    await page.getByTestId('addresses-add').click();
    await fillAddress(page, 'addresses-form', { name: 'First Home' });
    await page.getByTestId('addresses-form-submit').click();
    await expect(page.getByTestId('addresses-item')).toHaveCount(1);
    await expect(page.getByTestId('addresses-item-default')).toHaveCount(1);
    await page.getByTestId('addresses-add').click();
    await fillAddress(page, 'addresses-form', { name: 'Second Office', city: 'Mumbai' });
    await page.getByTestId('addresses-form-submit').click();
    await expect(page.getByTestId('addresses-item')).toHaveCount(2);
    await expect(page.getByTestId('addresses-item-default')).toHaveCount(1);
    const second = page.getByTestId('addresses-item').filter({ hasText: 'Second Office' });
    await second.getByTestId('addresses-set-default').click();
    await expect(page.getByTestId('addresses-item-default')).toHaveCount(1);
    await expect(second.getByTestId('addresses-item-default')).toBeVisible();
    await expect(page.getByTestId('addresses-item').filter({ hasText: 'First Home' }).getByTestId('addresses-item-default')).toHaveCount(0);
  });

  test('TC-214 invalid pincode "0123", "12345a" and an empty city are not saved and show per-field messages', async ({ page }) => {
    const c = await h.signup();
    await h.setSession(page, c.token, '/profile/addresses');
    await page.getByTestId('addresses-add').click();
    await fillAddress(page, 'addresses-form', { pincode: '0123', city: '' });
    await page.getByTestId('addresses-form-submit').click();
    await expect(page.getByTestId('addresses-form-pincode-error')).toContainText('Enter a valid 6-digit pincode');
    await expect(page.getByTestId('addresses-form-city-error')).toBeVisible();
    await page.getByTestId('addresses-form-pincode').fill('12345a');
    await page.getByTestId('addresses-form-submit').click();
    await expect(page.getByTestId('addresses-form-pincode-error')).toContainText('Enter a valid 6-digit pincode');
    await expect(page.getByTestId('addresses-item')).toHaveCount(0);
    expect((await h.api('GET', '/addresses', { token: c.token })).body.items).toHaveLength(0);
  });

  test('TC-215 deleting an address asks for confirmation: Cancel and Esc keep it, the confirm button deletes it', async ({ page }) => {
    const c = await h.customerWithAddress({ addressName: 'Doomed Address' });
    await h.setSession(page, c.token, '/profile/addresses');
    await expect(page.getByTestId('addresses-item')).toHaveCount(1);
    await page.getByTestId('addresses-delete').click();
    await expect(page.getByTestId('confirm-dialog')).toBeVisible();
    await page.getByTestId('confirm-dialog-cancel').click();
    await expect(page.getByTestId('confirm-dialog')).toHaveCount(0);
    await expect(page.getByTestId('addresses-item')).toHaveCount(1);
    await page.getByTestId('addresses-delete').click();
    await expect(page.getByTestId('confirm-dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('confirm-dialog')).toHaveCount(0);
    await expect(page.getByTestId('addresses-item')).toHaveCount(1);
    expect((await h.api('GET', '/addresses', { token: c.token })).body.items).toHaveLength(1);
    await page.getByTestId('addresses-delete').click();
    await page.getByTestId('confirm-dialog-confirm').click();
    await expect(page.getByTestId('addresses-item')).toHaveCount(0);
    expect((await h.api('GET', '/addresses', { token: c.token })).body.items).toHaveLength(0);
  });
});

test.describe('FR-005 change password (UI)', () => {
  test('TC-216 correct current + valid new password shows success; new password logs in, the old one does not', async ({ page }) => {
    const c = await h.signup();
    await h.setSession(page, c.token, '/profile/password');
    await page.getByTestId('password-current').fill(c.password);
    await page.getByTestId('password-new').fill('Newpass99');
    await page.getByTestId('password-confirm').fill('Newpass99');
    await page.getByTestId('password-submit').click();
    await expect(page.getByTestId('password-success')).toBeVisible();
    expect((await h.api('POST', '/auth/login', { body: { email: c.email, password: 'Newpass99' } })).status).toBe(200);
    expect((await h.api('POST', '/auth/login', { body: { email: c.email, password: c.password } })).status).toBe(401);
  });

  test('TC-217 wrong current password, weak/same new password and a non-matching confirmation show the exact messages', async ({ page }) => {
    const c = await h.signup();
    await h.setSession(page, c.token, '/profile/password');
    const fill = async (cur, nw, conf) => {
      await page.getByTestId('password-current').fill(cur);
      await page.getByTestId('password-new').fill(nw);
      await page.getByTestId('password-confirm').fill(conf);
      await page.getByTestId('password-submit').click();
    };
    await fill('WrongPass99', 'Newpass99', 'Newpass99');
    await expect(page.getByTestId('password-form')).toContainText('Current password is incorrect');
    await fill(c.password, 'Newpass99', 'Different99');
    await expect(page.getByTestId('password-confirm-error')).toContainText('Passwords do not match');
    await fill(c.password, 'short1', 'short1');
    await expect(page.getByTestId('password-form')).toContainText(WEAK);
    await fill(c.password, c.password, c.password);
    await expect(page.getByTestId('password-form')).toContainText('New password must be different');
    expect((await h.api('POST', '/auth/login', { body: { email: c.email, password: c.password } })).status).toBe(200);
  });
});

test.describe('FR-031 confirmation dialog (UI)', () => {
  test('TC-299 clicking outside the confirmation dialog (backdrop) closes it without deleting anything', async ({ page }) => {
    const c = await h.customerWithAddress({ addressName: 'Backdrop Address' });
    await h.setSession(page, c.token, '/profile/addresses');
    await page.getByTestId('addresses-delete').click();
    await expect(page.getByTestId('confirm-dialog')).toBeVisible();
    await expect(page.getByTestId('confirm-dialog-title')).not.toBeEmpty();
    await expect(page.getByTestId('confirm-dialog-confirm')).toBeVisible();
    await expect(page.getByTestId('confirm-dialog-cancel')).toBeVisible();
    await page.getByTestId('confirm-dialog-backdrop').click({ position: { x: 5, y: 5 } });
    await expect(page.getByTestId('confirm-dialog')).toHaveCount(0);
    await expect(page.getByTestId('addresses-item')).toHaveCount(1);
    expect((await h.api('GET', '/addresses', { token: c.token })).body.items).toHaveLength(1);
  });
});
