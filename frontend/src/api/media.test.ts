import { afterEach, expect, test, vi } from 'vitest';
import { mediaApi } from './media';

afterEach(() => vi.unstubAllGlobals());
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
test('uploads use same-origin cookies and a fresh CSRF token without a JSON multipart header', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(json({ csrf_token: 'fictional-token' })).mockResolvedValueOnce(json({ id: 'fictional-asset' }, 201));
  vi.stubGlobal('fetch', fetch);
  const file = new File(['fictional'], 'photo.png', { type: 'image/png' });
  await mediaApi.upload(file);
  expect(fetch.mock.calls[0][0]).toBe('/api/editor/csrf/');
  expect(fetch.mock.calls[1][0]).toBe('/api/editor/media/');
  const options = fetch.mock.calls[1][1];
  expect(options.credentials).toBe('same-origin');
  expect(options.cache).toBe('no-store');
  expect(options.headers).toEqual({ 'X-CSRFToken': 'fictional-token' });
  expect(options.body.get('file')).toEqual(file);
});
test('pagination constructs a local API path and deletion tolerates an empty 204', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(json({ results: [], count: 0 })).mockResolvedValueOnce(json({ csrf_token: 'fictional' }))
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', fetch);
  await mediaApi.library(2); await mediaApi.delete('fictional-id');
  expect(fetch.mock.calls[0][0]).toBe('/api/editor/media/?page=2');
  expect(fetch.mock.calls[2][1].method).toBe('DELETE');
});
test('field errors, proxy limits, network errors and stale drafts produce actionable failures', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(json({ file: ['Choose a valid image.'] }, 400))
    .mockResolvedValueOnce(new Response('too large', { status: 413 })).mockRejectedValueOnce(new TypeError('offline'))
    .mockResolvedValueOnce(json({ detail: 'This draft changed.' }, 409));
  vi.stubGlobal('fetch', fetch);
  await expect(mediaApi.library()).rejects.toMatchObject({ status: 400, message: 'Choose a valid image.' });
  await expect(mediaApi.library()).rejects.toMatchObject({ status: 413, message: 'Choose an image up to 16 MiB.' });
  await expect(mediaApi.library()).rejects.toMatchObject({ status: 0 });
  await expect(mediaApi.draft()).rejects.toMatchObject({ status: 409, message: 'This draft changed.' });
});
