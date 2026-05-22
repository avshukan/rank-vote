# Iteration 08 — Mobile Responsive Polish + Deployment

## Goal

Make the app usable on mobile devices and deploy to production hosting.

Backlog: #6

---

## Scope

### Mobile Responsive Layout

- Audit all pages (Create Poll, Vote, Results) on small screens
- Fix layout issues using Tailwind responsive utilities
- Ensure drag-and-drop is usable on touch devices
- Minimum target: 375px viewport width

### Deployment

#### `apps/api` → Railway

- Add multi-stage `Dockerfile` for Node.js build and runtime
- Set environment variables: `DATABASE_URL`, `CORS_ORIGIN`
- Verify Prisma migrations run on startup (`prisma migrate deploy`)

#### `apps/web` → Vercel

- Add `vercel.json` with SPA routing fallback (all routes → `index.html`)
- Set environment variable: `VITE_API_URL` pointing to the Railway API URL

### Smoke Test After Deploy

- Create a poll via the production URL
- Share the link, submit a ballot
- Verify results page shows the correct winner

---

## Out of Scope

- PWA / installable app
- Native mobile app
- Performance optimization

---

## Definition of Done

- App is accessible and usable on mobile (375px+)
- Production deployment is live and reachable
- End-to-end smoke test passes on production
- Application builds successfully
