# Domain Model

## Poll

Represents a voting session.

Fields:
- id: string
- title: string
- ballotFormat: BallotFormat
- countingMethods: CountingMethod[]
- createdAt: datetime

Notes:
- one poll can support multiple counting methods
- ballot format defines how preferences are collected

---

## PollOption

Represents a selectable option in a poll.

Fields:
- id: string
- pollId: string
- text: string
- order: number

---

## Ballot

Represents a participant's preferences.

Fields:
- id: string
- pollId: string
- entries: BallotEntry[]
- createdAt: datetime

Notes:
- anonymous
- MVP supports strict ranking only (STRICT_RANKING)
- future: supports ties, partial ranking

---

## BallotEntry

Represents a ranked option inside a ballot.

Fields:
- optionId: string
- rank: number

Examples:

Strict ranking:
- A → 1
- B → 2
- C → 3

Ranking with ties:
- A → 1
- B → 2
- C → 2

Partial ranking:
- A → 1
- B → 2

---

## PollResult (future)

Represents a calculated result for a specific counting method.

Fields:
- pollId: string
- countingMethod: CountingMethod
- winnerOptionId: string
- metadata: unknown

---

## BallotFormat

Defines how preferences are collected.

Values:
- STRICT_RANKING
- RANKING_WITH_TIES
- PARTIAL_RANKING
- PAIRWISE

---

## CountingMethod

Defines how results are calculated.

Values:
- BORDA
- IRV
- CONDORCET
- SCHULZE
- RANKED_PAIRS