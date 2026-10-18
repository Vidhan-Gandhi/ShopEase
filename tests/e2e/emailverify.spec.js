// ONC-001 email verification: UI tests (TC-342 ...). Elements are selected ONLY by data-testid.
const h = require('./helpers');
const { test, expect } = h;

const INVALID = 'This verification link is invalid or has expired';
const UNVERIFIED = 'Please verify your email first';

async function uiSignup(page, { name = 'Verify Me', email, password = 'Shop1234' }) {
  await page.goto('/signup');
  await page.getByTestId('signup-name').fill(name);
  await page.getByTestId('signup-email').fill(email);
  await page.getByTestId('signup-password').fill(password);
  await page.getByTestId('signup-submit').click();
}
const tokenKeyValue = (page) => page.evaluate((k) => localStorage.getItem(k), h.TOKEN_KEY);

test.describe('ONC-001 sign-up and verification (UI)', () => {
  test('TC-342 after a successful sign-up the page shows "Check your email", the address and a "Resend verification email" button, and the user is not logged in', async ({ page }) => {
    const email = h.uniqueEmail('chk');
    await uiSignup(page, { email });
    await expect(page.getByTestId('signup-verify-title')).toHaveText('Check your email');
    await expect(page.getByTestId('signup-verify-email')).toHaveText(email);
    await expect(page.getByTestId('signup-resend')).toBeVisible();
    await expect(page.getByTestId('signup-resend')).toHaveText('Resend verification email');
    expect(await tokenKeyValue(page)).toBeNull();
    await expect(page.getByTestId('header-login')).toBeVisible();
    expect(await h.latestToken(email)).toMatch(/^[0-9a-f]{64}$/);
  });

  test('TC-343 signing up with a disposable email domain shows "Disposable email addresses are not allowed. Please use a permanent email" and stays on the form', async ({ page }) => {
    await uiSignup(page, { email: `temp.${h.uid()}@mailinator.com` });
    await expect(page.getByTestId('signup-form')).toContainText('Disposable email addresses are not allowed. Please use a permanent email');
    await expect(page.getByTestId('signup-verify-title')).toHaveCount(0);
    await expect(page).toHaveURL(/\/signup/);
  });

  test('TC-344 full flow: sign up, open the emailed link, see "Email verified", click "Log in", log in and see the name in the header', async ({ page }) => {
    const email = h.uniqueEmail('flow');
    await uiSignup(page, { name: 'Flow Tester', email });
    await expect(page.getByTestId('signup-verify-title')).toBeVisible();
    const token = await h.latestToken(email);
    await page.goto('/verify-email?token=' + token);
    await expect(page.getByTestId('verify-success-title')).toHaveText('Email verified');
    await page.getByTestId('verify-login-button').click();
    await expect(page).toHaveURL(/\/login/);
    await page.getByTestId('login-email').fill(email);
    await page.getByTestId('login-password').fill('Shop1234');
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('header-user-name')).toContainText('Flow Tester');
  });

  test('TC-345 an invalid token on the verify page shows the error message and a "Go to log in" link to /login', async ({ page }) => {
    await page.goto('/verify-email?token=' + 'a'.repeat(64));
    await expect(page.getByTestId('verify-error-message')).toHaveText(INVALID);
    await expect(page.getByTestId('verify-success')).toHaveCount(0);
    await page.getByTestId('verify-error-login-link').click();
    await expect(page).toHaveURL(/\/login/);
  });

  test('TC-346 opening /verify-email without a token shows the error message and the "Go to log in" link', async ({ page }) => {
    await page.goto('/verify-email');
    await expect(page.getByTestId('verify-error-message')).toHaveText(INVALID);
    await expect(page.getByTestId('verify-error-login-link')).toHaveText('Go to log in');
  });

  test('TC-347 the verify page calls verify-email exactly once, and opening the same link again shows the error', async ({ page }) => {
    const c = await h.signupUnverified();
    const token = await h.latestToken(c.email);
    let calls = 0;
    page.on('request', (r) => {
      if (r.url().includes('/api/auth/verify-email') && r.method() === 'POST') calls += 1;
    });
    await page.goto('/verify-email?token=' + token);
    await expect(page.getByTestId('verify-success')).toBeVisible();
    await page.waitForTimeout(500);
    expect(calls).toBe(1);
    await page.goto('/verify-email?token=' + token);
    await expect(page.getByTestId('verify-error-message')).toHaveText(INVALID);
  });

  test('TC-348 logging in as an unverified customer shows "Please verify your email first" and a "Resend verification email" button, and no session', async ({ page }) => {
    const c = await h.signupUnverified();
    await h.uiLogin(page, c.email, c.password);
    await expect(page.getByTestId('login-error')).toContainText(UNVERIFIED);
    await expect(page.getByTestId('login-resend')).toBeVisible();
    await expect(page.getByTestId('login-resend')).toHaveText('Resend verification email');
    await expect(page.getByTestId('header-user-name')).toHaveCount(0);
    expect(await tokenKeyValue(page)).toBeNull();
  });

  test('TC-349 clicking "Resend verification email" on the login page shows a success message and a new email with a new token is sent', async ({ page }) => {
    const c = await h.signupUnverified();
    const first = await h.latestToken(c.email);
    await h.uiLogin(page, c.email, c.password);
    await page.getByTestId('login-resend').click();
    await expect(page.getByTestId('login-resend-success')).toBeVisible();
    const second = await h.latestToken(c.email);
    expect(second).not.toBe(first);
  });

  test('TC-350 a wrong password for an unverified account shows "Invalid email or password" and no resend button', async ({ page }) => {
    const c = await h.signupUnverified();
    await h.uiLogin(page, c.email, 'Wrong1234');
    await expect(page.getByTestId('login-error')).toContainText('Invalid email or password');
    await expect(page.getByTestId('login-resend')).toHaveCount(0);
  });

  test('TC-351 after 3 resends the 4th click on the sign-up page shows the limit message with the wait time', async ({ page }) => {
    const email = h.uniqueEmail('lim');
    await uiSignup(page, { email });
    for (let i = 0; i < 3; i += 1) {
      await page.getByTestId('signup-resend').click();
      await expect(page.getByTestId('signup-resend-success')).toBeVisible();
      await expect(page.getByTestId('signup-resend')).toBeEnabled();
    }
    await page.getByTestId('signup-resend').click();
    await expect(page.getByTestId('signup-resend-error')).toContainText('Too many verification emails requested');
    await expect(page.getByTestId('signup-resend-error')).toContainText('Try again in');
  });

  test('TC-352 clicking "Resend verification email" on the sign-up page shows a success message and the old link stops working', async ({ page }) => {
    const email = h.uniqueEmail('rs');
    await uiSignup(page, { email });
    await expect(page.getByTestId('signup-verify-title')).toBeVisible();
    const first = await h.latestToken(email);
    await page.getByTestId('signup-resend').click();
    await expect(page.getByTestId('signup-resend-success')).toBeVisible();
    await page.goto('/verify-email?token=' + first);
    await expect(page.getByTestId('verify-error-message')).toHaveText(INVALID);
  });

  test('TC-353 seeded customer asha still logs in through the UI without verification', async ({ page }) => {
    await h.uiLogin(page, 'asha@example.com', 'Shop1234');
    await expect(page.getByTestId('header-user-name')).toContainText('Asha');
    await expect(page.getByTestId('login-resend')).toHaveCount(0);
  });

  test('TC-354 after verifying, the previously blocked login succeeds from the login page', async ({ page }) => {
    const c = await h.signupUnverified();
    await h.uiLogin(page, c.email, c.password);
    await expect(page.getByTestId('login-error')).toContainText(UNVERIFIED);
    await h.verifyAccount(c.email);
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('header-user-name')).toBeVisible();
  });
});
