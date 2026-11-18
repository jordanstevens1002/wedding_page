# Edit website photos

Sign in at `/editor/` and open Website. Image changes are saved to a private draft;
this step does not publish them. The public site remains unchanged. Full content
editing and publication controls arrive in subsequent roadmap steps.

## Choose a location and photo

1. Choose an **Image location**: a section image or an existing entry in that section.
   Entries must already exist; creating gallery entries follows with content editing.
2. Choose a photo and press **Upload image**, or press **Use image** beside an existing
   library photo. Uploads are stored on the deployment, outside the public repository.
3. Enter alt text, or mark the photo decorative if it adds no information. Add an
   optional caption and adjust the horizontal and vertical focal-point sliders.
4. Press **Save image changes**. Wait for confirmation before leaving or reloading.

Selecting or uploading an image does not automatically save it to the website.
Changing a location's image resets its description, caption and focal point; add the
appropriate details for that use. One photo can have different settings in different
locations. Removing an image from a location also requires saving the draft.

The preview loads responsive variants and shows a cropped frame with the selected
focal point. Final layouts may use a different crop. A narrow screen uses a smaller
variant where available. Original photos are never served. Use Tab to move through
controls and the arrow keys to adjust a focused slider; Home/End move to its edges.

Uploads accept still JPEG, PNG or WebP images up to 16 MiB, 32 megapixels and 12,000
pixels per side. Convert HEIC/animated photos before uploading. Processing removes
embedded metadata, including camera location. See the [media API](media-api.md)
for storage and delivery details.

## Recover from a failure

- A rejected upload displays the server's reason. Select a different file, or retry
  the same file with **Upload image** after a temporary failure.
- If an upload connection was interrupted, use **Refresh library** before retrying:
  the server may have completed the upload even though the response did not arrive.
- Library and preview failures have explicit retry controls. Library pagination
  keeps uploads manageable without loading every photo at once.
- Failed draft saves retain the entered details for another attempt. If another
  editor saved first, **Load latest draft** asks before discarding your settings.
  Reapply them to the latest draft; a stale save never overwrites newer changes.
- An expired session returns to sign-in. Unsaved settings are held only in browser
  memory and are lost on sign-out, reload or session expiry. No photos, draft text
  or credentials are written to browser local/session storage.

The editor asks before discarding unsaved image details when switching locations,
using workspace links or signing out. Browser reload/close uses the browser's
standard unsaved-change prompt where supported.

## Delete unused photos

Press **Delete image** and then **Confirm deletion**. Cancel leaves the photo intact.
Only unused uploads can be deleted. Photos referenced by any saved website version,
including hidden sections or old drafts, return an explanation and remain available.
Removing a photo from today's draft does not remove historical references. This
prevents a deletion from breaking published pages or recoverable history.

An uploaded image remains private until it is used by a visible section in the
current published website. Editor previews do not make it public.
