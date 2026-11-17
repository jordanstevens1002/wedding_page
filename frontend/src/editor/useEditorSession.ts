import { useCallback, useEffect, useRef, useState } from 'react';
import { editorApi, EditorApiError, type EditorSession } from '../api/editor';

type Access = { kind: 'checking' } | { kind: 'signed-out'; notice?: string }
  | { kind: 'ready'; session: EditorSession } | { kind: 'unavailable'; message: string };
const unauthorised = (error: unknown) => error instanceof EditorApiError && [401, 403].includes(error.status);

export function useEditorSession() {
  const [access, setAccess] = useState<Access>({ kind: 'checking' });
  const [working, setWorking] = useState(false);
  const generation = useRef(0);
  const busy = useRef(false);
  const known = useRef(false);
  const check = useCallback(async (block = false) => {
    if (busy.current) return;
    const version = ++generation.current;
    if (block) setAccess({ kind: 'checking' });
    try {
      const session = await editorApi.session();
      if (version !== generation.current) return;
      known.current = true;
      setAccess({ kind: 'ready', session });
    } catch (error) {
      if (version !== generation.current) return;
      if (unauthorised(error)) {
        setAccess({ kind: 'signed-out', notice: known.current ? 'Your editor session has ended. Sign in again to continue.' : undefined });
        known.current = false;
      } else setAccess({ kind: 'unavailable', message: 'We could not confirm your editor session. Please try again.' });
    }
  }, []);

  useEffect(() => {
    void check(true);
    const focus = () => { void check(); };
    const navigate = () => { void check(true); };
    const visibility = () => { if (document.visibilityState === 'visible') focus(); };
    window.addEventListener('focus', focus);
    window.addEventListener('hashchange', navigate);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      ++generation.current;
      window.removeEventListener('focus', focus);
      window.removeEventListener('hashchange', navigate);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [check]);

  async function perform(action: () => Promise<EditorSession | null>) {
    if (busy.current) return;
    busy.current = true;
    setWorking(true);
    const version = ++generation.current;
    try {
      const result = await action();
      if (version !== generation.current) return;
      known.current = !!result;
      setAccess(result ? { kind: 'ready', session: result } : { kind: 'signed-out', notice: 'You have signed out.' });
    } catch (error) {
      if (unauthorised(error)) {
        try { await editorApi.session(); }
        catch (verification) {
          if (unauthorised(verification) && version === generation.current) {
            const notice = known.current ? 'Your editor session has ended. Sign in again to continue.' : 'Please sign in to continue.';
            known.current = false;
            setAccess({ kind: 'signed-out', notice });
          } else if (version === generation.current) {
            setAccess({ kind: 'unavailable', message: 'We could not confirm your editor session. Please try again.' });
          }
        }
      }
      throw error;
    } finally {
      busy.current = false;
      if (version === generation.current) setWorking(false);
    }
  }

  return { access, working, retry: () => { void check(true); },
    login: (data: Parameters<typeof editorApi.login>[0]) => perform(() => editorApi.login(data)),
    password: (data: Parameters<typeof editorApi.password>[0]) => perform(() => editorApi.password(data)),
    logout: () => perform(editorApi.logout) };
}
