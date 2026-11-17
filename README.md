# Wedding Website

A self-hosted wedding website with a visual editor, interchangeable layouts and
colour palettes, and private party-based RSVPs.

**Status:** application scaffold. Compose serves an unconfigured placeholder page;
content editing and RSVPs are not implemented yet. Delivery is tracked in the
[GitHub project](https://github.com/users/jordanstevens1002/projects/3)
and the [ordered roadmap](docs/roadmap.md).

## Planned experience

- Public wedding information with editorial, minimal and botanical layouts.
- Click-to-edit text and photos, section controls, palette previews and private drafts.
- Explicit publication and recoverable website revisions.
- One shared editor account for content, invitations and reporting.
- A party code and password for each invitation, with named guests and assigned plus-one slots.
- Per-event invitations and deadlines, configurable questions and versioned responses.
- Browser-managed guest lists and CSV exports.

Real text, photos, credentials, guest records and answers belong in persistent
deployment storage. This public repository and its container images must contain
only application code and clearly fictional examples. Keeping content out of Git
does not make published wedding pages private: anyone can view the public website.

The planned stack is React/TypeScript, Django REST Framework, PostgreSQL and Docker
Compose behind an existing HTTPS proxy. See the [design](docs/design.md),
[contribution workflow](CONTRIBUTING.md) and [security policy](SECURITY.md).

## Repository checks

Use Node.js 24; no package installation is needed for these initial checks:

```sh
node --test scripts/*.test.mjs
node scripts/check-repository.mjs
node scripts/pr-policy.mjs --diff develop HEAD
```

Feature PRs target `develop`; reviewed releases promote `develop` to `main`.
The maintainer reviews and merges one feature PR before dependent work begins.

## Run the scaffold

Copy `.env.example` to `.env` and fill in two independent random values for
`DJANGO_SECRET_KEY` and `POSTGRES_PASSWORD`. Generate each locally with
`python3 -c 'import secrets; print(secrets.token_urlsafe(48))'`.

```sh
docker compose up --build --detach --wait
curl http://127.0.0.1:8080/api/health/ready/
docker compose down
```

Open `http://127.0.0.1:8080`. Only the web gateway publishes a port, bound to localhost
by default. Add your public hostname to `DJANGO_ALLOWED_HOSTS` before using your
existing HTTPS proxy. PostgreSQL and media live in named volumes; `down` retains
them. `down --volumes` deletes them and must not be used on a real deployment.
Open `/editor/` for login, account settings and the editor navigation shell. Website
content and invitation controls follow in later issues. See
[editor access](docs/editor-access.md) for private account setup, recovery and HTTPS
configuration.

For build/test commands and API generation, see [development](docs/development.md).
The [content API](docs/content-api.md) stores validated, versioned private drafts in
the deployment; browser content editing and publication follow in later issues.
The [media API](docs/media-api.md) processes uploads and serves only authorised image
variants from the private media volume. The browser image library follows next.

Licensed under [GPL-3.0](LICENSE).
