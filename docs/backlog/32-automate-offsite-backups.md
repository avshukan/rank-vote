# ID-32 Automate offsite backups

Temporary readiness context. `State = Design`: the three owner decisions below
are deliberately left open. Once they are answered, the criteria move to
`docs/acceptance-criteria.md`, durable decisions to `docs/10-storage.md`
(Stage 2), `docs/06-decisions.md` and `docs/production.md`, and this file is
deleted.

## Open decisions

### 1. Object-storage provider

Requirements: outside DigitalOcean with its own account (so not DO Spaces),
S3-compatible API, an access key that can write but not delete, and
provider-side lifecycle expiration.

- Recommended: Backblaze B2 — free first 10 GB, per-key capabilities,
  lifecycle rules
- Alternative: AWS S3 — `PutObject`-only IAM policy plus lifecycle; enable
  versioning so an overwrite cannot destroy an object
- Cloudflare R2 only if a token can write without delete

### 2. Encryption and key custody

- Recommended: client-side `age` encryption on the VPS. Only the public key is
  on the VPS; the owner keeps the private key in two places (password manager
  and offline). Neither a leaked bucket key nor the provider can read dumps.
  Losing the private key makes every backup useless, so the restore check must
  decrypt a real object. Adds `age` to the host prerequisites.
- Simpler alternative: provider-side encryption only. Acceptable for public
  polls without accounts or personal data, but anyone with bucket read access
  can read the dumps.

### 3. Failure visibility

- Recommended: an external dead-man's switch (e.g. Healthchecks.io free tier).
  The backup pings success or failure; a missing ping alerts the owner. This
  catches a failing script, a timer that never fires and a dead VPS. It belongs
  to ID-32, not ID-33: `docs/06-decisions.md` assigns failed-backup monitoring
  here.
- Alternative: no alerts, a manual weekly bucket check. If backups stop, the
  lifecycle rule silently expires every copy after the retention period.

## Already settled

- Logical `pg_dump -Fc` taken online through the running production `postgres`
  container, restored with `pg_restore --no-owner --no-acl --exit-on-error` —
  proven by ID-28.
- Runs on the VPS host from a systemd timer. `rank-vote-prod-db` is
  `internal: true`, so a Compose sidecar has no egress; GitHub Actions would
  need a production SSH key; pulling from the owner's machine depends on it
  being switched on.
- Bucket credentials live in a separate root-only `/etc/rank-vote/backup.env`:
  `validate_config` accepts exactly the existing `prod.env` keys, and that file
  also feeds Compose.
- The recovery oracle is the smoke poll recorded in `deploy-state/current.env`,
  as in ID-28.
- Done requires owner-operated runtime evidence, not only merged code (ID-28 and
  ID-29 precedent).

## Defaults (judgment calls)

- Daily run with `Persistent=true` (RPO ≤ 24 h)
- 30-day retention via a bucket lifecycle rule; the VPS key never deletes, so
  the script has no retention logic
- SHA-256 and `pg_restore --list` before upload
- The uploader runs as a pinned image through `docker run --rm` (e.g. rclone);
  nothing else is installed on the host
- RTO: manual owner restore within a day, following the runbook
- Manual restore drill quarterly and after any change to the backup tooling
- The backup takes the production lock without waiting; a run during a deploy
  fails and alerts, and the next day's run retries

## Scope

In: `make prod-backup` (dump → verify → encrypt → upload → heartbeat, no secrets
in output); systemd service and timer in `deploy/`; runbook for installation and
restore from the bucket; unit tests plus a `prod-smoke` round trip against
disposable PostgreSQL; docs.

Out: automated restore tests (a future item if needed); general monitoring →
ID-33; PITR/WAL, replication, managed PostgreSQL (Stage 3); GFS rotation; a
second provider; backing up `prod.env`, `deploy-state` or Caddy.

Activation is an ordinary `make prod-deploy` of the merged SHA — the first
redeploy since `v0.1.0`.

## Runtime verification (owner-operated)

1. Timer enabled; at least one timer-started run uploaded an object; the
   heartbeat reports success
2. Restore from the bucket outside DigitalOcean: download, decrypt, match
   SHA-256, restore into clean PostgreSQL 17, and the API at the deployed SHA
   returns the smoke poll with Borda scores 2/1/0
3. A forced failure raises an alert
4. The VPS key cannot delete an object; the lifecycle rule is configured
