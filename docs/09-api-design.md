# API Design

## Base URL

```
/api/v1
```

---

## Product Endpoints

### Create poll

```
POST /polls
```

Request body:

```json
{
  "title": "string",
  "options": ["string", "string", "string"]
}
```

Constraints:

- `title` is required, non-empty string
- `options` is an array of 2–10 non-empty strings

Response `201 Created`:

```json
{
  "id": "string",
  "title": "string",
  "options": [{ "id": "string", "text": "string", "order": 0 }],
  "createdAt": "ISO8601"
}
```

Response `429 Too Many Requests` when the client IP has exhausted the
poll-creation bucket described under [Write rate limits](#write-rate-limits).

---

### Get poll

```
GET /polls/:id
```

Response `200 OK`:

```json
{
  "id": "string",
  "title": "string",
  "options": [{ "id": "string", "text": "string", "order": 0 }],
  "createdAt": "ISO8601"
}
```

Response `404 Not Found` if poll does not exist.

---

### Submit ballot

```
POST /polls/:id/ballots
```

Request body:

```json
{
  "entries": [
    { "optionId": "string", "rank": 1 },
    { "optionId": "string", "rank": 2 },
    { "optionId": "string", "rank": 3 }
  ]
}
```

Constraints:

- `entries` is required; array length must equal the number of poll options (N)
- each `optionId` must belong to this poll — otherwise `400`
- duplicate `optionId` values are not allowed — otherwise `400`
- each `rank` is unique; ranks must be consecutive integers 1..N — otherwise `400`

Response `201 Created`:

```json
{
  "id": "string",
  "pollId": "string",
  "createdAt": "ISO8601"
}
```

Response `400 Bad Request` if validation fails.
Response `404 Not Found` if poll does not exist.
Response `429 Too Many Requests` when the client IP has exhausted the
ballot-submission bucket described below.

---

### Write rate limits

The two public anonymous write endpoints have independent fixed-window buckets:

| Endpoint                  | Limit per client IP | Window     |
| ------------------------- | ------------------- | ---------- |
| `POST /polls`             | 5 requests          | 60 minutes |
| `POST /polls/:id/ballots` | 300 requests        | 60 minutes |

The ballot bucket spans all poll IDs. Each window starts with the first request
for that client and route bucket and expires 3,600 seconds later. The first N
requests pass the limiter; N+1 receives `429`. Attempts count before validation
and application handling, so requests that return `400` or `404` consume
capacity. Rejected `429` attempts do not extend the window. The next request
after expiry starts a fresh window.

A `429` response includes `Retry-After` as an integer number of seconds until
the current window expires, rounded up. Its JSON body follows the common Nest
error shape with `statusCode: 429` and string `message` and `error` fields. No
`RateLimit-*` or `X-RateLimit-*` headers are part of the contract.

Client identity comes from the HTTP framework's client IP. Forwarding headers
are not trusted by default. Production may enable an exact trusted-proxy hop
count only when direct API access is blocked; the first deployment uses one
trusted reverse proxy hop and one API replica. Rate-limit counters are held in
process memory and may reset on restart.

---

### Get results

```
GET /polls/:id/results
```

Response `200 OK`:

```json
{
  "pollId": "string",
  "title": "string",
  "method": "BORDA",
  "winners": [{ "optionId": "string", "text": "string", "score": 0 }],
  "scores": [{ "optionId": "string", "text": "string", "score": 0 }],
  "totalBallots": 0
}
```

Notes:

- `winners` and `scores` share one entry shape (`{ optionId, text, score }`), so the results page needs no lookup between them
- `winners` contains all options with the maximum score; typically one element, multiple on tie
- `scores` always contains ALL poll options, sorted by `score` DESC, then by `option.order` ASC
- `title` is included so the results page renders with a single request
- When no ballots have been submitted: `winners: []`, `scores` contains all options with `score: 0`, `totalBallots: 0`
- Borda scoring: an option ranked `r` out of `N` options earns `N − r` points
- Results are calculated on the fly (no caching)

Response `404 Not Found` if poll does not exist.

---

## Operational Endpoint

### Liveness

```
GET /health
```

Response `200 OK`:

```json
{
  "status": "ok"
}
```

This public endpoint is served at `/api/v1/health`, but it is not a product
endpoint. It reports only that the API process can answer HTTP requests: it does
not query PostgreSQL or any other dependency and therefore does not promise
readiness. Container orchestration may use it as a liveness signal. Backlog #33
owns dependency-aware health, external monitoring and alerting.

The scaffold `GET /api/v1` endpoint is not a health contract and remains tracked
for removal in #30. The liveness route is implemented separately from that
scaffold and does not add a shared product DTO.

---

## Notes

- All IDs are UUIDs
- Timestamps are ISO 8601 (UTC)
- Counting method is Borda in MVP
- No authentication required
- Product endpoints and the operational liveness endpoint are public

---

## Error Response Format

All error responses follow NestJS default shape:

```json
{
  "statusCode": 400,
  "message": ["title should not be empty"],
  "error": "Bad Request"
}
```

- `message` is a string for simple errors; an array of strings when `ValidationPipe` rejects input
- `statusCode` mirrors the HTTP status code
