# Known Limitations

## Product Scope

Current MVP intentionally focuses on:
- small groups
- anonymous voting
- simple ranked ballots
- one primary counting method

---

## Voting

### Initial counting support

Only Borda count is implemented in MVP.

Other methods are planned later:
- IRV
- Condorcet
- Schulze
- Ranked Pairs

---

### Initial ballot format

MVP supports only:
- strict full ranking

Not supported yet:
- ranking with ties
- partial ranking
- pairwise ballots

---

## Authentication

MVP does not include:
- accounts
- authentication
- user profiles

Duplicate vote prevention is soft only.

---

## Real-Time Features

MVP does not include:
- live updates
- websockets
- collaborative sessions

Users may need to refresh the page manually.

---

## Mobile Support

Initial version targets:
- desktop browsers
- basic mobile responsiveness

No native mobile app support.

---

## Scalability

MVP is not optimized for:
- large polls
- high traffic
- complex analytics

---

## Security

MVP is intentionally lightweight and does not yet include:
- advanced anti-spam protection
- strong duplicate vote prevention
- private polls
- role management
