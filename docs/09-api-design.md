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

- `entries` must include all poll options
- each `rank` is unique (strict full ranking)
- ranks are consecutive integers starting from 1

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
  "method": "BORDA",
  "winner": {
    "id": "string",
    "text": "string"
  },
  "scores": [{ "optionId": "string", "text": "string", "score": 0 }],
  "totalBallots": 0
}
```

Response `200 OK` with `winner: null` and empty `scores` if no ballots submitted yet.
Response `404 Not Found` if poll does not exist.

---

## Notes

- All IDs are UUIDs
- Timestamps are ISO 8601 (UTC)
- Counting method is Borda in MVP
- No authentication required
- All endpoints are public
