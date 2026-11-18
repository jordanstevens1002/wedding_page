import { EditorApiError } from './editor';
import type { components } from './generated/schema';

export type Asset = components['schemas']['Asset'];
export type ImageReference = components['schemas']['ImageReference'];
export type Draft = components['schemas']['Draft'];
type Library = components['schemas']['PaginatedAssetList'];

async function request<T>(route: string, init: RequestInit = {}): Promise<T> {
  const [path, query] = route.split('?');
  let response: Response;
  try {
    response = await fetch(`/api/editor/${path}/${query ? '?' + query : ''}`, {
      credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(60000), ...init,
    });
  } catch { throw new EditorApiError(0, 'The request could not be completed. Check your connection and try again.'); }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = response.status === 413 ? 'Choose an image up to 16 MiB.'
      : response.status >= 500 ? 'Image storage is unavailable. Please try again.'
      : typeof body?.detail === 'string' ? body.detail
      : Array.isArray(body?.file) ? body.file.join(' ')
      : response.status === 403 ? 'Your session or security token has expired. Sign in again if requested, then retry.'
      : 'The changes could not be saved. Check the image details and try again.';
    throw new EditorApiError(response.status, detail.slice(0, 1000));
  }
  if (response.status !== 204 && !body) throw new EditorApiError(0, 'The server response could not be read. Please retry.');
  return body as T;
}

async function mutate<T>(route: string, method: string, body?: BodyInit): Promise<T> {
  const token = await request<components['schemas']['Token']>('csrf');
  return request(route, { method, body, headers: {
    'X-CSRFToken': token.csrf_token,
    ...(typeof body === 'string' ? { 'Content-Type': 'application/json' } : {}),
  } });
}

export const mediaApi = {
  library: (page = 1) => request<Library>(`media?page=${page}`),
  asset: (id: string) => request<Asset>(`media/${encodeURIComponent(id)}`),
  upload: (file: File) => {
    const body = new FormData(); body.append('file', file);
    return mutate<Asset>('media', 'POST', body);
  },
  delete: (id: string) => mutate<null>(`media/${encodeURIComponent(id)}`, 'DELETE'),
  draft: () => request<Draft>('site/draft'),
  save: (draft: Draft) => mutate<Draft>('site/draft', 'PUT', JSON.stringify({
    base_revision: draft.revision, document: draft.document,
  })),
};
