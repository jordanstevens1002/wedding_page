import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { editorApi, EditorApiError } from '../api/editor';
import { Editor } from './Editor';

vi.mock('./ImageWorkspace', () => ({ ImageWorkspace: () => <div>Image workspace</div> }));
vi.mock('../api/editor', async importOriginal => ({
  ...await importOriginal<typeof import('../api/editor')>(),
  editorApi: { session: vi.fn(), login: vi.fn(), password: vi.fn(), logout: vi.fn() },
}));
const api = vi.mocked(editorApi);
const session = { username: 'editor', csrf_token: 'fictional-token' };
beforeEach(() => {
  vi.resetAllMocks();
  window.history.replaceState({}, '', '/editor/');
  api.session.mockResolvedValue(session);
  api.login.mockResolvedValue(session);
  api.password.mockResolvedValue(session);
  api.logout.mockResolvedValue(null);
});

async function navigate(section: string) {
  await act(async () => {
    window.history.replaceState({}, '', `/editor/#${section}`);
    window.dispatchEvent(new Event('hashchange'));
  });
}
function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } });
}

test('protected navigation waits for server confirmation and keeps public preview separate', async () => {
  let resolve!: (value: typeof session) => void;
  api.session.mockReturnValueOnce(new Promise(done => { resolve = done; }));
  render(<Editor />);
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Checking');
  await act(async () => { resolve(session); });
  expect(screen.getByRole('heading', { name: 'Website' })).toHaveFocus();
  expect(screen.getByRole('link', { name: /View public site/ })).toHaveAttribute('href', '/');
  await navigate('invitations');
  expect(screen.getByRole('heading', { name: 'Invitations & RSVPs' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'Invitations & RSVPs' })).toHaveAttribute('aria-current', 'page');
  await navigate('__proto__');
  expect(screen.getByRole('heading', { name: 'Website' })).toBeVisible();
});

test('sign-in clears its password immediately and presents a failed attempt without exposing the shell', async () => {
  api.session.mockRejectedValue(new EditorApiError(403, 'Forbidden'));
  api.login.mockRejectedValueOnce(new EditorApiError(400, 'Unable to sign in.'));
  render(<Editor />);
  await screen.findByRole('heading', { name: 'Welcome back' });
  fill('Password', 'fictional-password');
  fireEvent.submit(screen.getByRole('form', { name: 'Editor sign in' }));
  expect(screen.getByLabelText('Password', { exact: true })).toHaveValue('');
  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to sign in');
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  expect(api.login).toHaveBeenCalledWith({ username: 'editor', password: 'fictional-password' });
  api.session.mockResolvedValue(session);
  fill('Password', 'fictional-retry');
  fireEvent.submit(screen.getByRole('form', { name: 'Editor sign in' }));
  await screen.findByRole('navigation', { name: 'Editor workspaces' });
});

test('initial network failure is retryable without rendering protected controls', async () => {
  api.session.mockRejectedValueOnce(new EditorApiError(0, 'Unavailable'));
  render(<Editor />);
  await screen.findByRole('heading', { name: 'Unable to reach the editor' });
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await screen.findByRole('heading', { name: 'Website' });
});

test('expiry on focus removes protected content and explains how to continue', async () => {
  render(<Editor />);
  await screen.findByRole('navigation');
  api.session.mockRejectedValue(new EditorApiError(403, 'Expired'));
  await act(async () => { window.dispatchEvent(new Event('focus')); });
  expect(screen.getByRole('status')).toHaveTextContent('session has ended');
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
});

test('an earlier session response cannot restore access after sign-out', async () => {
  render(<Editor />);
  await screen.findByRole('navigation');
  let resolve!: (value: typeof session) => void;
  api.session.mockReturnValueOnce(new Promise(done => { resolve = done; }));
  fireEvent(window, new Event('focus'));
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  await screen.findByRole('heading', { name: 'Welcome back' });
  await act(async () => { resolve(session); });
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('signed out');
});

test('password confirmation, successful change and field clearing use the protected account workspace', async () => {
  window.history.replaceState({}, '', '/editor/#account');
  render(<Editor />);
  await screen.findByRole('heading', { name: 'Account' });
  fill('Current password', 'fictional-current');
  fill('New password', 'fictional-new-password');
  fill('Confirm new password', 'a-different-password');
  fireEvent.submit(screen.getByRole('form', { name: 'Change password' }));
  expect(screen.getByRole('alert')).toHaveTextContent('did not match');
  expect(api.password).not.toHaveBeenCalled();
  fill('Current password', 'fictional-current');
  fill('New password', 'fictional-new-password');
  fill('Confirm new password', 'fictional-new-password');
  fireEvent.submit(screen.getByRole('form', { name: 'Change password' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Password changed');
  expect(screen.getByLabelText('Current password')).toHaveValue('');
  expect(screen.getByLabelText('New password', { exact: true })).toHaveValue('');
  expect(api.password).toHaveBeenCalledWith({ current_password: 'fictional-current', new_password: 'fictional-new-password' });
});

test('expired mutation returns to sign-in, while a valid-session security failure remains actionable', async () => {
  render(<Editor />);
  await screen.findByRole('navigation');
  api.logout.mockRejectedValue(new EditorApiError(403, 'The security check failed.'));
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('security check failed'));
  expect(screen.getByRole('navigation')).toBeVisible();
  api.session.mockRejectedValue(new EditorApiError(403, 'Expired'));
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  await screen.findByRole('heading', { name: 'Welcome back' });
  expect(screen.getByRole('status')).toHaveTextContent('session has ended');
});
