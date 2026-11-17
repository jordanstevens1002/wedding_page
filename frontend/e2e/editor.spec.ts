import { expect, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });
const first = 'Fictional!Browser!Pass123';
const second = 'Another!Browser!Pass456';

test('editor signs in, navigates, changes password, signs out and returns', async ({ page }) => {
  await page.goto('/editor/');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await page.getByLabel('Password', { exact: true }).fill('not-the-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Unable to sign in');
  await expect(page.getByLabel('Password', { exact: true })).toBeEmpty();
  await page.getByLabel('Password', { exact: true }).fill(first);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Website', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Invitations & RSVPs', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Invitations & RSVPs', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Account', exact: true }).click();
  await page.getByLabel('Current password').fill(first);
  await page.getByLabel('New password', { exact: true }).fill(second);
  await page.getByLabel('Confirm new password').fill(second);
  await page.getByRole('button', { name: 'Change password', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Password changed');
  await expect(page.getByLabel('Current password')).toBeEmpty();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('navigation')).toHaveCount(0);
  await page.getByLabel('Password', { exact: true }).fill(second);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Account', exact: true })).toBeVisible();
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
  expect(page.url()).not.toContain('password=');
});

test('a revoked session returns to sign-in on navigation, including at mobile width', async ({ page, playwright }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/editor/');
  await page.getByLabel('Password', { exact: true }).fill(second);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Website', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  // A second authenticated client changes the password, revoking the first browser.
  const other = await playwright.request.newContext({ baseURL: process.env.BASE_URL });
  try {
    const csrf = await (await other.get('/api/editor/csrf/')).json();
    const login = await other.post('/api/editor/login/', {
      data: { username: 'editor', password: second }, headers: { 'X-CSRFToken': csrf.csrf_token },
    });
    expect(login.ok()).toBe(true);
    const session = await login.json();
    const changed = await other.post('/api/editor/password/', {
      data: { current_password: second, new_password: 'Third!Browser!Pass789' },
      headers: { 'X-CSRFToken': session.csrf_token },
    });
    expect(changed.ok()).toBe(true);
    await page.getByRole('link', { name: 'Account', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(page.getByRole('status')).toContainText('session has ended');
    await expect(page.getByRole('navigation')).toHaveCount(0);
  } finally { await other.dispose(); }
});
