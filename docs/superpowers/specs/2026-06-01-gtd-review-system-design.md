# GTD Review System — Design

- **Date:** 2026-06-01
- **Status:** Approved (brainstorming) → ready for implementation planning
- **Owner:** Oleg Atamanenko
- **Repo:** `omnifocus-mcp`

## 1. Context & Problem

There are 200+ active OmniFocus projects past their review date. The backlog
is a symptom, not the disease. The real goal is a **durable, repeatable GTD
system** that tracks both personal commitments and team/delegated commitments,
so the backlog never rebuilds to 200 again.

Three diagnosed failure modes (chosen by the user):

1. **No cadence/trigger** — nothing reliably prompts a review at the right time.
2. **Projects silently stall** — projects sit with no next action / no activity
   for months and nothing flags them.
3. **Team/delegated slips** — things delegated or waited-on fall through the
   cracks.

Notably *not* chosen: "review too slow/tedious." The system needs to be
**smarter** (detection, tracking, prompting), not merely faster.

## 2. Goals / Non-Goals

**Goals**
- Detect stalled projects (no available next action) across the whole portfolio
  in a single cheap server pass.
- Track delegated/waiting-on commitments with aging, so nothing slips silently.
- A repeatable, low-friction review ritual (weekly deep / daily light) plus a
  one-time backlog remediation that reuses the same machinery.
- A reliable nudge (calendar event) so the review actually happens.

**Non-Goals**
- Not a bulk-speed optimizer — interactive, consent-based decisions stay
  one-at-a-time by design.
- Not headless/automated decision-making (the review is human-in-the-loop).
- No new OmniFocus data model. "Someday/maybe" = existing `on hold` status;
  "areas of responsibility" = existing folders. No new fields.

## 3. Architecture (Hybrid: smart server + evolvable skill)

Three layers, with heavy set-computation pushed server-side and judgment kept
in an evolvable skill:

```
MCP (server-side, one AppleScript pass per call)
  • get_review_digest          ← keystone: enriched whole-portfolio scan
  • waiting-for aging          ← delegated/team commitment tracking
  • batch_mark_reviewed (opt.) ← collapse the 200-backlog sweep
        ▲ reused by
Skill: gtd-review (judgment + presentation)
  • backlog mode (one-time) · weekly mode (deep) · daily mode (light)
        ▲ triggered by
Cadence: recurring Google Calendar event (on-demand execution)
```

**Constraint (documented, not worked around):** OmniFocus is a local macOS app
driven via AppleScript. A *remote* `/schedule` routine (claude.ai cron) cannot
reach the local OmniFocus, so cadence is a **nudge** (calendar event) plus
on-demand execution — not headless cloud automation. An optional local
`launchd` job that pre-generates a digest is explicitly out of the core design.

## 4. Component 1 — MCP keystone tools

### 4.1 `get_review_digest` (keystone)

A single AppleScript pass over projects, returning one enriched triage row per
project so the entire portfolio is triageable in 1–2 calls instead of N×3.

**Feasibility (grounded in existing code):**
- `buildGetProjectsDueForReviewScript` already iterates *all* active projects and
  checks `next review date < now` — proven single-pass pattern.
- `buildGetAvailableTasksScript` already encodes availability:
  `completed is false and blocked is false` + `effective defer date` missing or
  past. The digest reuses this logic inline to compute `availableCount`.

**Params**
- `scope`: `"due"` (past review date, default) | `"all-active"`
- `folderId`: optional — restrict the scan to one folder (area of responsibility)
- `includeOnHold`: bool (default false) — include someday/maybe projects
- `onlyStalled`: bool (default false) — filter to `availableCount == 0`
- `limit` / `offset`: pagination (must handle 200+; raise/remove the current
  100 cap for this tool)

**Per-project output**
- `id`, `name`, `folder`, `status`
- `incompleteCount`
- `availableCount` (not completed, not blocked, defer date past/absent)
- `plannedCount` — incomplete tasks tagged **`Planned`** (the user's next-action
  marker; flags are reserved for critical+urgent — see conventions)
- `stalled` (bool, `availableCount == 0`) + `stallReason`:
  `"empty"` (incompleteCount == 0) | `"blocked-or-deferred"`
- `lastActivityDate` + `daysSinceActivity` (max modification date over incomplete
  tasks; fall back to project modification date)
- `nextReviewDate` + `daysOverdueForReview`

**Performance:** one AppleScript invocation; scanning tasks for
`plannedCount` + `lastActivity` is heavier than the existing count-only scan.
Use a 30s timeout (matching `get_stale_tasks` / `get_available_tasks`). If too
slow at scale, gate `plannedCount`/`lastActivity` behind an `enrich` flag.

### 4.2 Waiting-for aging

Surface delegated/waited-on tasks sorted by how long they've been waiting.

**Decision:** extend the existing `get_tasks_by_tag` rather than add a new tool
(YAGNI — it already returns creation/defer/modification dates). Add:
- `minAgeDays`: only return tasks older than N days (server-side filter)
- `sortByAge`: bool — sort descending by `daysWaiting`

where `daysWaiting = now − (effective defer date if present else creation date)`.
The skill passes the resolved waiting tag name (e.g. `waiting_for`) and/or person
tags. Output adds a computed `daysWaiting` per task.

### 4.3 `batch_mark_reviewed` (optional)

Accept `projectIds: string[]`, loop `mark reviewed`. Only valuable for the
one-time 200-backlog sweep (bulk-clear the healthy remainder). Defer if leaner
is preferred; the skill can otherwise loop `mark_project_reviewed`.

## 5. Component 2 — `gtd-review` skill (3 modes)

A new skill complementing the existing `gtd-inbox-review` (which handles inbox
*tasks*). `gtd-review` handles *projects* + *waiting-for*. Daily/weekly modes can
hand off to `gtd-inbox-review` for inbox-zero.

- **Backlog mode (one-time):** `get_review_digest scope=all-active` → bucket into
  *stalled / no-Planned-action / healthy*. Walk the stalled + decision-needed
  buckets one at a time; bulk-`mark_reviewed` the healthy remainder. 200 → clean.
- **Weekly mode (steady-state):** same with `scope=due`; plus waiting-for aging
  review and a "every active project has a `Planned` next action" check.
- **Daily mode (light):** aging waiting-for + newly-stalled + flagged/forecast.
  Complements the existing `daily-manager` skill.

**Per-project decision options the skill offers:** add/confirm a `Planned` next
action · mark complete (done) · move to `on hold` (someday/maybe) · drop ·
`mark_reviewed` · for delegated items, create a follow-up task to check with the
person.

**Rules the skill MUST honor** (established user preferences — memory):
- Never complete/delete without explicit per-item "y"; prefetched context is not
  permission. Always show the item + recommendation first.
- One task per turn; never batch multiple in one message.
- Never expose "slot" vocabulary or raw OmniFocus IDs; label items "Task N".
- Say "done"/"complete" (with correct reason), never "trash".
- Prefer complete over delete; never delete without confirmation.
- Delegated tasks → create a follow-up task, don't just complete.
- Next actions use the **`Planned`** tag; flag only critical+urgent+hard-deadline.
- Work projects live under folder **`jwii3wAKVG7`** ("32 Inworld").
- Person tags are `"First Last"`; check existing tags before creating.
- `SRE-XXXX` projects are Jira epics — do not demote to tasks.
- Don't frame live/active topics as "moment passed."
- Use trimmed lookups (`omitNotes`/`nameOnly`/`contains`) for lookup-only calls.

## 6. Component 3 — Cadence (recurring calendar event)

Setup creates a recurring **Google Calendar** event (e.g. weekly "GTD Review"
block; optionally a short daily one) via the Google Calendar tools. OmniFocus's
own per-project review dates already determine *what* is overdue; the calendar
event provides the *when-to-look* nudge. Execution is on-demand: when the event
fires, the user runs `/gtd-review`.

## 7. Backlog Remediation (one-time)

Run `gtd-review` in **backlog mode** once to collapse 200 → clean steady state,
using `get_review_digest scope=all-active` + the bucketed walkthrough above.
After that, weekly/daily modes keep it clean. Nothing here is throwaway — it
reuses the same tools the steady-state ritual uses.

## 8. Error Handling & Edge Cases

- Projects with zero incomplete tasks → `stalled`, `stallReason="empty"`
  (candidate for completion or a new next action).
- Projects with tasks all blocked/deferred → `stalled`,
  `stallReason="blocked-or-deferred"` (needs unblocking, not dropping).
- Projects with no review interval / no next review date → excluded from
  `scope=due`; visible under `scope=all-active`.
- AppleScript date/`missing value` handling: follow existing `formatDate` /
  `escapeField` helpers; guard every property access that can be `missing value`.
- Large portfolios: respect the 30s timeout; paginate the digest.

## 9. Testing Strategy

Follow existing patterns:
- `src/applescript/__tests__/review.test.ts` — assert `buildGetReviewDigestScript`
  emits the expected availability/Planned/last-activity clauses and honors
  `scope`/`onlyStalled`/`includeOnHold`/pagination.
- `src/applescript/__tests__/parser.test.ts` — `parseReviewDigest` maps the
  tab-delimited rows to typed objects (booleans, counts, dates, stallReason).
- Tool-schema integration tests for the new params on `get_tasks_by_tag`.
- Skill behavior validated manually first; optional `skill-creator` evals later
  (out of scope for MVP).

## 10. Sequencing

1. **MCP:** `get_review_digest` (builder + parser + tests) → `get_tasks_by_tag`
   aging params → optional `batch_mark_reviewed`. Ship via PR(s); update README
   tool list.
2. **Skill:** `gtd-review` with backlog + weekly + daily modes honoring §5 rules.
3. **One-time:** run backlog mode to clear the 200.
4. **Cadence:** create the recurring calendar event.

## 11. Decisions Confirmed

- Direction: **Hybrid** (smart MCP keystones + evolvable skill).
- Keystones: `get_review_digest` (scope `due`/`all-active`, optional `folderId`)
  + waiting-for aging (folded into `get_tasks_by_tag`); `batch_mark_reviewed`
  optional.
- Stall signal keys off **available next action**, and reports the user's
  **`Planned`** convention.
- Cadence: **recurring Google Calendar event** + on-demand execution; remote
  `/schedule` ruled out (can't reach local OmniFocus).

## 12. Open Questions

- Exact name of the waiting-for tag in the user's OmniFocus (skill resolves via
  `get_tags` at runtime).
- Daily mode: include or skip inbox-zero handoff to `gtd-inbox-review`?
- Whether to ship `batch_mark_reviewed` in MVP or defer.
