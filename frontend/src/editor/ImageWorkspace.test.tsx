import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { mediaApi, type Asset, type Draft } from '../api/media';
import { EditorApiError } from '../api/editor';
import { ImageWorkspace } from './ImageWorkspace';

vi.mock('../api/media', () => ({ mediaApi: {
  library: vi.fn(), asset: vi.fn(), upload: vi.fn(), delete: vi.fn(), draft: vi.fn(), save: vi.fn(),
} }));
const api = vi.mocked(mediaApi);
const asset: Asset = { id: 'fictional-image', width: 1600, height: 900, created_at: '2026-01-01T00:00:00Z',
  variants: [{ width: 640, height: 360, url: '/api/media/fictional/640/' }, { width: 1280, height: 720, url: '/api/media/fictional/1280/' }] };
const draft: Draft = { revision: 4, document: { schema_version: 1, title: 'Fictional wedding', couple_names: '', wedding_date: null,
  timezone: 'Australia/Sydney', sections: [{ id: 'welcome', heading: 'Welcome', body: 'Keep this text', visible: false, image: null,
    entries: [{ id: 'fictional-entry', title: 'Portrait', body: '', image: null }] },
  { id: 'story', heading: 'Our story', body: '', visible: true, entries: [], image: null }] } };
const failSession = vi.fn();
const onDirty = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  api.draft.mockResolvedValue(structuredClone(draft));
  api.library.mockResolvedValue({ count: 1, results: [asset], next: null });
  api.asset.mockResolvedValue(asset);
  api.upload.mockResolvedValue(asset);
  api.save.mockImplementation(async value => ({ ...value, revision: value.revision + 1 }));
  api.delete.mockResolvedValue(null);
});
async function start() {
  render(<ImageWorkspace failSession={failSession} onDirty={onDirty} />);
  await screen.findByRole('button', { name: 'Use image 1' });
}
function fill(label: string, value: string) { fireEvent.change(screen.getByLabelText(label), { target: { value } }); }
async function select() { fireEvent.click(screen.getByRole('button', { name: 'Use image 1' })); await screen.findByLabelText('Alt text'); }

test('selection, metadata and responsive crop save only the chosen location and preserve the document', async () => {
  await start(); await select();
  fill('Alt text', 'Fictional couple beside a tree'); fill('Caption', 'A fictional caption');
  fill('Horizontal focal point: 50%', '25'); fill('Vertical focal point: 50%', '70');
  const preview = await screen.findByAltText('Fictional couple beside a tree');
  expect(preview).toHaveAttribute('srcset', '/api/media/fictional/640/ 640w, /api/media/fictional/1280/ 1280w');
  expect(preview).toHaveStyle({ objectPosition: '25% 70%' });
  fireEvent.submit(screen.getByRole('form', { name: 'Image details' }));
  await waitFor(() => expect(api.save).toHaveBeenCalled());
  const sent = api.save.mock.calls[0][0];
  expect(sent.revision).toBe(4);
  expect(sent.document.sections[0]).toMatchObject({ body: 'Keep this text', visible: false,
    image: { asset_id: asset.id, alt_text: 'Fictional couple beside a tree', caption: 'A fictional caption', focal_x: .25, focal_y: .7 } });
  expect(sent.document.sections[1]).toEqual(draft.document.sections[1]);
  await screen.findByText(/Image changes saved to the draft/);
  expect(screen.getByRole('button', { name: 'Save image changes' })).toBeDisabled();
});

test('existing entry targets and decorative images can be saved and removed independently', async () => {
  await start(); fill('Image location', '0:0'); await select();
  fill('Alt text', '   '); fireEvent.submit(screen.getByRole('form', { name: 'Image details' }));
  expect(api.save).not.toHaveBeenCalled();
  expect(screen.getByText('Add alt text or mark this image as decorative.')).toBeVisible();
  fireEvent.click(screen.getByLabelText('Decorative image'));
  expect(screen.getByLabelText('Alt text')).not.toBeRequired();
  fireEvent.submit(screen.getByRole('form', { name: 'Image details' }));
  await screen.findByText(/Image changes saved to the draft/);
  expect(api.save.mock.calls[0][0].document.sections[0].entries[0].image?.decorative).toBe(true);
  expect(api.save.mock.calls[0][0].document.sections[0].image).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Remove image from location' }));
  fireEvent.submit(screen.getByRole('form', { name: 'Image details' }));
  await waitFor(() => expect(api.save).toHaveBeenCalledTimes(2));
  expect(api.save.mock.calls[1][0].revision).toBe(5);
  expect(api.save.mock.calls[1][0].document.sections[0].entries[0].image).toBeNull();
});

test('save failure retains settings for retry and conflicts require an explicit reload', async () => {
  await start(); await select(); fill('Alt text', 'Retain this description');
  api.save.mockRejectedValueOnce(new EditorApiError(0, 'Connection lost'));
  fireEvent.submit(screen.getByRole('form', { name: 'Image details' }));
  await screen.findByText('Connection lost');
  expect(screen.getByLabelText('Alt text')).toHaveValue('Retain this description');
  api.save.mockRejectedValueOnce(new EditorApiError(409, 'This draft changed.'));
  fireEvent.submit(screen.getByRole('form', { name: 'Image details' }));
  await screen.findByText('This draft changed.');
  expect(screen.getByRole('button', { name: 'Save image changes' })).toBeDisabled();
  vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
  fireEvent.click(screen.getByRole('button', { name: 'Load latest draft' }));
  expect(api.draft).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Load latest draft' }));
  await waitFor(() => expect(api.draft).toHaveBeenCalledTimes(2));
  await screen.findByText(/No image selected/);
  vi.restoreAllMocks();
});

test('failed library and upload operations offer retry without losing the file', async () => {
  api.library.mockRejectedValueOnce(new EditorApiError(0, 'Offline library'));
  await startWithoutLibrary();
  await screen.findByText('Offline library');
  fireEvent.click(screen.getByRole('button', { name: 'Retry library' }));
  await screen.findByRole('button', { name: 'Use image 1' });
  const file = new File(['fictional bytes'], 'fictional.png', { type: 'image/png' });
  fireEvent.change(screen.getByLabelText('Choose a photo'), { target: { files: [file] } });
  api.upload.mockRejectedValueOnce(new EditorApiError(400, 'Invalid image'));
  fireEvent.submit(screen.getByRole('form', { name: 'Upload image' }));
  await screen.findByText('Invalid image');
  fireEvent.submit(screen.getByRole('form', { name: 'Upload image' }));
  await screen.findByLabelText('Alt text');
  expect(api.upload).toHaveBeenNthCalledWith(2, file);
});
async function startWithoutLibrary() { render(<ImageWorkspace failSession={failSession} onDirty={onDirty} />); }

test('referenced deletion errors are explained; unused deletion requires confirmation', async () => {
  await start();
  fireEvent.click(screen.getByRole('button', { name: 'Delete image 1' }));
  expect(api.delete).not.toHaveBeenCalled();
  api.delete.mockRejectedValueOnce(new EditorApiError(409, 'This image is referenced by saved website content.'));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm deletion' }));
  await screen.findByText('This image is referenced by saved website content.');
  expect(screen.getByText(/Images used in any saved version cannot be deleted/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm deletion' }));
  await screen.findByText('Image deleted.');
});

test('pagination, failed preview retry and expired access remain actionable', async () => {
  api.library.mockResolvedValueOnce({ count: 25, results: [asset], next: '/api/editor/media/?page=2' })
    .mockRejectedValueOnce(new EditorApiError(0, 'Page unavailable'));
  await start();
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
  await waitFor(() => expect(api.library).toHaveBeenLastCalledWith(2));
  await screen.findByText('Page unavailable');
  expect(screen.queryByRole('button', { name: 'Use image 1' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry library' }));
  await screen.findByText('1 images · Page 2');
  api.asset.mockRejectedValueOnce(new EditorApiError(0, 'Offline'));
  await select();
  await screen.findByRole('button', { name: 'Retry preview' });
  fireEvent.click(screen.getByRole('button', { name: 'Retry preview' }));
  await screen.findByAltText('Selected image preview');
  api.save.mockRejectedValueOnce(new EditorApiError(403, 'Expired'));
  fill('Alt text', 'Fictional description');
  fireEvent.submit(screen.getByRole('form', { name: 'Image details' }));
  await waitFor(() => expect(failSession).toHaveBeenCalled());
});

test('switching locations warns before discarding unsaved metadata', async () => {
  await start(); await select(); fill('Alt text', 'Unsaved description');
  const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
  fill('Image location', '1');
  expect(screen.getByLabelText('Alt text')).toHaveValue('Unsaved description');
  fill('Image location', '1');
  expect(screen.queryByLabelText('Alt text')).not.toBeInTheDocument();
  expect(confirm).toHaveBeenCalledTimes(2); vi.restoreAllMocks();
});

test('a completed upload after unmount cannot select or restore private content', async () => {
  let resolve!: (value: Asset) => void;
  api.upload.mockReturnValueOnce(new Promise(done => { resolve = done; }));
  const rendered = render(<ImageWorkspace failSession={failSession} onDirty={onDirty} />);
  await screen.findByRole('button', { name: 'Use image 1' });
  fireEvent.change(screen.getByLabelText('Choose a photo'), { target: { files: [new File(['x'], 'fictional.png')] } });
  fireEvent.submit(screen.getByRole('form', { name: 'Upload image' }));
  rendered.unmount();
  await act(async () => resolve(asset));
  expect(screen.queryByLabelText('Alt text')).not.toBeInTheDocument();
  expect(onDirty).toHaveBeenLastCalledWith(false);
});

test('failed image bytes offer a retry and oversized files never leave the browser', async () => {
  await start(); await select();
  const preview = await screen.findByAltText('Selected image preview');
  fireEvent.error(preview);
  fireEvent.click(screen.getByRole('button', { name: 'Retry image preview' }));
  expect(screen.getByAltText('Selected image preview')).toBeVisible();
  const file = new File(['fictional'], 'large.png');
  Object.defineProperty(file, 'size', { value: 16 * 1024 * 1024 + 1 });
  fireEvent.change(screen.getByLabelText('Choose a photo'), { target: { files: [file] } });
  fireEvent.submit(screen.getByRole('form', { name: 'Upload image' }));
  await screen.findByText('Choose an image up to 16 MiB.');
  expect(api.upload).not.toHaveBeenCalled();
});
