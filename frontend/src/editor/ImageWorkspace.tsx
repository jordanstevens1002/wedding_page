import { useEffect, useRef, useState, type FormEvent } from 'react';
import { mediaApi, type Asset, type Draft, type ImageReference } from '../api/media';
import { EditorApiError } from '../api/editor';
import { ImageLibrary } from './ImageLibrary';
import { ImagePreview } from './ImagePreview';

export function ImageWorkspace({ failSession, onDirty }: { failSession: () => void; onDirty: (dirty: boolean) => void }) {
  const [draft, setDraft] = useState<Draft>();
  const [target, setTarget] = useState('0');
  const [image, setImage] = useState<ImageReference | null>(null);
  const [asset, setAsset] = useState<Asset>();
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [reload, setReload] = useState(0);
  const [previewError, setPreviewError] = useState('');
  const [previewRetry, setPreviewRetry] = useState(0);
  const alive = useRef(true);
  const lock = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; onDirty(false); }; }, [onDirty]);
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);
  function failure(error: unknown) {
    setError(error instanceof Error ? error.message : 'Please try again.');
    if (error instanceof EditorApiError && [401, 403].includes(error.status)) failSession();
  }
  useEffect(() => {
    let current = true;
    setBusy(true); setError('');
    void mediaApi.draft().then(value => {
      if (!current) return;
      setDraft(value); setTarget('0'); setImage(value.document.sections[0]?.image ?? null);
      setDirty(false); setConflict(false); setNotice('');
    }).catch(error => { if (current) failure(error); }).finally(() => { if (current) setBusy(false); });
    return () => { current = false; };
  }, [reload]);
  useEffect(() => {
    let current = true;
    setAsset(undefined); setPreviewError('');
    if (image) void mediaApi.asset(image.asset_id).then(value => { if (current) setAsset(value); })
      .catch(error => {
        if (!current) return;
        setPreviewError('The selected image could not be loaded. Retry the preview or select another image.');
        if (error instanceof EditorApiError && [401, 403].includes(error.status)) failSession();
      });
    return () => { current = false; };
  }, [image?.asset_id, previewRetry]);
  function update(changes: Partial<ImageReference>) {
    if (!image) return;
    setImage({ ...image, ...changes }); setDirty(true); setNotice('');
  }
  function changeTarget(value: string) {
    if (dirty && !window.confirm('Discard unsaved image changes?')) return;
    const [sectionIndex, entryIndex] = value.split(':').map(Number);
    const section = draft!.document.sections[sectionIndex];
    setTarget(value); setImage((value.includes(':') ? section.entries[entryIndex].image : section.image) ?? null);
    setDirty(false); setError(''); setNotice('');
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || lock.current || conflict) return;
    if (image && !image.decorative && !image.alt_text.trim()) {
      setError('Add alt text or mark this image as decorative.'); return;
    }
    lock.current = true; setBusy(true); setError(''); setNotice('');
    const next = structuredClone(draft);
    const [sectionIndex, entryIndex] = target.split(':').map(Number);
    const section = next.document.sections[sectionIndex];
    (target.includes(':') ? section.entries[entryIndex] : section).image = image;
    try {
      const saved = await mediaApi.save(next);
      if (!alive.current) return;
      setDraft(saved); setDirty(false); setNotice('Image changes saved to the draft. The public site has not changed.');
    } catch (error) {
      if (!alive.current) return;
      if (error instanceof EditorApiError && error.status === 409) setConflict(true);
      failure(error);
    } finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  return <section className="image-workspace" aria-labelledby="images-heading">
    <h2 id="images-heading">Website images</h2>
    <p>Choose a section or existing entry, select a photo and save its image details to the draft.</p>
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {busy && <p role="status">Please wait…</p>}
    {(!draft || conflict) && !busy && <button onClick={() => {
      if (!dirty || window.confirm('Discard your unsaved image changes and load the latest draft?')) setReload(value => value + 1);
    }}>{conflict ? 'Load latest draft' : 'Retry draft'}</button>}
    {conflict && <p>Another editor saved changes. Your image settings remain here for reference; load the latest draft and apply them again before saving.</p>}
    {draft && <fieldset disabled={busy || libraryBusy || conflict}>
      <label htmlFor="image-target">Image location</label>
      <select id="image-target" value={target} onChange={event => changeTarget(event.target.value)}>
        {draft.document.sections.map((section, index) => <optgroup key={section.id} label={section.heading || section.id}>
          <option value={String(index)}>{section.heading || section.id} · Section image</option>
          {section.entries.map((entry, entryIndex) => <option key={entry.id} value={`${index}:${entryIndex}`}>
            {section.heading || section.id} · {entry.title}
          </option>)}
        </optgroup>)}
      </select>
      <p className="help">{dirty ? 'Unsaved image changes.' : 'Image settings match the saved draft.'} Hidden sections stay private until published and visible.</p>
      <form aria-label="Image details" onSubmit={event => void save(event)}>
        {image ? <>
          {asset && <figure><ImagePreview asset={asset} image={image} />{image.caption && <figcaption>{image.caption}</figcaption>}</figure>}
          {previewError && <div role="alert"><p>{previewError}</p><button type="button" onClick={() => setPreviewRetry(value => value + 1)}>Retry preview</button></div>}
          {!asset && !previewError && <p role="status">Loading selected image…</p>}
          <label htmlFor="image-alt">Alt text</label>
          <input id="image-alt" value={image.alt_text} maxLength={500} required={!image.decorative}
            onChange={event => update({ alt_text: event.target.value })} aria-describedby="alt-help" />
          <p id="alt-help" className="help">Describe the image for someone who cannot see it. A decorative image conveys no extra information.</p>
          <label className="checkbox-label"><input type="checkbox" checked={image.decorative}
            onChange={event => update({ decorative: event.target.checked })} /> Decorative image</label>
          <label htmlFor="image-caption">Caption</label>
          <input id="image-caption" value={image.caption} maxLength={1000} onChange={event => update({ caption: event.target.value })} />
          <p className="help">Adjust the point kept in view when the photo is cropped. Use the slider arrow keys for fine adjustments.</p>
          <label htmlFor="focal-x">Horizontal focal point: {Math.round(image.focal_x * 100)}%</label>
          <input id="focal-x" type="range" min="0" max="100" step="1" value={Math.round(image.focal_x * 100)}
            onChange={event => update({ focal_x: Number(event.target.value) / 100 })} />
          <label htmlFor="focal-y">Vertical focal point: {Math.round(image.focal_y * 100)}%</label>
          <input id="focal-y" type="range" min="0" max="100" step="1" value={Math.round(image.focal_y * 100)}
            onChange={event => update({ focal_y: Number(event.target.value) / 100 })} />
          <button type="button" className="secondary" onClick={() => update({ focal_x: 0.5, focal_y: 0.5 })}>Centre focal point</button>
          <button type="button" className="secondary" onClick={() => { setImage(null); setDirty(true); setNotice(''); }}>Remove image from location</button>
        </> : <p>No image selected for this location. Choose one from the library below.</p>}
        <button type="submit" disabled={!dirty || busy}>Save image changes</button>
      </form>
      <ImageLibrary failSession={failSession} onBusy={setLibraryBusy} onDelete={id => {
        if (image?.asset_id === id) { setImage(null); setDirty(true); }
      }} select={value => {
        setImage({ asset_id: value.id, alt_text: '', decorative: false, caption: '', focal_x: 0.5, focal_y: 0.5 });
        setDirty(true); setNotice('Image selected. Add alt text or mark it decorative, then save.');
      }} />
    </fieldset>}
  </section>;
}
