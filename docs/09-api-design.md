# API Design

## Base URL

```
/api/v1
```

Backlog #29 publishes this prefix at
`https://rankvote.avshukan.com/api/v1`, where release `v0.1.0` was deployed on
2026-09-19.

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

Client identity comes from the HTTP framework's client IP. The API configures
Express proxy trust from `TRUSTED_PROXY_HOPS`, which must be an exact
non-negative integer and defaults to `0`. Local development and Compose keep
the zero-hop value, so client-supplied forwarding headers are ignored.
Production may set the value to `1` only when direct API access is blocked and
all traffic crosses exactly one trusted reverse proxy hop. The first deployment
uses one API replica. Rate-limit counters are held in process memory and may
reset on restart.

---

### Get results

```
GET /polls/:id/results
```

Query parameters:

- `method` (optional): `BORDA` or `IRV`
- if omitted, `method` defaults to `BORDA`

Response `400 Bad Request` when `method` is provided but not one of the
supported values (`BORDA`, `IRV`).

The response is discriminated by `method`, the counting method that produced
it. Each method has its own response variant, and a client reads `method`
before any method-specific field.

Response `404 Not Found` if poll does not exist, whatever the method.

#### Borda — `method: "BORDA"`

Returned when `method` is omitted or set to `BORDA`.

Response `200 OK`:

```json
{
  "pollId": "string",
  "title": "string",
  "method": "BORDA",
  "winners": [
    {
      "optionId": "string",
      "text": "string",
      "score": 0,
      "breakdown": [{ "place": 1, "points": 1, "ballots": 0, "subtotal": 0 }]
    }
  ],
  "scores": [
    {
      "optionId": "string",
      "text": "string",
      "score": 0,
      "breakdown": [{ "place": 1, "points": 1, "ballots": 0, "subtotal": 0 }]
    }
  ],
  "totalBallots": 0
}
```

Notes:

- `winners` and `scores` share one entry shape (`{ optionId, text, score, breakdown }`), so the results page needs no lookup between them
- `winners` contains all options with the maximum score; typically one element, multiple on tie
- `scores` always contains ALL poll options, sorted by `score` DESC, then by `option.order` ASC
- `title` is included so the results page renders with a single request
- When no ballots have been submitted: `winners: []`, `scores` contains all options with `score: 0`, `totalBallots: 0`
- Borda scoring: an option ranked `r` out of `N` options earns `N − r` points
- Results are calculated on the fly (no caching)

Score breakdown — `breakdown` shows how an entry's Borda score was built
(ID-19). The API computes every field, so a client renders the rows as they are
and holds no counting formula; the web shows them on each option's Details view.

- exactly `N` rows, one per place `1..N`, in ascending `place` order; a place
  no ballot gave the option is still listed, with `ballots: 0`
- `points` is the Borda value of that place, `N − place`
- `ballots` is the number of ballots that ranked the option at that place
- `subtotal` is `points × ballots`
- the subtotals add up to `score`, and an option's `ballots` add up to
  `totalBallots`: a strict full ranking places every option exactly once
- with no ballots, every row has `ballots: 0` and `subtotal: 0`

#### Instant-runoff voting — `method: "IRV"`

Returned when `method=IRV`.

Response `200 OK`:

```json
{
  "pollId": "poll-1",
  "title": "Lunch",
  "method": "IRV",
  "winners": [
    { "optionId": "a", "text": "A" },
    { "optionId": "b", "text": "B" }
  ],
  "rounds": [
    {
      "round": 1,
      "tallies": [
        { "optionId": "a", "text": "A", "votes": 4 },
        { "optionId": "b", "text": "B", "votes": 2 },
        { "optionId": "c", "text": "C", "votes": 2 },
        { "optionId": "d", "text": "D", "votes": 2 }
      ],
      "eliminatedOptionIds": ["d"],
      "tieBreak": {
        "rule": "RANK_PROFILE",
        "tiedOptionIds": ["b", "c", "d"],
        "comparisons": [
          {
            "rank": 2,
            "counts": [
              { "optionId": "b", "votes": 3 },
              { "optionId": "c", "votes": 2 },
              { "optionId": "d", "votes": 2 }
            ]
          },
          {
            "rank": 3,
            "counts": [
              { "optionId": "c", "votes": 5 },
              { "optionId": "d", "votes": 4 }
            ]
          }
        ],
        "allActiveCandidatesStillTied": false
      }
    },
    {
      "round": 2,
      "tallies": [
        { "optionId": "a", "text": "A", "votes": 4 },
        { "optionId": "b", "text": "B", "votes": 4 },
        { "optionId": "c", "text": "C", "votes": 2 }
      ],
      "eliminatedOptionIds": ["c"]
    },
    {
      "round": 3,
      "tallies": [
        { "optionId": "a", "text": "A", "votes": 5 },
        { "optionId": "b", "text": "B", "votes": 5 }
      ],
      "eliminatedOptionIds": [],
      "tieBreak": {
        "rule": "RANK_PROFILE",
        "tiedOptionIds": ["a", "b"],
        "comparisons": [
          {
            "rank": 2,
            "counts": [
              { "optionId": "a", "votes": 5 },
              { "optionId": "b", "votes": 5 }
            ]
          }
        ],
        "allActiveCandidatesStillTied": true
      }
    }
  ],
  "standings": [
    { "optionId": "a", "text": "A", "placeFrom": 1, "placeTo": 2 },
    { "optionId": "b", "text": "B", "placeFrom": 1, "placeTo": 2 },
    { "optionId": "c", "text": "C", "placeFrom": 3, "placeTo": 3 },
    { "optionId": "d", "text": "D", "placeFrom": 4, "placeTo": 4 }
  ],
  "totalBallots": 10
}
```

Notes:

- `rounds` is ordered by `round` ascending and is the source for the IRV
  explanation UI
- each `round` lists active candidates in `tallies`, sorted by `votes` DESC then
  `option.order` ASC
- IRV does not terminate on first-choice majority; it continues elimination rounds
  to build complete `standings`
- each round uses only active candidates: previously eliminated candidates are
  removed from each ballot and ranks are compressed before counting
- `eliminatedOptionIds` holds the candidate(s) removed at the end of that round;
  it may contain multiple IDs when an unresolved tie covers only a subset of
  active candidates
- `tieBreak` is omitted when the lowest tally is unique
- if `majorityThreshold` is returned, it is explanatory metadata only and does
  not affect elimination behavior
- `standings` records final places per option with `{ placeFrom, placeTo }`
- each eliminated group fills the lowest still-unassigned places; if `k`
  candidates are eliminated together, they share that `k`-place range
- `winners` is exactly the standing group whose `placeFrom` is `1`
- `totalBallots` is the total submitted ballots for the poll
- zero ballots is a separate case:
  `winners: []`, `rounds: []`, `standings: []`, `totalBallots: 0`

IRV elimination tie-break (`tieBreak.rule = "RANK_PROFILE"`):

- start from candidates tied for the minimum first-choice tally in that round
- `tieBreak.tiedOptionIds` stores that original lowest first-choice tie-set
- compare only that tie-set by second-place counts and keep only candidates with
  the minimum count; if one candidate remains, eliminate that candidate
- `tieBreak.comparisons[]` starts at `rank: 2`. Rank 1 counts are already in
  the round's first-choice `tallies`
- if several candidates remain tied, compare only those survivors by
  third-place counts, then fourth-place counts, and so on
- each `tieBreak.comparisons[]` entry records one compared rank and includes
  counts for the current tie-set before narrowing; later comparison entries
  include only candidates that survived the previous comparison
- by round 3 in the example, only two candidates remain active, so compressed
  ballots have ranks `1..2` and `rank: 2` is the last available comparison
- with two active candidates, rank-2 counts mirror round-3 first-choice
  `tallies`, because each ballot contributes its other active candidate at rank 2
- in this example, that mirror relationship follows directly: with only two
  active candidates, round 3 has `tallies` A=5/B=5 and `rank: 2` counts A=5/B=5
- if candidates remain tied through every available rank:
  - when they are only a subset of active candidates, eliminate all of them
    simultaneously
  - when they are all active candidates, none is eliminated; they share all
    remaining top places and are all winners; in this case
    `eliminatedOptionIds: []`, `tieBreak.allActiveCandidatesStillTied: true`

Client routing note for ID-8 web behavior:

- when `method=IRV`, navigation between `/poll/:id/results` and
  `/poll/:id/results/options/:optionId` preserves `method=IRV` in the URL query
  so both views render the same method variant

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
- Counting methods: BORDA is the current baseline; IRV is specified for ID-8
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
