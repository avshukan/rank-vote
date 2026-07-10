# Glossary

## Poll

A voting session created by a user.  
Contains a question (title) and a list of options.  
Identified by a unique ID used to generate a shareable link.

---

## PollOption

A single selectable choice within a poll.  
Each option has a display order and a unique ID.

---

## Ballot

A participant's submitted response to a poll.  
Contains a ranked list of all poll options.  
Anonymous — not linked to any user account.

---

## BallotEntry

A single ranked choice within a ballot.  
Links an option to its assigned rank.

---

## BallotFormat

Defines how participants express their preferences.

| Value             | Description                                     |
| ----------------- | ----------------------------------------------- |
| STRICT_RANKING    | All options must be ranked, no ties (MVP)       |
| RANKING_WITH_TIES | Options can share the same rank                 |
| PARTIAL_RANKING   | Only a subset of options needs to be ranked     |
| PAIRWISE          | Preferences expressed as option-to-option pairs |

MVP supports `STRICT_RANKING` only.

---

## CountingMethod

Defines the algorithm used to calculate the winner from submitted ballots.

| Value        | Description                                        |
| ------------ | -------------------------------------------------- |
| BORDA        | Points assigned by rank; highest total wins (MVP)  |
| IRV          | Instant-runoff: lowest option eliminated in rounds |
| CONDORCET    | Winner beats all others in pairwise comparisons    |
| SCHULZE      | Graph-based method using strongest pairwise paths  |
| RANKED_PAIRS | Ranks pairwise wins by margin, avoids cycles       |

MVP supports `BORDA` only.

---

## Borda Count

The default counting method for MVP.

How it works:

- for N options, the top-ranked option receives N−1 points
- the second-ranked option receives N−2 points
- and so on, down to 0 points for the last-ranked option
- points are summed across all ballots
- the option with the highest total score wins

---

## Vertical Slice

A complete end-to-end feature delivered in one iteration.  
Includes: domain logic, backend, frontend, integration, and basic testing.

---

## Iteration

A short time-boxed development cycle (1–2 weeks).  
Has a fixed scope and ends with a release.

---

## Definition of Done (DoD)

A checklist that must be satisfied before a task or iteration is considered complete.  
See `07-process.md` for the full list.

---

## Monorepo

A single repository containing multiple applications and shared packages.  
This project uses: `apps/web`, `apps/api`, `packages/shared`.

---

## Strict Full Ranking

A ballot format where every option must be assigned a unique rank.  
No ties and no omissions are allowed.
