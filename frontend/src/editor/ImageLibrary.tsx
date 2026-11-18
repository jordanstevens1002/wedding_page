import { useEffect, useRef, useState, type FormEvent } from 'react';
import { mediaApi, type Asset } from '../api/media';
import { EditorApiError } from '../api/editor';
import { ImagePreview } from './ImagePreview';

export function ImageLibrary({ select, failSession, onBusy, onDelete }: { select: (asset: Asset) => void; failSession: () => void; onBusy: (busy: boolean) => void; onDelete: (id: string) => void }) {
  const [library, setLibrary] = useState<Awaited<ReturnType<typeof mediaApi.library>>>();
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [file, setFile] = useState<File>();
  const [deleting, setDeleting] = useState<string>();
  const alive = useRef(true);
  const lock = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; onBusy(false); }; }, [onBusy]);
  function failure(error: unknown) {
    setError(error instanceof Error ? error.message : 'Please try again.');
    if (error instanceof EditorApiError && [401, 403].includes(error.status)) failSession();
  }
  useEffect(() => {
    let current = true;
    setLoading(true); setLibrary(undefined); setDeleting(undefined); setError('');
    void mediaApi.library(page).then(result => { if (current) setLibrary(result); })
      .catch(error => { if (current) failure(error); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [page, reload]);
  async function perform(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); onBusy(true); setError(''); setNotice('');
    try { await action(); } catch (error) { if (alive.current) failure(error); }
    finally { lock.current = false; if (alive.current) { setBusy(false); onBusy(false); } }
  }
  function upload(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    if (file.size > 16 * 1024 * 1024) { setError('Choose an image up to 16 MiB.'); return; }
    void perform(async () => {
      const asset = await mediaApi.upload(file);
      if (!alive.current) return;
      select(asset); setNotice('Image uploaded and selected. Add its details, then save the draft.');
      setPage(1); setReload(value => value + 1);
    });
  }
  return <section className="image-library" aria-labelledby="library-heading">
    <h2 id="library-heading">Image library</h2>
    <p>Upload photos here, then choose where to use them. Uploading alone does not publish an image.</p>
    <form aria-label="Upload image" onSubmit={upload}>
      <fieldset disabled={busy}>
        <label htmlFor="image-file">Choose a photo</label>
        <input id="image-file" type="file" accept="image/jpeg,image/png,image/webp" required
          onChange={event => { setFile(event.target.files?.[0]); setError(''); }} aria-describedby="upload-help" />
        <p id="upload-help" className="help">Still JPEG, PNG or WebP. Up to 16 MiB, 32 megapixels and 12,000 pixels per side. Convert HEIC photos first.</p>
        <button type="submit" disabled={!file}>{busy ? 'Please wait…' : 'Upload image'}</button>
      </fieldset>
    </form>
    {error && <div role="alert"><p>{error}</p><p>For an upload failure, keep your selected file and press Upload image to retry. If the connection was interrupted, refresh the library first to check whether it arrived.</p></div>}
    {notice && <p role="status">{notice}</p>}
    <button className="secondary" disabled={busy || loading} onClick={() => setReload(value => value + 1)}>Refresh library</button>
    {loading ? <p role="status">Loading images…</p> : library && <>
      <p>{library.count} images · Page {page}</p>
      {library.results.length === 0 && <p>Your library is empty. Upload your first photo above.</p>}
      <ul className="image-grid">{library.results.map((asset, index) => <li key={asset.id}>
        <ImagePreview asset={asset} thumbnail />
        <p>{asset.width} × {asset.height} pixels</p>
        <button disabled={busy} onClick={() => select(asset)}>Use image {index + 1}</button>
        {deleting === asset.id ? <div>
          <p>Delete this unused image permanently?</p>
          <button disabled={busy} onClick={() => void perform(async () => {
            await mediaApi.delete(asset.id);
            if (!alive.current) return;
            onDelete(asset.id); setDeleting(undefined); setNotice('Image deleted.');
            if (library.results.length === 1 && page > 1) setPage(page - 1);
            else setReload(value => value + 1);
          })}>Confirm deletion</button>
          <button className="secondary" disabled={busy} onClick={() => setDeleting(undefined)}>Cancel deletion</button>
        </div> : <button className="secondary" disabled={busy} onClick={() => setDeleting(asset.id)}>Delete image {index + 1}</button>}
      </li>)}</ul>
      <div className="image-actions">
        <button className="secondary" disabled={busy || page === 1} onClick={() => setPage(page - 1)}>Previous page</button>
        <button className="secondary" disabled={busy || !library.next} onClick={() => setPage(page + 1)}>Next page</button>
      </div>
    </>}
    {!loading && !library && <button onClick={() => setReload(value => value + 1)}>Retry library</button>}
    <p className="help">Images used in any saved version cannot be deleted, even after removal from the latest draft. This protects your published site and saved history.</p>
  </section>;
}
