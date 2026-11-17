# Security and private data

Do not open a public issue containing a vulnerability, real guest data, credentials
or private deployment details. Use GitHub's private vulnerability reporting on the
repository's Security tab when available. If unavailable, ask the maintainer for a
private reporting channel without publishing sensitive details.

The application is not implemented or ready for deployment yet. Before v1, verify
editor/party separation, party isolation, CSRF, credential rotation, draft asset
access and tested backup restoration.

## Data boundaries

- Public: explicitly published wedding pages and their referenced photos.
- Party-only: that party's invited guests, eligible events and RSVP responses.
- Editor-only: drafts, media history, all invitations, responses, reports and exports.
- Operator-only: deployment secrets, database/media backups and recovery tooling.

All real data belongs in deployment volumes or private operator-managed files.
Never commit it, bake it into images or publish it in issue/PR/CI attachments.
Ignore files and path checks are guardrails; inspect staged content before pushing.

The planned deployment uses HTTPS through an existing trusted proxy, hashed
passwords, database-backed sessions and throttling, secure cookies and CSRF.
There will be no default credentials. Party passwords never grant editor access.
The shared editor account records editor-level attribution, not individual identity.
