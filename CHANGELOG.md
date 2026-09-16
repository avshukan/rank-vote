# Changelog

## Unreleased — first production release preparation (#29)

- Ranked polls, full ballots and Borda results, with anonymous write limits.
- Separate production Compose, PostgreSQL bootstrap, exact-SHA deploy and
  application rollback tooling, Caddy route and operator verification procedures.
- Production is **not deployed**. No release tag exists. Annotated `v0.1.0` is
  created only after the merged, CI-green release passes public verification.
