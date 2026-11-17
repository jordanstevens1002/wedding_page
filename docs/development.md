# Application development

Use Node.js 24 and Docker Compose. Runtime dependencies are locked in
`backend/requirements.lock` and `frontend/package-lock.json`; backend test dependencies
have a separate `backend/dev/requirements.lock`. Docker installs Python packages
with hash verification. Container bases are pinned to immutable digests.

## Complete verification

```sh
node --test scripts/*.test.mjs
node scripts/check-repository.mjs
sh scripts/check-application.sh
git diff --exit-code -- backend/openapi.json frontend/src/api/generated/schema.d.ts
```

The application check builds a uniquely named disposable Compose project using
fictional credentials, an ephemeral localhost port and fresh volumes. It validates
migrations, PostgreSQL-backed tests, gateway routing, frontend tests/builds, schema
generation and database/media/private-draft persistence after container recreation.
The opt-in fictional draft remains absent from public responses. Chromium then
exercises editor login, navigation, password change, logout and revoked-session handling
against the real gateway/backend, including a mobile viewport. The disposable stack
uses explicit HTTP development cookies for that browser phase only. Its exit trap
removes only that test project's containers and volumes. It never loads `.env`.
Do not interrupt it with SIGKILL, which prevents cleanup; remove only the test
project reported in its output if interrupted that way.

The normal runtime contains no pytest dependencies. Backend test images are built
from the explicit `test` Docker stage. Both application images run as non-root users.
The separate browser-test image pins Playwright and its matching browser image;
neither is included in production images. Build-context allowlists keep environment files, runtime data and local tooling out
of image layers. Media is not publicly served in this scaffold.

## Local frontend

Start Compose using the README, then run:

```sh
npm --prefix frontend ci
npm --prefix frontend run dev
```

Vite binds localhost; `/api` requests proxy to the local gateway at port 8080.
Run `npm --prefix frontend test` and `npm --prefix frontend run build` for focused
frontend checks. The initial page deliberately contains no invented wedding details.

## API contract

`/api/health/live/` checks the process without touching the database.
`/api/health/ready/` returns 200 only when PostgreSQL and the migrated session table
are accessible; failures return a generic 503 without connection details.
`/api/schema/?format=json` exposes the public OpenAPI contract.

After changing API serializers/routes, regenerate the checked-in schema and types:

```sh
docker compose exec -T app python manage.py spectacular --format openapi-json --validate --fail-on-warn > backend/openapi.json
npm --prefix frontend run api:generate
```

CI regenerates both artifacts and rejects drift. Schema JSON and generated TypeScript
are reported separately from handwritten changes; migrations and tests still count.
Application APIs default to authenticated session access. Only the health and schema
views are explicitly public. The [editor authentication API](editor-access.md)
requires the configured shared editor; obtaining a CSRF token and logging in are
public entry points, with explicit CSRF and login throttling protections.

## Dependency updates

Run from the repository root and commit both locks after verification:

```sh
uv pip compile backend/pyproject.toml --python-version 3.13 --generate-hashes --output-file backend/requirements.lock
uv pip compile backend/pyproject.toml --python-version 3.13 --generate-hashes --extra test --constraint backend/requirements.lock --output-file backend/dev/requirements.lock
```

For JavaScript, install exact supported package versions and commit the resulting
lockfile. Update base-image digests deliberately and rerun complete verification.
