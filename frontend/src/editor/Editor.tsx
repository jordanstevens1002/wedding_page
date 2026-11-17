import { useEffect, useRef, useState } from 'react';
import { LoginForm, PasswordForm } from './Forms';
import { useEditorSession } from './useEditorSession';

const sections = { website: 'Website', invitations: 'Invitations & RSVPs', account: 'Account' };
function currentSection(): keyof typeof sections {
  const key = window.location.hash.slice(1);
  return Object.hasOwn(sections, key) ? key as keyof typeof sections : 'website';
}

export function Editor() {
  const { access, working, login, password, logout, retry } = useEditorSession();
  const [section, setSection] = useState(currentSection);
  const [error, setError] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const navigate = () => { setSection(currentSection()); setError(''); };
    window.addEventListener('hashchange', navigate);
    return () => window.removeEventListener('hashchange', navigate);
  }, []);
  useEffect(() => { heading.current?.focus(); }, [access.kind, section]);
  useEffect(() => {
    document.title = access.kind === 'ready' ? `${sections[section]} · Wedding editor` : 'Sign in · Wedding editor';
  }, [access.kind, section]);
  const preview = <a href="/" target="_blank" rel="noopener noreferrer">View public site <span className="help">(new tab)</span></a>;

  if (access.kind === 'checking') return <main className="editor-root access-card"><p role="status">Checking editor access…</p></main>;
  if (access.kind === 'unavailable') return <main className="editor-root access-card">
    <h1 ref={heading} tabIndex={-1}>Unable to reach the editor</h1>
    <p role="alert">{access.message}</p><button onClick={retry}>Try again</button>
    <p>{preview}</p>
  </main>;
  if (access.kind === 'signed-out') return <main className="editor-root access-card">
    <p className="eyebrow">Wedding workspace</p>
    <h1 ref={heading} tabIndex={-1}>Welcome back</h1>
    <p>Sign in to look after your celebration.</p>
    {access.notice && <p role="status">{access.notice}</p>}
    <LoginForm submit={login} working={working} />
    <footer>{preview}</footer>
  </main>;

  return <div className="editor-root editor-shell">
    <a className="skip-link" href="#editor-content" onClick={event => {
      event.preventDefault(); document.getElementById('editor-content')?.focus();
    }}>Skip to editor content</a>
    <header>
      <a className="brand" href="/editor/#website">Wedding workspace</a>
      <div className="editor-actions"><span>Signed in as {access.session.username}</span>{preview}
        <button className="secondary" disabled={working} onClick={() => {
          setError(''); void logout().catch(failure => setError(failure instanceof Error ? failure.message : 'Please try again.'));
        }}>{working ? 'Please wait…' : 'Sign out'}</button>
      </div>
    </header>
    <div className="editor-layout">
      <nav aria-label="Editor workspaces">{Object.entries(sections).map(([key, label]) =>
        <a key={key} href={`#${key}`} aria-current={section === key ? 'page' : undefined} aria-disabled={working}
          onClick={event => { if (working) event.preventDefault(); }}>{label}</a>)}
      </nav>
      <main id="editor-content" className="workspace" tabIndex={-1}>
        <p className="eyebrow">Your celebration, your way</p>
        <h1 ref={heading} tabIndex={-1}>{sections[section]}</h1>
        {error && <p role="alert">{error}</p>}
        {section === 'account' ? <>
          <p>Keep your shared editor account secure.</p>
          <PasswordForm submit={password} working={working} />
        </> : <section className="workspace-placeholder">
          <h2>{section === 'website' ? 'A place for your wedding details' : 'A place for your guest list'}</h2>
          <p>{section === 'website' ? 'Content, photos and design controls will appear here when available.'
            : 'Invitation management and guest responses will appear here when available.'}</p>
          <p className="help">{section === 'website' ? 'The public view shows only published information.'
            : 'Guest details and responses will stay private to the editor and each invited party.'}</p>
        </section>}
      </main>
    </div>
  </div>;
}
