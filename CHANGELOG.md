# Changelog

## v0.2.0 — 2026-10-13

<!-- release-prep base: ababaf0f00523216553abd0a8183ce7b9ba11964 -->

- Added a public Borda score breakdown with per-place points, ballot counts and
  subtotals for each option.
- Added recommend-only issue triage, accepted-item backlog promotion and the
  backlog-sweep workflow.
- Added reviewed tag-triggered production releases with exact-SHA validation,
  owner approval and automated verification, plus isolated release-prep CI tests.
- Completed and documented the manual offsite backup/restore proof and prepared
  automated offsite backups for implementation.

## v0.1.0 — 2026-09-19

- Ranked polls, full ballots and Borda results, with anonymous write limits.
- Separate production Compose, PostgreSQL bootstrap, exact-SHA deploy and
  application rollback tooling, Caddy route and operator verification procedures.
- First production release, deployed to `https://rankvote.avshukan.com` from
  `7021f3137b597119e39ca13e6a86275da58b28e1` and tagged as annotated `v0.1.0`
  after public smoke verification. The #28 drill then restored an offsite dump
  of its database into clean PostgreSQL and recovered the smoke poll.
