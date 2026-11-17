import { Editor } from './editor/Editor';

export function App() {
  if (window.location.pathname === '/editor' || window.location.pathname.startsWith('/editor/')) return <Editor />;
  return (
    <main className="public-page">
      <p className="eyebrow">A celebration to come</p>
      <h1>Details coming soon</h1>
      <p>We look forward to sharing more with you here.</p>
    </main>
  );
}
