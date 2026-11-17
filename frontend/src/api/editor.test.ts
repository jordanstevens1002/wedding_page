import { afterEach, expect, test, vi } from 'vitest';
import { editorApi } from './editor';

afterEach(() => vi.unstubAllGlobals());
const session = { username: 'editor', csrf_token: 'fictional-rotated-token' };

test('mutations obtain CSRF first and use same-origin cookies without URL credentials', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ csrf_token: 'fictional-token' }))
    .mockResolvedValueOnce(Response.json(session));
  vi.stubGlobal('fetch', fetch);
  await expect(editorApi.login({ username: 'editor', password: 'fictional-password' })).resolves.toEqual(session);
  expect(fetch.mock.calls[0][0]).toBe('/api/editor/csrf/');
  expect(fetch.mock.calls[1][0]).toBe('/api/editor/login/');
  expect(fetch.mock.calls[1][1]).toMatchObject({
    method: 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: { 'X-CSRFToken': 'fictional-token' },
    body: JSON.stringify({ username: 'editor', password: 'fictional-password' }),
  });
});

test('Django HTML CSRF failures become plain safe errors', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ csrf_token: 'fictional-token' }))
    .mockResolvedValueOnce(new Response('<h1>Forbidden</h1>', { status: 403 })));
  await expect(editorApi.logout()).rejects.toMatchObject({ status: 403, message: 'The security check failed. Please try again.' });
});

test('rate limits and server password validation are readable', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ csrf_token: 'fictional-token' }))
    .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'Retry-After': '90' } }))
    .mockResolvedValueOnce(Response.json({ csrf_token: 'fictional-token' }))
    .mockResolvedValueOnce(Response.json({ new_password: ['Choose a stronger password.'] }, { status: 400 }));
  vi.stubGlobal('fetch', fetch);
  await expect(editorApi.login({ username: 'editor', password: 'fictional' })).rejects.toThrow('Try again in 2 minutes');
  await expect(editorApi.password({ current_password: 'fictional', new_password: 'fictional' })).rejects.toThrow('Choose a stronger password');
});

test('successful logout accepts an empty 204 response', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ csrf_token: 'fictional-token' }))
    .mockResolvedValueOnce(new Response(null, { status: 204 })));
  await expect(editorApi.logout()).resolves.toBeNull();
});

test('network failures and malformed session responses remain retryable', async () => {
  const fetch = vi.fn().mockRejectedValueOnce(new TypeError('offline'))
    .mockResolvedValueOnce(Response.json({ csrf_token: 'fictional-token' }));
  vi.stubGlobal('fetch', fetch);
  await expect(editorApi.session()).rejects.toThrow('could not be reached');
  await expect(editorApi.session()).rejects.toThrow('could not be read');
});
