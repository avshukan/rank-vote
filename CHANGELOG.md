# Changelog

## v0.2.0 — 2026-10-13

<!-- release-prep base: ababaf0f00523216553abd0a8183ce7b9ba11964 -->

- docs: specify manual offsite backup readiness (#54)
- docs: complete manual offsite backup (#55)
- docs: evolve backlog for post-MVP work (#56)
- docs: record ID-32 readiness as Design (#57)
- docs: specify ID-32 automated offsite backups as Ready (#58)
- chore: add recommend-only issue triage workflow (#59)
- Clarify issue-triage acceptance action via `triage: accepted` label (#61)
- chore: automate backlog promotion from accepted triage (#63)
- backlog: promote #60 — Export results as CSV (#64)
- backlog: promote #62 — Add short poll links (#65)
- chore: make triage length limits a hard, checked output constraint (#66)
- chore: drop ignore entries for the retired prompt bundler (#67)
- docs: specify ID-6 mobile responsive layout as Ready (#68)
- docs: specify ID-19 score breakdown as Ready (#70)
- backlog: promote #69 — Breakdown hover preview (#71)
- backlog: promote #72 — Add backlog-sweep skill (#73)
- docs: specify ID-39 backlog sweep process as Ready (#74)
- docs: route readiness and slice follow-ups through Issue triage (#75)
- feat: add backlog sweep process (ID-39) (#76)
- docs: apply backlog sweep 2026-10-06 (#79)
- backlog: promote #78 — Record v0.1.0 evidence (#80)
- docs: clarify Discard evidence and owner close in triage (#82)
- chore: temporarily shorten the backlog sweep periodic check for a scheduled test (#83)
- docs: specify ID-40 v0.1.0 evidence record as Ready (#84)
- docs: record v0.1.0 evidence (ID-40) (#85)
- feat: explain score calculation (ID-19) (#86)
- backlog: promote #87 — Fix backlog lint fixture (#89)
- backlog: promote #88 — Automate tagged releases (#90)
- docs: update ID-38 backlog note (#91)
- docs: specify ID-42 tagged releases as Ready (#93)
- feat: automate tagged releases (ID-42) (#94)
- Fix release-prep CI by isolating release-test changelog baseline (#96)

## v0.1.0 — 2026-09-19

- Ranked polls, full ballots and Borda results, with anonymous write limits.
- Separate production Compose, PostgreSQL bootstrap, exact-SHA deploy and
  application rollback tooling, Caddy route and operator verification procedures.
- First production release, deployed to `https://rankvote.avshukan.com` from
  `7021f3137b597119e39ca13e6a86275da58b28e1` and tagged as annotated `v0.1.0`
  after public smoke verification. The #28 drill then restored an offsite dump
  of its database into clean PostgreSQL and recovered the smoke poll.
