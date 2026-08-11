# API Design

## Base URL

```
/api/v1
```

---

## Endpoints

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

## Notes

- All IDs are UUIDs
- Timestamps are ISO 8601 (UTC)
- Counting method is Borda in MVP
- No authentication required
- All endpoints are public

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
