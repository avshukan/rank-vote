# Changelog

## v0.1.0 — 2026-09-19

- Ranked polls, full ballots and Borda results, with anonymous write limits.
- Separate production Compose, PostgreSQL bootstrap, exact-SHA deploy and
  application rollback tooling, Caddy route and operator verification procedures.
- First production release, deployed to `https://rankvote.avshukan.com` from
  `7021f3137b597119e39ca13e6a86275da58b28e1` and tagged as annotated `v0.1.0`
  after public smoke verification. The #28 drill then restored an offsite dump
  of its database into clean PostgreSQL and recovered the smoke poll.
