# Contributing

## Start with an issue

Search existing issues and PRs before creating work. An implementation issue must
describe the outcome, acceptance criteria, dependencies and manual review method.
The [project](https://github.com/users/jordanstevens1002/projects/3) is the source of
delivery status; issues hold requirements and discussion. See the
[roadmap](docs/roadmap.md) for the agreed order.

Never put real wedding content, guest names, photos, invitations, passwords,
responses, exports, backups or deployment secrets in commits, issues, PR examples
or CI artifacts. Use clearly fictional fixtures.

## Branches and review

1. Start from the latest `develop` after the preceding PR is merged.
2. Create `feat/<issue>-description`, `fix/<issue>-description` or an equivalent
   Conventional Commit type branch. External contributors use a fork.
3. Implement one coherent issue with relevant tests and user/operator documentation.
4. Run the applicable checks and personally inspect the diff, including new files.
5. Open a ready-for-review PR against `develop` using the PR template. Include
   `Refs #123` in its body and identify any deferred acceptance criteria.
6. Keep one implementation PR open at a time. The maintainer reviews and merges it
   before the next slice begins. Agents must not merge their own work.

Use Conventional Commits for commit messages and PR titles:
`type(optional-scope): description`. Types: feat, fix, docs, test, refactor, build,
ci, chore, perf, revert. Mark incompatible changes with `!` and describe the impact.
Feature PRs are squash-merged into `develop`; never rewrite long-lived branch history.
No independent reviewer approval rule is imposed on this single-maintainer repo.

## Review size

Target 750–1,000 handwritten additions plus deletions, allowing room for review
corrections. Smaller coherent changes are welcome; do not pad a diff to reach a target.
Tests, migrations, documentation and infrastructure count as handwritten changes.
Report dependency lockfiles, generated API types and vendored code separately.

`node scripts/pr-policy.mjs --diff develop HEAD` reports the counts. Above 1,000
handwritten lines, explain the cohesive exception under `Size exception:` in the PR
body. Above 1,500, split the work or obtain explicit maintainer agreement before
submitting. The automated check requests an explanation above 1,000; the 1,500-line
agreement is a human review requirement, not an automated approval.
Release promotion PRs aggregate reviewed changes and are size-exempt.

## Checks and evidence

Run the commands in the README. The initial checks validate tracked paths, basic
text hygiene and relative Markdown links; they are not a secret scanner or a
substitute for reviewing actual content. PR checks validate the target branch,
title, linked issue reference and size explanation. Application checks arrive with
the application bootstrap issue.

Include exact commands, results and manual review steps in each PR. Behavioural
changes need relevant automated tests; documentation edits do not require invented
tests. Use Australian English where practical. AI-assisted contributors remain
responsible for every submitted change.

## Release and project status

- Backlog: planned work with unmet prerequisites.
- Ready: refined work whose prerequisites have merged.
- In progress: active implementation.
- In review: a ready PR is awaiting maintainer review.
- Merged to develop: reviewed changes are integrated but not released.
- Done: delivered to `main` through the reviewed release PR.

Open release PRs from `develop` to `main`, with a title such as
`chore(release): prepare v1.0.0` and `Closes #123` entries for delivered issues.
Merge releases with a normal merge commit, preserving ancestry. Tag the resulting
`main` commit and publish matching release notes. Released migrations are immutable;
add new migrations instead. Production deployment remains an explicit operator step.

Update project status at each handoff; labels describe work type/area, not status.
Keep an issue open after its feature PR merges; the release PR closes it on `main`.
Contributions retain the repository's GPL licence. Report vulnerabilities according
to [SECURITY.md](SECURITY.md).
