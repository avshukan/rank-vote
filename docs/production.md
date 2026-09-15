# Production operator runbook (#29)

**Repository implementation only: production is not live.** #29 remains Todo.
Run the host-changing commands below only after owner review/merge of the
implementation PR and successful `checks` **and** `containers` on that exact
`main` SHA. Never deploy the PR branch. No backup/recovery has been proven;
#28 begins immediately after the verified first deployment and `v0.1.0`.

## Fixed contract and prerequisites

| Item                          | Value                                                      |
| ----------------------------- | ---------------------------------------------------------- |
| SSH / host / user             | `pet-projects-1` / `165.22.91.190` / `root`                |
| Checkout / Compose project    | `/opt/apps/rank-vote` / `rank-vote-prod`                   |
| Compose definition            | `docker-compose.prod.yml`                                  |
| Origin / API                  | `https://rank-vote.avshukan.com` / same origin + `/api/v1` |
| Independent Caddy project     | `/opt/infrastructure/caddy`                                |
| Configuration                 | `/etc/rank-vote/prod.env`                                  |
| PostgreSQL 17 database / role | `rank_vote_prod` / `rank_vote_app`                         |
| External data volume          | `rank_vote_prod_postgres_data`                             |
| Verified release state        | `deploy-state/current.env`, `deploy-state/previous.env`    |

Ubuntu needs Python 3.9+, Git, Make, `tar`, Docker Engine 24+, Compose 2.20+,
`gh` authenticated for read-only repository/Actions/rules access, `ip`, `ss`,
`iptables` and `ip6tables`. Node/pnpm run inside build images; no host Node
installation is needed. Sequential builds require at least 5 GiB free Docker
disk and 1 GiB available RAM plus swap; inspect actual headroom for the shared
VPS before proceeding. These are refusal thresholds, not resource reservations.

Production commands use the host-local Docker daemon, verify the Ubuntu host's
IPv4 and fixed checkout, and reject remote Docker contexts. The local
`docker-compose.yml`, `make db-up`, `make stack-up` and `make container-smoke`
retain their development behavior.

### Recorded implementation-phase checks

- Base `main`: `cc65f4c0ed269bdee4f6e50a86fc604b228012ea`; #35 is merged
  (PR #50).
- Read-only GitHub inspection: `protect-main` is active and requires only
  `checks`. **Owner must add `containers` before this implementation PR may
  merge.** Deployment tooling independently refuses unless both are required
  and successful. Do not bypass this prerequisite.
- SSH alias `pet-projects-1` did not resolve in the implementation environment;
  no VPS inspection or mutation took place. The following host audit is
  mandatory before provisioning. No VPS resource/version/DNS result is implied
  by the local smoke tests.

## 1. Read-only audit and exact release checkout

From the owner's machine, verify the existing SSH alias resolves to root on
the intended host. Preserve a private audit outside git:

```bash
ssh -G pet-projects-1
ssh pet-projects-1 'hostname; id; cat /etc/os-release; ip -brief address; docker version; docker compose version; df -h; free -m; docker ps --format "{{.Names}} {{.Ports}}"; docker network ls; ss -lntup; iptables -S; iptables -t nat -S; ip6tables -S; ip6tables -t nat -S'
```

Review the DigitalOcean firewall separately; host firewall output cannot prove
cloud rules. Inventory all existing Caddy sites and record each URL and its
expected response, including any authenticated sites. Inspect Caddy version,
Compose labels, config-file mounts and network membership **without dumping
container environments or secret-bearing Caddy config into shared logs**.
Confirm existing public services, IPv4 and IPv6 addresses, and DNS A/AAAA
records. The A record must resolve directly to `165.22.91.190`; every AAAA
record must identify this host and have the same exposure policy. If IPv6 is
unconfigured, record that fact and ensure there is no stale AAAA record. A CDN
or additional proxy requires a separate trust decision.

After merge, select the full SHA from the successful **push-to-main** CI run
(a PR's synthetic merge SHA is not sufficient). Prepare the fixed checkout:

```bash
cd /opt/apps/rank-vote
git fetch origin main
git switch --detach <full-CI-green-main-sha>
git status --short
```

Provision the checkout initially with `git clone` if absent. Keep repository
contents owned by root. Do not stash or discard unexplained production changes.
The CLI verifies origin, a detached clean HEAD, exact full SHA, ancestry on
fresh `origin/main`, the latest matching CI run and both successful jobs.

## 2. First provisioning: configuration, network, volume

These commands are **first-deployment-only**, after the audit above:

```bash
make prod-config
make prod-preflight BEFORE_PROVISION=1
make prod-provision RELEASE_SHA=<full-CI-green-main-sha>
```

`prod-config` checks source/host before generating two independent 256-bit
random hex passwords directly into the configuration file. It never prints
them and refuses to replace an existing file. `/etc/rank-vote` must be
`root:root 0700`; `prod.env` must be a regular `root:root 0600` file. Both are
outside git and every build context. `deploy/prod.env.example` is a reference
with deliberately invalid placeholders, not a working default.

The literal env format is `KEY=value` without quoting, interpolation, whitespace
or shell commands. Values are never sourced by a shell. If credentials are
changed manually, `DATABASE_URL` must contain the exactly percent-encoded
application password. Do not put credentials in terminal arguments/history.
Changing this file does **not** rotate credentials in an existing database;
credential rotation requires a separately reviewed database operation.

`prod-provision` requires typing the exact volume name, refuses when release
state or that volume already exists, and explicitly creates
`rank_vote_prod_postgres_data`. It creates the dedicated external
`rank-vote-api-proxy` network if absent and requires it to be empty at this
point. It never creates the shared `web` network. If interrupted after resource
creation, inspect the resources and continue the runbook; do not delete/recreate
storage to make provisioning pass. Ordinary deploy/rollback only inspect the
external volume and fail if it is missing. Compose cannot silently substitute
an empty project-derived volume.

### PostgreSQL initialization

The official PostgreSQL 17 entrypoint runs
`docker/postgres/init-production.sql` only for empty PGDATA. The admin identity
`rank_vote_bootstrap` initializes the cluster; SQL reads the app password with
psql `\getenv`, creates `rank_vote_app` with `NOSUPERUSER NOCREATEDB
NOCREATEROLE NOREPLICATION`, and gives it database/public-schema ownership.
API/migrate receive only the app `DATABASE_URL`, never the bootstrap credential.
Only PostgreSQL receives the two bootstrap inputs. There is no test database,
development init script, schema reset or runtime migration in the API entrypoint.

An interrupted bootstrap can leave nonempty but incomplete PGDATA. In that
case PostgreSQL may restart but migrate fails; preserve storage and diagnose the
initialization error. Never reset a volume or retry bootstrap automatically.

## 3. Attach independently managed Caddy

Web joins external `web` as `rank-vote-web`; API joins external
`rank-vote-api-proxy` as `rank-vote-api` and **does not join `web`**. Only Caddy
and the single API may be on the dedicated proxy network. PostgreSQL/migrate/API
share internal `rank-vote-prod-db`. All four application services have no host
ports or host networking.

The owner applies `deploy/caddy-network.override.yml` as an additional Compose
file for the existing Caddy project. Copy it to
`/opt/infrastructure/caddy/rank-vote-network.override.yml`, merge it with the
**existing ordered list of Compose files** found in Caddy's
`com.docker.compose.project.config_files` label, and run `docker compose ...
config --quiet`. Preserve every existing network and configuration file. Record
the full invocation in that project's operator instructions so any future
Caddy recreation also uses the overlay. This project cannot prescribe the
uninspected external project's base filenames.

Attach the already-running Caddy container without stopping or recreating it:

```bash
docker network connect rank-vote-api-proxy <inspected-existing-caddy-container>
```

Do this only once; if already attached, inspect membership instead. Docker
retains attachment across restart; the saved Compose overlay preserves it across
future recreation by Caddy's owner. Ranking Vote deploy/rollback never runs
`compose up`, stop or recreate against the Caddy project.

## 4. Deploy the release

```bash
make prod-preflight
make prod-deploy RELEASE_SHA=<full-CI-green-main-sha>
```

The host-local kernel lock rejects concurrent deploy/provision/rollback and is
automatically released when the process exits, including failure. The lock file
contains no secrets and is never deleted to bypass a running deployment.

Deployment performs these steps:

1. Validate source, both CI jobs, host, networks, external volume and root-only
   config. Render and validate the production model without printing secrets.
   Review the printed network/firewall audit and confirm the host boundary.
2. Build API then web from `git archive` of the exact commit. This excludes
   ignored/untracked files from the build context. Existing full-SHA tags are
   reused and revision-checked, never overwritten. Web receives the explicit
   nonsecret production `VITE_API_URL`. Verify its bundle contains that URL and
   no development API URL. Verify the Prisma CLI runs without network access;
   its schema engine is downloaded during image build.
3. Save the last verified current release as previous, then stop web/API with
   API's explicit 30-second grace period. Leave existing PostgreSQL running;
   start/bootstrap it only if needed on first deployment.
4. Recreate/run migrate **once**, with the exact API image and `prisma migrate
deploy`. Preserve redacted diagnostics in root-only `deploy-state`.
5. On success start one API, wait for health, then start web. Verify health,
   immutable image IDs, migration completion, network membership and one Node
   process. `unless-stopped` governs PostgreSQL/API/web; migrate uses `no`.
6. Pause for first Caddy routing and the external proxy checks below. Restart
   the one API after the probe to clear its test buckets. Perform HTTPS health,
   frontend/bundle, create/fetch/full-ballot/Borda and direct SPA-route smoke.
   Record the smoke poll ID immediately, even if a later step fails.
7. Pause for external browser, existing-site and controlled persistence checks.
   Fetch the recorded poll/results again, verify internal state, then atomically
   write the new `current.env`.

A build failure leaves the running application untouched. A migration failure
leaves web/API stopped and PostgreSQL running, retains the failed migrate
container plus redacted log, and exits. It never retries, resolves migrations,
resets data or starts old code against uncertain schema. Later verification
failure does not promote the candidate: `current.env` remains the last verified
release, which may differ from the running candidate. Inspect before retrying.

### First Caddy routing, while deploy waits

From a second SSH session in the same clean release checkout:

```bash
make prod-caddy
```

The reviewed snippet in `deploy/Caddyfile.rank-vote` routes both exact `/api/v1`
and `/api/v1/*` to `rank-vote-api:3000`, everything else to
`rank-vote-web:80`. Caddy retains TLS/certificate ownership. Its upstream header
rules explicitly replace forwarding identities with the socket peer address and
remove `Forwarded`; there is no CDN or second trusted hop.

`prod-caddy` supports a regular `/opt/infrastructure/caddy/Caddyfile`, mounted
as `/etc/caddy/Caddyfile` or through `/etc/caddy`. It appends the reviewed site
to the entire existing file, refuses duplicate domain/backup, validates both old
and candidate configurations inside the existing Caddy container, saves
`Caddyfile.before-rank-vote`, and performs a graceful reload from stdin. Only
then does it persist the candidate, keeping the inode for single-file bind
mounts. Failure reloads/preserves the previous valid config. Command output that
could contain unrelated Caddy secrets is withheld. Other layouts must be
recorded during read-only preflight and get a reviewed adjustment before apply;
do not guess at imported files or replace the existing configuration.

After reload verify **every** inventoried existing site, using its expected
response, before confirming public verification. If the first release fails,
restore the saved Caddyfile using the inspected Caddy container ID:

```bash
docker exec -i --workdir /etc/caddy <caddy-container> caddy validate --config - --adapter caddyfile < /opt/infrastructure/caddy/Caddyfile.before-rank-vote
docker exec -i --workdir /etc/caddy <caddy-container> caddy reload --config - --adapter caddyfile < /opt/infrastructure/caddy/Caddyfile.before-rank-vote
# Only after successful validation/reload; preserve the bind-mounted inode.
cat /opt/infrastructure/caddy/Caddyfile.before-rank-vote > /opt/infrastructure/caddy/Caddyfile
```

Retain PostgreSQL and its volume. Do not publish a release tag.

## 5. External proxy and client-IP proof

Reserve a quiet maintenance window and a dedicated external test IP. Do not
use an office/NAT address carrying production users. On first deployment all
buckets are fresh; on redeploy a new API process is fresh too. Run:

```bash
python3 -m scripts.production.probe ports <each-public-IPv6-address-if-any>
python3 -m scripts.production.probe proxy
```

The port probe checks the fixed IPv4 plus supplied IPv6 addresses on `3000`
and `5432`. Run it from outside the VPS, and test loopback exposure separately
on the VPS (`127.0.0.1` and `::1`). Confirm only intended host services such as
SSH and Caddy's 80/443 are published. There must be no public route directly to
a container subnet or Docker daemon.

The proxy probe sends seven deliberately invalid create-poll requests, varying
forged `X-Forwarded-For`, `X-Real-IP` and `Forwarded`. The first five must return
400, then 429 with `Retry-After`; no poll is created. **Before resetting API**,
run from a second machine/network with a different public egress IP:

```bash
python3 -m scripts.production.probe peer-check
```

This must return 400. Combined with the inspected Caddy socket-peer header rule
and network boundary, distinct buckets prove Caddy is not collapsing all users
onto its own address, and changing forged headers cannot choose a bucket. A
one-client test alone cannot prove the actual client identity.

Once these pass, type `PROXY VERIFIED <sha>` into the waiting deployment. It
restarts the single API to clear the probe buckets **before** user-flow smoke.
Do not run the proxy probe again after that reset. For standalone later flow
checks use `python3 -m scripts.production.probe flow`; it consumes one create
request and one ballot and prints the poll ID. Every HTTP smoke uses standard
TLS CA/hostname verification, with no insecure bypass.

## 6. Controlled persistence and recovery check

While deploy waits at `PUBLIC VERIFIED`, use the same candidate SHA in a second
SSH session. Define a convenience command that reads the production env file
without sourcing or printing it:

```bash
export RELEASE_SHA=<candidate-full-sha>
prod_compose() {
  docker compose --project-name rank-vote-prod \
    --env-file /etc/rank-vote/prod.env \
    --file /opt/apps/rank-vote/docker-compose.prod.yml "$@"
}
prod_compose stop web api
prod_compose up --detach --no-deps --force-recreate --wait --wait-timeout 180 postgres
prod_compose up --detach --no-deps --force-recreate --wait --wait-timeout 180 api
prod_compose up --detach --no-deps --force-recreate --wait --wait-timeout 180 web
python3 -m scripts.production.probe persist <recorded-smoke-poll-id>
prod_compose ps --all
```

This deliberately exercises recreation of all long-running services with the
same external data volume. No migration is rerun. Confirm migration remains
exited 0 and all long-running services are healthy. Inspect recent private logs
for restart loops/errors without copying credentials into reports.

To prove automatic recovery when PostgreSQL starts later, in the same controlled
window stop PostgreSQL, recreate API with `--no-deps`, bring PostgreSQL back with
`up --detach --no-deps --wait postgres`, then wait for API health and rerun the
read-only `persist` probe. If the Node process fails startup, `unless-stopped`
retries it; the PostgreSQL driver reconnects when the database returns. Local
`prod-smoke` exercises this actual sequence. No readiness endpoint, monitoring
system or custom retry supervisor is added. Do not force a shared-host reboot
for #29; confirm at the next planned reboot.

Open the public frontend and `/poll/<id>/results` in an external browser.
Confirm the 2/1/0 Borda result, valid HTTPS, no mixed content/console errors,
and the existing sites. Then confirm `PUBLIC VERIFIED <sha>`; deploy rechecks
persisted data and internal state before promoting the manifest.

## 7. Release identity and rollback

`deploy-state` is `root:root 0700`, manifests are `0600`. Each contains full SHA,
API/web full-SHA tags, immutable image IDs, production URL, UTC deployment time,
release tag (initially empty), and smoke poll ID. No database URL or credential
is stored. File updates use write/fsync plus same-filesystem atomic rename.
`previous.env` is prepared before downtime so a failed redeploy can restore the
last verified application too; a failed first deployment has no previous release.
Do not prune either saved image. Tags are checked against stored IDs before
rollback; missing or retagged images cause refusal, never a rebuild.

```bash
make prod-rollback
```

Run from the current clean CI-green tooling checkout. The operator must type
`COMPATIBLE <previous-sha>` only after reviewing **all already-applied migrations**
against the previous code. Rollback reads `previous.env`, stops/recreates only
web/API, repeats health and public verification, then records that application
as current. It never builds images, runs migrations, operates PostgreSQL or
rolls data back. If compatibility is uncertain, continue downtime and use a
reviewed forward fix or a separately chosen restore procedure. A first failed
deployment cannot be rolled back to a nonexistent previous application.

## 8. Tag and immediate recovery handoff — after verified deployment only

After owner acceptance of the smoke-verified `current.env`, create/push the
annotated tag on **its recorded SHA**, then attach that tag to the same manifest:

```bash
git tag -a v0.1.0 <deployed-full-sha> -m 'First verified production release'
git push origin v0.1.0
python3 -m scripts.production.cli tag --tag v0.1.0
```

This updates tag metadata without changing recorded image IDs/SHA. Immediately
start #28: offsite logical dump, copy outside VPS/DigitalOcean, restore into a
clean PostgreSQL instance, verify the recorded smoke poll. The volume is storage,
**not backup**. A small later docs PR records the release, dates the changelog,
checks actual host/public AC and moves #29 to Done. It does not delay #28.

## Repository evidence and pending AC

Repository tests cover config/model rejection, exact source/CI checks, missing
volume, locking, manifest transitions, migration failure and rollback refusals.
`make prod-check` renders real Compose with disposable dummy credentials.
`make prod-smoke` uses randomly named local resources, real PostgreSQL bootstrap,
offline migrations, production-URL images, Caddy routes/header probes, a full
vote and recreation/recovery. It never depends on production resources.
`make container-smoke` continues to verify the separate local development stack.

Actual VPS identity/resources, firewall/DNS/IPv6, installed Caddy layout and
existing sites, production secrets/storage, exact merged-SHA build, external
HTTPS/browser/client-IP proof, production persistence, manifests and tag remain
pending deployment. Their AC boxes stay unchecked. The repository-only evidence
does not complete #29 or begin #28.

Reference semantics: [Docker Compose services](https://docs.docker.com/reference/compose-file/services/),
[Caddy CLI validation/reload](https://caddyserver.com/docs/command-line),
[Caddy upstream headers](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy),
[PostgreSQL 17 psql variables](https://www.postgresql.org/docs/17/app-psql.html).
