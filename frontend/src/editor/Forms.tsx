import { useState, type FormEvent } from 'react';
import type { editorApi } from '../api/editor';

const message = (error: unknown) => error instanceof Error ? error.message : 'Please try again.';
const value = (data: FormData, name: string) => String(data.get(name) ?? '');

export function LoginForm({ submit, working }: {
  submit: (data: Parameters<typeof editorApi.login>[0]) => Promise<void>; working: boolean;
}) {
  const [error, setError] = useState('');
  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    event.currentTarget.reset();
    setError('');
    try { await submit({ username: value(data, 'username'), password: value(data, 'password') }); }
    catch (failure) { setError(message(failure)); }
  }
  return <form onSubmit={signIn} aria-label="Editor sign in">
    <fieldset disabled={working}>
      <label htmlFor="username">Username</label>
      <input id="username" name="username" autoComplete="username" defaultValue="editor" maxLength={150} required />
      <label htmlFor="password">Password</label>
      <input id="password" name="password" type="password" autoComplete="current-password" maxLength={1024} required />
      {error && <p role="alert">{error}</p>}
      <button type="submit">{working ? 'Signing in…' : 'Sign in'}</button>
    </fieldset>
    <p className="help">Your site operator can reset a forgotten password.</p>
  </form>;
}

export function PasswordForm({ submit, working }: {
  submit: (data: Parameters<typeof editorApi.password>[0]) => Promise<void>; working: boolean;
}) {
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  async function change(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    event.currentTarget.reset();
    setError(''); setNotice('');
    if (value(data, 'new_password') !== value(data, 'confirmation')) {
      setError('The new passwords did not match. Please enter them again.');
      return;
    }
    try {
      await submit({ current_password: value(data, 'current_password'), new_password: value(data, 'new_password') });
      setNotice('Password changed. You are still signed in; other editor sessions have ended.');
    } catch (failure) { setError(message(failure)); }
  }
  return <form onSubmit={change} aria-label="Change password">
    <fieldset disabled={working}>
      <label htmlFor="current-password">Current password</label>
      <input id="current-password" name="current_password" type="password" autoComplete="current-password" maxLength={1024} required />
      <label htmlFor="new-password">New password</label>
      <input id="new-password" name="new_password" type="password" autoComplete="new-password" minLength={12} maxLength={1024} aria-describedby="password-help" required />
      <p id="password-help" className="help">Use at least 12 characters. Avoid common passwords and your username.</p>
      <label htmlFor="confirm-password">Confirm new password</label>
      <input id="confirm-password" name="confirmation" type="password" autoComplete="new-password" minLength={12} maxLength={1024} required />
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <button type="submit">{working ? 'Saving…' : 'Change password'}</button>
    </fieldset>
  </form>;
}
