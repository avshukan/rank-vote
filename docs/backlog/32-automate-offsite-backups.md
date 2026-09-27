# ID-32 Automate offsite backups

Temporary design context. `State = Design`: no technical decision for ID-32 has
been confirmed yet. Once the owner decisions below are made, the criteria move
to `docs/acceptance-criteria.md`, durable decisions to permanent documentation,
and this file is deleted.

## Confirmed from existing docs

Only what `main` already records:

- Automated scheduled logical dumps sent to object storage are Stage 2 of the
  staged backup plan and remain ID-32 (`docs/10-storage.md`,
  `docs/06-decisions.md`).
- The object-storage provider is independent of DigitalOcean. The offsite copy
  must preserve a recovery path after complete loss of the VPS, the
  DigitalOcean account or DigitalOcean infrastructure (`docs/06-decisions.md`,
  `docs/10-storage.md`).
- Backups are logical `pg_dump` / `pg_restore`, not a copy of the live Docker
  volume; the volume is storage, not backup (`docs/10-storage.md`).
- Stage 2 must define: backup tool and format; schedule and RPO; retention;
  encryption and access control; failed-backup monitoring/alerting;
  restore-test cadence and RTO (`docs/10-storage.md`).
- Failed-backup monitoring is defined in ID-32 (`docs/06-decisions.md`).
- Managed PostgreSQL is Stage 3; independent backups remain required then
  (`docs/10-storage.md`, `docs/06-decisions.md`).
- ID-28 proved the manual path once: an online `pg_dump -Fc`, a SHA-256-verified
  copy outside DigitalOcean, a clean PostgreSQL 17 restore and an API-level
  recovery check (`docs/10-storage.md` Stage 1, `docs/acceptance-criteria.md`
  #28). This records what was done manually, not a Stage 2 decision.

## Open owner decisions

1. Object-storage provider and account
2. Encryption, key custody and access control
3. Schedule (RPO) and retention
4. Failure notification
5. Restore-test cadence and RTO
6. Backup tool and format

## Proposed baseline (unconfirmed)

**These are candidates for the design loop, not accepted decisions.** They come
from the readiness analysis. None of them is settled, implemented against, or
cited as decided until the owner confirms it.

### Candidate answers to the open decisions

- Provider: Backblaze B2 (free first 10 GB, per-key capabilities, lifecycle
  rules). Assumed requirements: S3-compatible API, an access key that can write
  but not delete, provider-side lifecycle expiration. Alternative: AWS S3 with a
  `PutObject`-only policy, lifecycle and versioning. Cloudflare R2 only if a
  token can write without delete.
- Encryption: client-side `age` on the VPS with only the public key there; the
  owner keeps the private key in two places. Losing it makes every backup
  useless. Alternative: provider-side encryption only.
- Schedule and retention: daily (RPO ≤ 24 h); 30 days via a bucket lifecycle
  rule, so the VPS key never deletes and the script has no retention logic.
- Failure notification: an external dead-man's switch such as Healthchecks.io,
  pinged on success and failure. Alternative: no alerts and a manual weekly
  bucket check, which lets the lifecycle rule silently expire every copy if
  backups stop.
- Restore tests and RTO: a manual restore drill quarterly and after any change
  to the backup tooling; RTO is a manual owner restore within a day.
- Tool and format: `pg_dump -Fc` through `docker exec` in the running production
  `postgres` container, as in ID-28; restore with
  `pg_restore --no-owner --no-acl --exit-on-error`; SHA-256 and
  `pg_restore --list` before upload.

### Implementation assumptions

- Runs on the VPS host from a systemd timer with `Persistent=true`. Reasoning:
  `rank-vote-prod-db` is `internal: true`, so a Compose sidecar has no egress;
  GitHub Actions would need a production SSH key; pulling from the owner's
  machine depends on it being switched on.
- A `make prod-backup` command in `scripts/production/`, following the existing
  Python standard-library tooling; systemd service and timer units in
  `deploy/`.
- Bucket credentials in a separate root-only `/etc/rank-vote/backup.env`,
  because `validate_config` accepts exactly the existing `prod.env` keys and
  that file also feeds Compose.
- The uploader runs as a pinned image through `docker run --rm` (e.g. rclone);
  nothing else is installed on the host.
- The backup takes the production lock without waiting; a run during a deploy
  fails and alerts, and the next run retries.
- Recovery oracle: the smoke poll recorded in `deploy-state/current.env`, as in
  ID-28.
- Activation is an ordinary `make prod-deploy` of the merged SHA — the first
  redeploy since `v0.1.0`.

### Scope boundaries

- In: the backup command (dump, verify, encrypt, upload, notify, no secrets in
  output); systemd units; a runbook for installation and restore from the
  bucket; unit tests plus a `prod-smoke` round trip against disposable
  PostgreSQL; docs.
- Out: automated restore tests; general monitoring (ID-33); PITR/WAL and
  replication; GFS rotation; a second provider; backing up `prod.env`,
  `deploy-state` or Caddy.

### Verification before Done

Done requires owner-operated production evidence, following the ID-28 and ID-29
precedent:

1. Timer enabled; at least one timer-started run uploaded an object and the
   notification reports success
2. Restore from the bucket outside DigitalOcean: download, decrypt, match
   SHA-256, restore into clean PostgreSQL 17, and the API at the deployed SHA
   returns the smoke poll with Borda scores 2/1/0
3. A forced failure raises an alert
4. The VPS key cannot delete an object; the lifecycle rule is configured
