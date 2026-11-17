# Agreed v1 design

## Deployment and data

Use React/TypeScript/Vite, Django 5.2 LTS with Django REST Framework and PostgreSQL.
Publish an OpenAPI contract and generate TypeScript boundary types. Keep permission
checks and RSVP validation on the server; client validation improves usability only.

Compose will run a web gateway, Django application, database and one-shot migration
service. Expose only the configurable web port, bound to localhost by default,
behind the operator's existing HTTPS proxy. Store database and media in persistent
volumes. Configuration examples contain placeholders; images contain no runtime data.
There is no automatic production deployment when a feature PR merges.

Use Django hashing, database sessions, CSRF and database-backed login throttling.
Configure trusted proxy handling explicitly. Provide one-time operator bootstrap
and recovery commands instead of default editor credentials. Separate editor and
party authority even if both use server-side sessions.

Default to Australian English and a configurable wedding timezone, initially
`Australia/Sydney`. Store event instants unambiguously and label local deadlines.

## Website editing

Support welcome, story, schedule, venue, travel, accommodation, FAQs, registry links
and gallery sections. Each section has stable identity, visibility and order.
Editorial, minimal and botanical layouts share content, photo references and colour
tokens. Include saved palettes, custom colour pickers and contrast feedback.
Preserve content while switching layout or palette.

One shared editor account uses keyboard-accessible inline text/photo controls.
Side panels handle section order, theme and preview size. This is a constrained
editor, not an arbitrary HTML or drag-and-resize page builder.

Save private drafts; publish a saved revision atomically. Restore an earlier revision
into a new draft. Detect stale writes/publications across tabs. Public endpoints
return only current published content. A fresh installation shows a neutral public
state until configured; examples are explicitly fictional and opt-in.

Editors upload photos with alt text, captions and focal points. Validate actual
formats/limits, re-encode, strip metadata and generate responsive variants. Only
currently published referenced assets are public; draft and historical assets require
editor access. Do not delete files referenced by retained revisions.

## Invitations and responses

Editors create parties and people through browser forms. Each party has a unique
code and generated password. Store only its hash; show credentials at generation or
reset for copying into invitations. Reset/disable operations revoke party sessions.
No CSV import or automatic email delivery is included in v1.

Parties contain named guests and editor-assigned unnamed plus-one slots. Guests may
name those slots but cannot add people. Each guest is invited to specific events;
party access is limited to those people and invitations. Published site content is
public; guest lists, global counts and responses are private.

Each event has a deadline and configurable public schedule visibility. Guests can
accept/decline per invited person per event and revise before its deadline. Closed
event answers remain visible. Editors may record later corrections with history.

Questions support text, long text, yes/no, single choice and multiple choice. They
have stable question/option identifiers, person/party scope, ordering, required flags
and optional attendance-linked visibility. Arbitrary branching is excluded.

RSVP configuration has a draft/publication workflow independent of website publishing.
Published event/question snapshots are immutable. Restoring one creates a new draft
and then another version. Every submitted response preserves form version, original
wording, choices, answers, timestamp and party/editor attribution.

After form changes, prefill only compatible answers and identify missing/incompatible
answers for review. Never reinterpret historical data. Reject stale form/response
versions and refresh without silently losing entered values. Make duplicate retries
safe and prevent concurrent overwrites. Enforce eligibility, slot limits, deadlines,
required fields and answer types on the server.

The editor dashboard reports attendance, unanswered invitations and review needs.
Export guest lists, current answers and historical answers to CSV with version/time
context and spreadsheet formula neutralisation. Never export credentials.

## Verification and operations

Backend/frontend tests accompany each behavioural slice. Critical Playwright journeys
must pass Chromium, Firefox and WebKit; verify mobile/desktop, all layouts, keyboard
operation and accessibility. Exercise party isolation, private drafts, stale writes,
form changes, deadline boundaries, retries, plus-one limits and historical exports.

Back up PostgreSQL and media consistently. Rehearse restoration into empty volumes,
including credentials, photos, website revisions, form versions and response history.
Back up before upgrades; document matching application/database/media recovery.
Website revision restoration is separate from database rollback.

Release gates include fresh install, volume persistence, upgrade/recovery, dependency
and image checks, and build-context inspection for private data. Document operator
commands and editor workflows using fictional examples only.

Outside v1: CSV import, automatic email, arbitrary page building, complex branching,
guest photo uploads and separate editor roles. Future ideas have no committed date.
