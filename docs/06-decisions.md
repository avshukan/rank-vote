# Decisions

## Repository

### Monorepo

Status:
- accepted

Reason:
- simpler MVP development
- shared documentation
- easier CI/CD
- easier type sharing
- easier future expansion

---

## Applications

Initial applications:
- apps/web
- apps/api

Possible future applications:
- apps/mobile

---

## Frontend

Initial stack:
- React
- TypeScript
- Vite

Reason:
- fast MVP development
- large ecosystem
- good AI tooling support

---

## Backend

Initial stack:
- Node.js
- TypeScript

Reason:
- existing experience
- shared language across frontend/backend
- good ecosystem

---

## Product Scope

MVP principles:
- minimal feature set
- fast delivery
- anonymous usage
- no authentication

---

## Voting Model

The system separates:
- ballot format
- counting method

Reason:
- allows multiple counting strategies
- supports future extensibility

---

## Ballot Format

Initial supported format:
- STRICT_RANKING

Future possible formats:
- RANKING_WITH_TIES
- PARTIAL_RANKING
- PAIRWISE

---

## Counting Methods

Initial supported method:
- BORDA

Future possible methods:
- IRV
- CONDORCET
- SCHULZE
- RANKED_PAIRS

---

## Mobile Strategy

Initial strategy:
- responsive web app
- possible PWA support later

Native mobile app is deferred.
