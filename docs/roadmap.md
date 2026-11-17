# Delivery roadmap

The [GitHub project](https://github.com/users/jordanstevens1002/projects/3) tracks
live status. Issues define requirements and acceptance criteria. Implement the
following slices in order, with one PR open at a time; wait for the maintainer to
merge the preceding PR before starting its successor.

Every item belongs to v1.0.0. Keep issues open after merging to develop; release
promotion to main closes them. See [CONTRIBUTING.md](../CONTRIBUTING.md).

| Order | Issue and single-PR outcome | Workstream |
| --- | --- | --- |
| 1 | [#1 — chore(repo): establish contribution and review workflow](https://github.com/jordanstevens1002/wedding_page/issues/1) | Foundation |
| 2 | [#2 — build(app): bootstrap React Django and Docker Compose](https://github.com/jordanstevens1002/wedding_page/issues/2) | Foundation |
| 3 | [#3 — feat(auth): secure editor sessions and credential recovery](https://github.com/jordanstevens1002/wedding_page/issues/3) | Foundation |
| 4 | [#4 — feat(editor): add login and editor navigation](https://github.com/jordanstevens1002/wedding_page/issues/4) | Foundation |
| 5 | [#5 — feat(content): persist runtime website drafts](https://github.com/jordanstevens1002/wedding_page/issues/5) | Content |
| 6 | [#6 — feat(media): process and protect uploaded images](https://github.com/jordanstevens1002/wedding_page/issues/6) | Content |
| 7 | [#7 — feat(media): add editor image library and controls](https://github.com/jordanstevens1002/wedding_page/issues/7) | Content |
| 8 | [#8 — feat(site): render editorial layout and information sections](https://github.com/jordanstevens1002/wedding_page/issues/8) | Design |
| 9 | [#9 — feat(editor): edit website content in place](https://github.com/jordanstevens1002/wedding_page/issues/9) | Content |
| 10 | [#10 — feat(content): publish and restore website revisions](https://github.com/jordanstevens1002/wedding_page/issues/10) | Content |
| 11 | [#11 — feat(theme): preview saved palettes and custom colours](https://github.com/jordanstevens1002/wedding_page/issues/11) | Design |
| 12 | [#12 — feat(layout): add modern minimal wedding layout](https://github.com/jordanstevens1002/wedding_page/issues/12) | Design |
| 13 | [#13 — feat(layout): add botanical wedding layout](https://github.com/jordanstevens1002/wedding_page/issues/13) | Design |
| 14 | [#14 — feat(invitations): model parties guests and credentials](https://github.com/jordanstevens1002/wedding_page/issues/14) | Invitations |
| 15 | [#15 — feat(invitations): manage parties in browser forms](https://github.com/jordanstevens1002/wedding_page/issues/15) | Invitations |
| 16 | [#16 — feat(rsvp): authenticate and isolate invited parties](https://github.com/jordanstevens1002/wedding_page/issues/16) | Invitations |
| 17 | [#17 — feat(events): configure event invitations and deadlines](https://github.com/jordanstevens1002/wedding_page/issues/17) | RSVP |
| 18 | [#18 — feat(events): add event and invitation editor](https://github.com/jordanstevens1002/wedding_page/issues/18) | RSVP |
| 19 | [#19 — feat(forms): model versioned RSVP questions and snapshots](https://github.com/jordanstevens1002/wedding_page/issues/19) | RSVP |
| 20 | [#20 — feat(forms): build RSVP questions in the editor](https://github.com/jordanstevens1002/wedding_page/issues/20) | RSVP |
| 21 | [#21 — feat(forms): publish compare and restore RSVP versions](https://github.com/jordanstevens1002/wedding_page/issues/21) | RSVP |
| 22 | [#22 — feat(rsvp): submit transactional versioned responses](https://github.com/jordanstevens1002/wedding_page/issues/22) | RSVP |
| 23 | [#23 — feat(rsvp): edit guest attendance and plus-one names](https://github.com/jordanstevens1002/wedding_page/issues/23) | RSVP |
| 24 | [#24 — feat(rsvp): render questions and confirm submissions](https://github.com/jordanstevens1002/wedding_page/issues/24) | RSVP |
| 25 | [#25 — feat(rsvp): revise responses and review changed forms](https://github.com/jordanstevens1002/wedding_page/issues/25) | RSVP |
| 26 | [#26 — feat(reports): query attendance and export safe CSV files](https://github.com/jordanstevens1002/wedding_page/issues/26) | RSVP |
| 27 | [#27 — feat(reports): add editor attendance dashboard](https://github.com/jordanstevens1002/wedding_page/issues/27) | RSVP |
| 28 | [#28 — feat(rsvp): correct responses and inspect audit history](https://github.com/jordanstevens1002/wedding_page/issues/28) | RSVP |
| 29 | [#29 — feat(ops): back up and restore wedding runtime data](https://github.com/jordanstevens1002/wedding_page/issues/29) | Operations |
| 30 | [#30 — build(release): finalise production images and upgrades](https://github.com/jordanstevens1002/wedding_page/issues/30) | Operations |
| 31 | [#31 — test(acceptance): verify v1 journeys and editor guide](https://github.com/jordanstevens1002/wedding_page/issues/31) | Operations |

The Future enhancements milestone holds ideas outside the agreed first release.
CSV import, automatic emails, arbitrary page building, complex question branching,
guest photo uploads and separate editor roles are outside v1.
