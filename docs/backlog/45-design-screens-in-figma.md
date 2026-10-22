# ID-45 Design screens in Figma

Temporary design context. `State = Design`: the redesign's goal, depth and
scope are open, and what an AI agent can do in Figma on the owner's current
plan is untried. After the spike below, rerun `task-readiness`; durable
decisions then move to permanent documentation and this file is deleted.

## Confirmed facts

- Source: Issue #99. The owner dislikes the current design and wants to draw
  the needed screens in Figma with an AI agent, then apply them to production.
- Five routes — create poll with its share link, vote, results, score
  breakdown, not-found — plus shared loading, error/Retry and not-found states.
- Default Tailwind CSS v4 styling: no design tokens, custom fonts, dark mode or
  page shell. `apps/web/index.html` sets the tab title `web` and the Vite
  favicon; `App.css` and `src/assets/*` are unused scaffold files.
- On record: plain Tailwind without a component library
  (`docs/06-decisions.md`); MCP only when no CLI can do the job
  (`docs/12-ai-first.md`); no visual-regression or browser end-to-end suites
  (`docs/11-testing-strategy.md`).
- The same screens change in ID-6 (responsive from 320 CSS px), ID-8 (BORDA/IRV
  selector) and ID-20 (Refresh results), all `Ready`. ID-6 keeps rebranding, a
  drag handle and a card layout for results as not planned.
- ID-11 (`Ready`) gives the installable app an interim name, `Ranking Vote`,
  and a simple icon, which also replace the tab title `web` and the Vite
  favicon. It adds links on "Poll created", vote and results in place of the
  browser navigation an app window lacks. The branding of decision 3 may
  replace the interim name and icon.
- Figma as documented on 2026-10-18, untried here:
  - The official remote MCP server (`https://mcp.figma.com/mcp`, OAuth) works
    with Claude Code, Codex and VS Code; Copilot cloud agent does not support
    OAuth remote MCP servers.
  - Writing to the canvas is in beta: free during the beta, later usage-based
    and paid. Code to canvas captures a running UI as flat layers, Starter
    included. `use_figma`, with which an agent edits frames, components and
    variables, lists the Professional, Education, Organization and Enterprise
    plans.
  - Starter and View/Collab seats get 20 read calls a month; tools that write
    to Figma files are exempt.

## Accepted by the owner

- Level `High`, State `Design`; the spike below is the next step.
- Design and implementation stay one item for now; the next readiness pass
  decides whether to split.
- Visual redesign belongs to ID-45; ID-6's Out of Scope points here.

## Open owner decisions

1. Goal: what about the current design should change.
2. Depth: new tokens over the current layout, new layout and components, or
   UX-flow changes.
3. Scope: screens, states and widths; branding (name, logo, favicon, fonts),
   dark mode and copy.
4. Contracts: keep ID-6 and ID-19 as they are or revisit them (a drag handle,
   results as cards); revisiting one updates that item.
5. Approval: how a design is approved and recorded, given a public repository
   and agents without Figma access.
6. Implementation: one item or slices; tokens in Tailwind `@theme`; a
   component library (an ADR change); checking against the design; order
   relative to ID-6, ID-8 and ID-20.
7. Tooling: Figma plan and seat, the agent, MCP configuration per user or in
   the repository.

## Proposals (not accepted)

- Keep ID-6, ID-8 and ID-20 moving; their contracts become design inputs.
- Prefer official Figma tools: unofficial bridge plugins expose an
  unauthenticated local WebSocket and send telemetry.

## Spike

Run by the owner with an AI agent after this readiness is merged; nothing is
committed to the repository.

- Goal: one minimal full loop on the Vote screen: current UI → Figma → a change
  by an AI agent → the owner's assessment.
- Start with what the current Figma plan allows; buying a subscription needs
  separate owner approval.
- No further screens, permissions or tools unless the loop cannot be completed
  without them. If native canvas editing is unavailable on the current plan,
  stop after capturing the UI, record the limitation and ask the owner how to
  proceed.
- Bring to the next readiness pass: what worked, limits hit, time and AI
  credits spent, and how usable the agent's change was.

## Rerunning readiness

Rerun `task-readiness` once the spike's findings are available. With them as
input it settles the open decisions and ends as `Ready` with acceptance
criteria, `Design` with what is still open, or a split proposed through intake.
