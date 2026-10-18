const h = require('./helpers');
const { test, expect } = h;

const WEAK = 'Password must be at least 8 characters and contain a letter and a number';
const LIMIT_MSG = 'Too many failed login attempts. Please try again later.';

async function fillSignup(page, { name, email, password }) {
  await page.goto('/signup');
  await page.getByTestId('signup-name').fill(name);
  await page.getByTestId('signup-email').fill(email);
  await page.getByTestId('signup-password').fill(password);
  await page.getByTestId('signup-submit').click();
}

test.describe('FR-001 sign up (UI)', () => {
  test('TC-200 a guest signs up and sees "Check your email" with their address; they are NOT logged in until they verify (changed by ONC-001)', async ({ page }) => {
    const email = h.uniqueEmail('asha');
    await fillSignup(page, { name: 'Asha Rao', email, password: 'Shop1234' });
    await expect(page.getByTestId('signup-verify-title')).toHaveText('Check your email');
    await expect(page.getByTestId('signup-verify-email')).toHaveText(email);
    await expect(page.getByTestId('header-user-name')).toHaveCount(0);
    await expect(page.getByTestId('header-login')).toBeVisible();
  });

  test('TC-201 weak passwords show "Password must be at least 8 characters and contain a letter and a number" and no account is created', async ({ page }) => {
    for (const pw of ['abcdefgh', '12345678', 'ab1']) {
      const email = h.uniqueEmail('weak');
      await fillSignup(page, { name: 'Weak Pass', email, password: pw });
      await expect(page.getByTestId('signup-form')).toContainText(WEAK);
      await expect(page).toHaveURL(/\/signup/);
      const login = await h.api('POST', '/auth/login', { body: { email, password: pw } });
      expect(login.status).toBe(401);
    }
  });

  test('TC-202 signing up with an existing email (different case) shows "An account with this email already exists"', async ({ page }) => {
    const c = await h.signup({ email: h.uniqueEmail('dupe') });
    await fillSignup(page, { name: 'Second Try', email: c.email.toUpperCase(), password: 'Shop1234' });
    await expect(page.getByTestId('signup-form')).toContainText('An account with this email already exists');
    await expect(page).toHaveURL(/\/signup/);
  });

  test('TC-203 empty name and invalid email block submission with a message beside each invalid field', async ({ page }) => {
    await page.goto('/signup');
    await page.getByTestId('signup-email').fill('not-an-email');
    await page.getByTestId('signup-password').fill('Shop1234');
    await page.getByTestId('signup-submit').click();
    await expect(page.getByTestId('signup-name-error')).toBeVisible();
    await expect(page.getByTestId('signup-name-error')).toContainText(/name/i);
    await expect(page.getByTestId('signup-email-error')).toBeVisible();
    await expect(page.getByTestId('signup-email-error')).toContainText(/valid email/i);
    await expect(page).toHaveURL(/\/signup/);
  });
});

test.describe('FR-002 login and logout (UI)', () => {
  test('TC-204 a customer logs in: lands on home, header shows the name and a "Log out" control', async ({ page }) => {
    await h.uiLogin(page, 'asha@example.com', 'Shop1234');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId('header-user-name')).toContainText('Asha');
    await expect(page.getByTestId('header-logout')).toContainText(/log out/i);
  });

  test('TC-205 the admin logs in and lands on the admin dashboard', async ({ page }) => {
    await h.uiLogin(page, 'admin@shopease.com', 'Admin@123');
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByTestId('dashboard-title')).toBeVisible();
  });

  test('TC-206 wrong password and unregistered email show the identical message "Invalid email or password"', async ({ page }) => {
    await h.uiLogin(page, 'asha@example.com', 'WrongPass99');
    await expect(page.getByTestId('login-error')).toContainText('Invalid email or password');
    const first = (await page.getByTestId('login-error').innerText()).trim();
    await h.uiLogin(page, h.uniqueEmail('nobody'), 'WrongPass99');
    await expect(page.getByTestId('login-error')).toContainText('Invalid email or password');
    const second = (await page.getByTestId('login-error').innerText()).trim();
    expect(second).toBe(first);
    await expect(page.getByTestId('header-login')).toBeVisible();
  });

  test('TC-207 submitting empty login fields shows "Email is required" and "Password is required"', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('login-email-error')).toContainText('Email is required');
    await expect(page.getByTestId('login-password-error')).toContainText('Password is required');
    await expect(page).toHaveURL(/\/login/);
  });

  test('TC-208 logging out removes the token, shows "Log in" and sends a customer-only page to the login screen', async ({ page }) => {
    const c = await h.signup();
    await h.setSession(page, c.token, '/');
    await expect(page.getByTestId('header-user-name')).toBeVisible();
    await page.getByTestId('header-logout').click();
    await expect(page.getByTestId('header-login')).toBeVisible();
    expect(await page.evaluate((k) => localStorage.getItem(k), h.TOKEN_KEY)).toBeNull();
    await page.goto('/profile');
    await expect(page).toHaveURL(/\/login/);
  });

  test('TC-209 a tampered token redirects to login with "Your session has expired. Please log in again"', async ({ page }) => {
    await page.goto('/login');
    await page.evaluate((k) => localStorage.setItem(k, 'abc.def.ghi'), h.TOKEN_KEY);
    await page.goto('/profile');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByTestId('login-notice')).toContainText('Your session has expired. Please log in again');
    expect(await page.evaluate((k) => localStorage.getItem(k), h.TOKEN_KEY)).toBeNull();
  });
});

test.describe('FR-006 route protection (UI)', () => {
  test('TC-212 a guest opening /profile or /orders is sent to login and returned to the requested page after logging in', async ({ page }) => {
    const c = await h.signup();
    await page.goto('/profile');
    await expect(page).toHaveURL(/\/login/);
    await page.getByTestId('login-email').fill(c.email);
    await page.getByTestId('login-password').fill(c.password);
    await page.getByTestId('login-submit').click();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByTestId('profile-title')).toBeVisible();
    await page.getByTestId('header-logout').click();
    await page.goto('/orders');
    await expect(page).toHaveURL(/\/login/);
    await page.getByTestId('login-email').fill(c.email);
    await page.getByTestId('login-password').fill(c.password);
    await page.getByTestId('login-submit').click();
    await expect(page).toHaveURL(/\/orders$/);
  });

  test('TC-218 a customer opening any /admin URL sees the "Not authorised" page and no admin data', async ({ page }) => {
    const c = await h.signup();
    await h.setSession(page, c.token, '/admin');
    await expect(page.getByTestId('not-authorised')).toBeVisible();
    await expect(page.getByTestId('dashboard-total-orders')).toHaveCount(0);
    for (const p of ['/admin/products', '/admin/categories', '/admin/orders', '/admin/products/new']) {
      await page.goto(p);
      await expect(page.getByTestId('not-authorised')).toBeVisible();
    }
  });

  test('TC-219 a guest opening /admin is sent to login; the admin session loads /admin pages', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/login/);
    await h.setSession(page, await h.adminToken(), '/admin/orders');
    await expect(page.getByTestId('admin-orders-title')).toBeVisible();
  });

  test('TC-220 the admin cannot check out ("Admin accounts cannot place orders") and the sign-up form has no role/admin option', async ({ page }) => {
    await h.setSession(page, await h.adminToken(), '/checkout');
    await expect(page.getByTestId('admin-blocked')).toContainText('Admin accounts cannot place orders');
    await page.goto('/cart');
    await expect(page.getByTestId('admin-blocked')).toContainText('Admin accounts cannot place orders');
    await page.evaluate((k) => localStorage.removeItem(k), h.TOKEN_KEY);
    await page.goto('/signup');
    const form = page.getByTestId('signup-form');
    await expect(form.locator('input:not([type=hidden]), select, textarea')).toHaveCount(3);
    await expect(form.locator('select, [name=role], [name=isAdmin], input[type=checkbox], input[type=radio]')).toHaveCount(0);
  });
});

test.describe('FR-033 login rate limit (UI)', () => {
  test('TC-280 after 5 failed attempts for an email the login form shows the "Too many failed login attempts" message; other emails still work', async ({ page }) => {
    const c = await h.signup();
    const other = await h.signup();
    for (let i = 0; i < 5; i++) {
      const r = await h.api('POST', '/auth/login', { body: { email: c.email, password: 'WrongPass99' } }); // each call uses a new IP
      expect(r.status).toBe(401);
    }
    await h.uiLogin(page, c.email, c.password);
    await expect(page.getByTestId('login-error')).toContainText(LIMIT_MSG);
    await expect(page.getByTestId('header-login')).toBeVisible();
    expect(await page.evaluate((k) => localStorage.getItem(k), h.TOKEN_KEY)).toBeNull();
    await h.uiLogin(page, other.email, other.password);
    await expect(page.getByTestId('header-user-name')).toBeVisible();
  });
});
