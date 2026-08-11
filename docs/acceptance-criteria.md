# Acceptance Criteria — Tasks #3, #4, #5

## #3 Submit Ballot

### API

- [ ] `POST /polls/:id/ballots` accepts `{ entries: [{optionId, rank}] }`
- [ ] `entries` is required; array length must equal number of poll options (N) — otherwise `400`
- [ ] Each `optionId` must belong to the target poll — otherwise `400`
- [ ] Duplicate `optionId` values → `400`
- [ ] `rank` values must be unique consecutive integers 1..N — otherwise `400`
- [ ] Non-existent poll → `404`
- [ ] Response `201` contains `{ id, pollId, createdAt }`

### Frontend UX

- [ ] Drag & drop interface for ranking all options
- [ ] Reorder buttons (↑/↓) for touch devices
- [ ] After successful submit (`201`): add poll ID to `localStorage` key `voted_poll_ids`, redirect to results page, show toast "Vote submitted"
- [ ] On network error / 5xx: show inline error message, show retry button, do NOT clear form state
- [ ] If poll ID already in `localStorage` key `voted_poll_ids`: redirect to results page, skip voting form entirely

### Edge Cases

- [ ] Empty `entries` array → `400`
- [ ] `entries: null` or missing → `400`
- [ ] `optionId` that is a valid UUID but doesn't belong to this poll → `400`
- [ ] `rank: 0`, negative rank, or rank > N → `400`
- [ ] Concurrent duplicate submissions (race condition): accepted (no server-side dedup in MVP)

---

## #4 Calculate Borda Result

### API

- [ ] `GET /polls/:id/results` returns `{ pollId, method: "BORDA", winners, scores, totalBallots }`
- [ ] Borda formula: option at rank `r` out of N options gets `N − r` points
- [ ] `scores` always contains ALL poll options, even when 0 ballots
- [ ] `scores` sorted by `score` DESC, then by `option.order` ASC
- [ ] `winners` — array of all options with the maximum score (0+ elements; empty when `totalBallots: 0`)
- [ ] On tie: all tied leaders included in `winners`
- [ ] 0 ballots: `winners: []`, all options in `scores` with `score: 0`, `totalBallots: 0`
- [ ] Non-existent poll → `404`
- [ ] Results calculated on the fly (no cache)

### Edge Cases

- [ ] Single ballot → correct scores
- [ ] All options tied (e.g., single ballot of N options with equal distribution across multiple ballots) → all in `winners`
- [ ] Large number of ballots — no timeout (acceptable for MVP; caching is post-MVP)

---

## #5 Show Results

### Frontend UX

- [ ] Page `/polls/:id/results` is publicly accessible (no vote required to view)
- [ ] Displays: poll title, winner badge, score table (position / option text / score), total ballots count
- [ ] Single winner: show highlighted winner badge
- [ ] Multiple winners (tie): show all with "Tied winners" label
- [ ] 0 ballots (`totalBallots: 0`): show message "No votes yet" + "Share link" button
- [ ] Results URL is shareable — anyone can open it directly

### Edge Cases

- [ ] Poll exists but 0 ballots → "No votes yet" UI (no crash)
- [ ] Poll does not exist → 404 page
- [ ] Network error loading results → show error message with retry

---

## Post-MVP (documented, not required now)

- Keyboard/a11y reorder for ballot
- Results caching
- Real-time result updates
- Percentage column in score table
- Server-side duplicate vote protection
