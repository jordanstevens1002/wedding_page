import { useState } from 'react';
import type { Asset, ImageReference } from '../api/media';

export function ImagePreview({ asset, image, thumbnail = false }: {
  asset: Asset; image?: ImageReference | null; thumbnail?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return <div><p>Image preview unavailable.</p><button type="button" className="secondary" onClick={() => setFailed(false)}>Retry image preview</button></div>;
  const variants = [...asset.variants].sort((a, b) => a.width - b.width);
  const largest = variants.at(-1);
  if (!largest) return <p>Preview unavailable.</p>;
  return <img className={thumbnail ? 'library-thumbnail' : 'image-preview'} src={largest.url}
    srcSet={variants.map(v => `${v.url} ${v.width}w`).join(', ')}
    sizes={thumbnail ? '(max-width: 720px) 40vw, 180px' : '(max-width: 720px) 90vw, 640px'}
    onError={() => setFailed(true)} width={asset.width} height={asset.height} loading="lazy"
    alt={thumbnail || image?.decorative ? '' : image?.alt_text || 'Selected image preview'}
    style={{ objectPosition: `${(image?.focal_x ?? 0.5) * 100}% ${(image?.focal_y ?? 0.5) * 100}%` }} />;
}
