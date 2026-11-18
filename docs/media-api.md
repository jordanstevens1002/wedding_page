# Runtime photos

Upload, library, delivery and deletion APIs support the browser
[image editor](image-editor.md). Actual photos stay in the deployment's
private media volume; no originals or processed photos belong in Git/build contexts.

## Upload and browse

An authenticated editor with CSRF may POST one multipart `file` to
`/api/editor/media/`. The server decodes actual bytes rather than trusting filenames
or declared MIME types. Supported inputs are still JPEG, PNG and WebP, up to 16 MiB,
32 megapixels and 12,000 pixels on either side. Animated and malformed files are
rejected. Export other formats, including HEIC, to a supported format before upload.

Processing applies EXIF orientation, copies pixels onto a clean RGB/RGBA canvas and
encodes WebP variants at widths up to 640, 1280 and 1920 pixels, without upscaling.
EXIF, GPS, ICC/XMP metadata and original filenames are not retained. Original input
bytes are not stored in the persistent media volume. Alpha transparency is retained.

Success returns 201 with a generated UUID, oriented source dimensions, server upload
time and variant dimensions/relative delivery URLs. Widths smaller than a target
produce a single smaller variant. Files use generated UUID directories and numeric
WebP filenames, never caller-supplied paths.
The gateway allows 17 MiB multipart requests on this route; the existing edge proxy
must also allow that request size. The image itself remains limited to 16 MiB.

Editor-only GET `/api/editor/media/` lists newest uploads, 24 per page by default;
`page_size` is capped at 100. GET `/api/editor/media/{uuid}/` returns one asset's
metadata. Neither response exposes original filenames, filesystem paths or actor IDs.

## Versioned image references

Website sections and entries may contain a nullable `image` reference with:

- `asset_id`: an existing library UUID.
- `alt_text`: up to 500 characters, required unless `decorative` is true.
- `decorative`: defaults to false.
- `caption`: up to 1,000 characters.
- `focal_x`, `focal_y`: finite numbers from 0 to 1, defaulting to the image centre.

These display settings belong to each website revision, not the asset itself. A new
draft caption/focal point therefore cannot change a published revision. Existing text
snapshots without image fields continue to read with null references; stored history
is not rewritten. The asset's processed bytes remain unchanged; replacing a photo
means uploading a new asset and saving a new reference.

Saving a draft validates and locks all selected assets before recording references.
Missing assets cause a validation error without advancing the draft. Every retained
revision records its asset links, including hidden sections and historical versions.

## Delivery and deletion

GET `/api/media/{uuid}/{width}/` serves WebP bytes. Anonymous access requires a
reference in a visible section of the current published website projection. A draft,
hidden section or historical publication alone never makes an asset public. Editors
may view private images through their normal session, including its expiry rules.
Unavailable, unapproved and unknown images return 404. Responses use no-store and
nosniff headers. There is no public static mapping of the media volume.
GET `/api/media/{uuid}/` uses the same access rule and supplies dimensions/variant URLs
for responsive rendering, without upload times, actor IDs or original filenames.

Editor DELETE `/api/editor/media/{uuid}/` requires CSRF. Referenced images return
409, even if their only references are in retained history. An unreferenced asset's
record is removed transactionally and files are removed after commit. Asset locking
and foreign-key protection prevent a concurrent draft save/deletion from leaving a
dangling reference.

Uploads encode into a private temporary directory, then atomically move all variants
into place before the asset transaction commits. Handled failures clean up temporary
files and roll back records. If commit status cannot be determined, files are retained
as private orphans rather than risking deletion of a committed asset. Failed disk
cleanup or an abrupt process stop can likewise leave inaccessible orphan directories;
never expose the volume directly. Backups must preserve both database and media.
