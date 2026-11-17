# Wedding Website

A self-hosted wedding website with a visual editor, interchangeable layouts and
colour palettes, and private party-based RSVPs.

**Status:** repository setup. The website and Docker application are not implemented
yet. Delivery is tracked in the [GitHub project](https://github.com/users/jordanstevens1002/projects/3)
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

Licensed under [GPL-3.0](LICENSE).
