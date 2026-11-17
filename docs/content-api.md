# Runtime website content

Wedding content belongs in PostgreSQL deployment storage, not this public repository
or container image layers. This slice adds draft APIs and storage; the browser content
editor and publication workflow follow in later issues.

## Read and save drafts

`GET /api/editor/site/draft/` requires the configured editor session. A fresh install
returns revision 0 and an empty document without creating database records. All
sections are initially hidden, with no real names, dates, locations or photos.

`PUT /api/editor/site/draft/` requires the editor and CSRF. Send the entire document
under `document`, with the revision from the last read under `base_revision`.
Success returns the new `revision` and normalised `document`. Save that new revision
for the next write. PATCH and client-supplied publication/author metadata are rejected.

Each accepted save appends a snapshot with server-assigned author/time metadata and
advances only the draft pointer. Row locking and base-revision checks prevent lost
updates, including concurrent first saves. A stale base returns 409 with the current
revision; reload and compare your work before saving again. Do not automatically
retry a conflicting write against a newer revision.

Snapshot model/queryset methods block in-place updates and deletion. Trusted service
writers validate documents before appending; the API does not expose raw model writes.
Old revisions remain intact when a new draft is saved. Later publication/restoration
must advance pointers or append snapshots rather than rewrite history.

## Document contract

Schema version 1 contains title, couple_names, nullable wedding_date, an IANA timezone
and an ordered sections array. The title and other document-level metadata become
public when a revision is published. Dates use ISO dates; entry timestamps require an
explicit offset and are normalised to UTC.

Include each section exactly once: welcome, story, schedule, venue, travel,
accommodation, faq, registry and gallery. Their fixed identifiers survive heading
changes and reordering. Each section has heading, plain-text body, visible and entries.
Hiding a section preserves its private text; removing or duplicating identifiers is
invalid. Array order defines display order.

Entries contain a stable UUID id, title, plain-text body, optional HTTP(S) url and
nullable starts_at. Use titles/bodies for FAQ questions/answers, venue or lodging
details, travel guidance and registry labels; schedule entries can include timestamps.
Entry identifiers must be unique within their section. Gallery text is supported;
uploaded image references and delivery arrive with the media issues.

Headings/entry titles are limited to 140 characters, section bodies to 8,000 and entry
bodies to 4,000. Each section allows up to 50 entries; total normalised text data must
fit within 256 KiB. Images will upload separately. Unknown fields and unsafe URL
schemes are rejected. Text fields are plain text, never executable HTML.

## Public boundary

`GET /api/site/` is public and does not use editor authentication. Until a revision is
published it returns `{"configured":false,"document":null}`, even when private drafts
exist. The public placeholder therefore stays neutral. Responses are not cached.

When a published pointer exists, the API reads that snapshot only and omits hidden
sections completely. It never returns draft IDs, creator metadata or private history.
The public projection must also define which future media references are publicly
accessible. No endpoint in this slice can publish a revision; publication is issue #10.

## Optional fictional example

After editor bootstrap, explicitly opt in with:

```sh
docker compose exec app python manage.py example_site_draft
```

This creates an unmistakably fictional private draft without choosing a real wedding
date. It refuses to replace an existing draft and never publishes anything. It is not
run on normal startup or during migrations. CI uses it only in disposable volumes to
verify that drafts persist after container recreation while public responses stay empty.
