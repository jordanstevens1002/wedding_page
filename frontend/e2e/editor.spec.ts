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

test('editor uploads, crops, saves and protects images using the keyboard at mobile width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/editor/');
  await page.getByLabel('Password', { exact: true }).fill('Third!Browser!Pass789');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Website images' })).toBeVisible();
  await page.getByLabel('Choose a photo').setInputFiles({ name: 'fictional.png', mimeType: 'image/png', buffer: Buffer.from('invalid image') });
  await page.getByRole('button', { name: 'Upload image', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('valid, still JPEG');
  const photo = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 800;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#365e4a'; context.fillRect(0, 0, 800, 800);
    context.fillStyle = '#d6a35a'; context.fillRect(800, 0, 800, 800);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.getByLabel('Choose a photo').setInputFiles({ name: 'fictional.png', mimeType: 'image/png', buffer: Buffer.from(photo, 'base64') });
  await page.getByRole('button', { name: 'Upload image', exact: true }).click();
  await expect(page.getByText('Image uploaded and selected.', { exact: false })).toBeVisible();
  const choose = page.getByRole('button', { name: 'Use image 1', exact: true });
  await choose.focus(); await page.keyboard.press('Enter');
  await page.getByLabel('Alt text', { exact: true }).fill('Fictional green and gold panels');
  await page.getByLabel('Caption', { exact: true }).fill('Fictional browser test');
  const slider = page.getByLabel('Horizontal focal point:', { exact: false });
  await slider.focus(); await page.keyboard.press('Home'); await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveValue('1');
  const preview = page.getByAltText('Fictional green and gold panels');
  await expect(preview).toHaveCSS('object-position', '1% 50%');
  await expect.poll(() => preview.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(preview).toHaveAttribute('srcset', /640w.*1280w/);
  const url = await preview.getAttribute('src');
  await page.getByRole('button', { name: 'Save image changes', exact: true }).click();
  await expect(page.getByText(/Image changes saved to the draft/)).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Alt text', { exact: true })).toHaveValue('Fictional green and gold panels');
  await expect(page.getByLabel('Caption', { exact: true })).toHaveValue('Fictional browser test');
  await page.getByRole('button', { name: 'Delete image 1', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm deletion', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('referenced by saved website content');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const anonymous = await page.context().browser()!.newContext();
  try { expect((await anonymous.request.get(new URL(url!, page.url()).href)).status()).toBe(404); }
  finally { await anonymous.close(); }
});
