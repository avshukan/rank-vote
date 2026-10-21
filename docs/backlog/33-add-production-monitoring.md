# ID-33 Add production monitoring

Temporary design context. `State = Design`: the owner has settled the scope,
the readiness contract and the completion evidence, but not which service
checks production from outside and sends the alerts. Once that is chosen,
rerun `task-readiness`; durable decisions then move to permanent
documentation and this file is deleted.

## Confirmed facts

- `GET /api/v1/health` reports process liveness only and never queries
  PostgreSQL (#27). The API Docker healthcheck in `docker-compose.prod.yml`,
  the local and production smoke checks and release verification
  (`scripts/production/probe.py`) depend on it.
- Production has no monitoring, alerting or error tracking
  (`docs/08-known-limitations.md`). The API logs through Nest's default
  logger; the web app reports its errors nowhere.
- `deploy/Caddyfile.rank-vote` routes every `/api/v1` path to the API, so a new
  API route is public unless the live Caddyfile changes, which is an
  owner-operated step. #31 limits only the two write routes.
- The public IPv4 `165.22.91.190` is a local address of the VPS
  (`scripts/production/runtime.py`). A check run on the VPS against the public
  origin never leaves the host, so it cannot prove reachability from the
  internet.
- `make prod-smoke` already stops and restarts PostgreSQL in its local
  production model (`scripts/production/container_smoke.py`).
- Release images are built on the VPS, and the production tooling never prunes
  them (`scripts/production/release.py`). Preflight refuses a release below
  5 GiB of free Docker disk (`scripts/production/runtime.py`); nothing warns
  earlier.
- ID-32 (`Ready`, not implemented) brings Healthchecks.io with email alerts for
  backups. Healthchecks.io is passive: it waits for pings and does not probe
  websites.
- Free services as documented on 2026-10-21, untried here:
  - DigitalOcean Uptime: one check, meaning one monitored address, is free
    every month per account; each further check costs $1 a month. A check
    probes every minute from up to four regions, over IPv4 only. Alerts cover
    downtime, latency and certificate expiry and go by email or Slack; downtime
    and latency alerts are followed by a notification on recovery.
  - UptimeRobot Free: 50 monitors, one address each, with a 5-minute interval.
    The Terms allow any use, including commercial. Certificate and domain
    expiry monitoring is excluded from Free. The pricing page lists five
    integrations for Free (Google Chat, Discord, Pushover, Pushbullet, Splunk)
    and no extra notify seats, and does not spell out email alerts for the
    account owner.
  - DigitalOcean Monitoring: free; memory and disk metrics need the metrics
    agent on the host; alert policies notify by email or Slack.
  - Let's Encrypt stopped sending certificate-expiry emails on 2025-06-04.
- A certificate-expiry check covers one domain's certificate. Other projects
  behind the same Caddy have their own certificates and expiry dates.

## Accepted by the owner

Decided in the ID-33 readiness on 2026-10-21:

- ID-33 covers three directions: dependency-aware readiness; external uptime
  checks with email alerts; disk and memory alerts for the VPS through
  DigitalOcean Monitoring, set up by the owner without repository code.
- Error tracking leaves ID-33 for Issue #121, through triage.
- Rate-limiter metrics and alerting leave ID-33, with no backlog item until a
  need appears.
- Readiness contract: a new public `GET /api/v1/health/ready` returns `200`
  when PostgreSQL answers and `503` without details otherwise.
  `/api/v1/health` and the Docker healthchecks stay unchanged.
- Only free services. Checking once an hour is enough for this hobby project,
  and downtime is tolerated, including a longer controlled stop for the
  evidence.
- No scheduled GitHub Actions checks: in a public repository GitHub disables a
  schedule after 60 days without activity, so the checks would stop silently.
  ID-32 rejected them for the same reason (`docs/06-decisions.md`).
- `Done` requires production evidence with a short controlled downtime: the API
  is stopped in a quiet window, and the alert must actually arrive.

## Open owner decision

1. Which free service checks production from outside and sends the alerts:
   - DigitalOcean Uptime: its one free check, with downtime and
     certificate-expiry alerts; other addresses cost $1 a month each, and the
     monitor runs at the host's provider.
   - UptimeRobot Free: several addresses, including other pet projects, for
     free and independent of DigitalOcean; a new account, no
     certificate-expiry alert, and email delivery to be confirmed at sign-up.
   - Both, as the owner is considering: UptimeRobot for the availability of
     the pet projects, DigitalOcean for the certificate-expiry alert.

## Proposals (not accepted)

- Alert after 10 minutes of downtime, so a release restart stays silent, and
  14 days before a certificate expires.
- DigitalOcean's free check targets `/api/v1/health/ready`, which crosses DNS,
  the network, Caddy and TLS, the API and PostgreSQL.
- Readiness runs a trivial PostgreSQL query under a short timeout; the query,
  the timeout and the controller layout are implementation choices.
- Evidence: the API stays stopped longer than the downtime threshold, and both
  the alert and the recovery notification arrive. `make prod-smoke` proves the
  `503` path locally with PostgreSQL stopped. A DigitalOcean Monitoring alert
  is proven by briefly setting its threshold below current usage.
- A probe on the VPS reporting to Healthchecks.io was dropped from the options:
  it cannot prove reachability from the internet and would wait for ID-32.

## Rerunning readiness

Rerun `task-readiness` once the owner chooses the service. It then writes the
acceptance criteria, moves the decisions above into `docs/09-api-design.md`,
`docs/06-decisions.md` and `docs/production.md`, and deletes this file.
