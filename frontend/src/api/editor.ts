import type { components } from './generated/schema';

export type EditorSession = components['schemas']['Session'];
type Login = components['schemas']['Login'];
type Password = components['schemas']['Password'];

export class EditorApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function request(route: string, init: RequestInit = {}): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`/api/editor/${route}/`, {
      credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(15000), ...init,
    });
  } catch {
    throw new EditorApiError(0, 'The editor could not be reached. Please try again.');
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    let message = 'Something went wrong. Please try again.';
    if (response.status >= 500) message = 'The editor is unavailable right now. Please try again.';
    else if (response.status === 429) {
      const seconds = Number(response.headers.get('Retry-After'));
      message = seconds > 0 && Number.isFinite(seconds)
        ? `Too many sign-in attempts. Try again in ${Math.ceil(seconds / 60)} minutes.`
        : 'Too many sign-in attempts. Please try again later.';
    } else if (typeof body?.detail === 'string') message = body.detail.slice(0, 1000);
    else if (Array.isArray(body?.new_password)) message = body.new_password.filter((x: unknown) => typeof x === 'string').join(' ').slice(0, 1000);
    else if (response.status === 403) message = 'The security check failed. Please try again.';
    throw new EditorApiError(response.status, message);
  }
  if (response.status === 204) return null;
  if (!body || typeof body.csrf_token !== 'string' || !body.csrf_token) {
    throw new EditorApiError(0, 'The server response could not be read. Please try again.');
  }
  return body;
}

async function session(body: Promise<unknown>): Promise<EditorSession> {
  const result = await body as EditorSession;
  if (typeof result?.username !== 'string' || !result.username) {
    throw new EditorApiError(0, 'The server response could not be read. Please try again.');
  }
  return result;
}

async function mutation(route: string, data?: Login | Password) {
  const token = await request('csrf') as components['schemas']['Token'];
  return request(route, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRFToken': token.csrf_token },
    body: data ? JSON.stringify(data) : undefined,
  });
}

export const editorApi = {
  session: () => session(request('session')),
  login: (data: Login) => session(mutation('login', data)),
  password: (data: Password) => session(mutation('password', data)),
  logout: async () => { await mutation('logout'); return null; },
};
