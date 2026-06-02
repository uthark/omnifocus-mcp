# `gtd-review` Skill — Design

- **Date:** 2026-06-01
- **Status:** Approved (brainstorming) → ready for implementation planning
- **Owner:** Oleg Atamanenko
- **Repo:** `omnifocus-mcp` (skill ships to `~/.claude/skills/gtd-review/`)
- **Parent design:** [`2026-06-01-gtd-review-system-design.md`](./2026-06-01-gtd-review-system-design.md) — this spec implements **Phase 2 (Component 2, §5)** of that system.

## 1. Context

The GTD review system's MCP keystones shipped and merged in PR #23 (Phase 1):
`get_review_digest`, `batch_mark_reviewed`, and `get_tasks_by_tag` commitment
aging. This spec defines **Phase 2**: the `gtd-review` skill that turns those
tools into a repeatable, consent-based review ritual, plus **one small MCP
addition** the skill needs (a `folderId` filter on `get_tasks_by_tag`).

The skill complements the existing `gtd-inbox-review` (inbox *tasks*);
`gtd-review` handles *projects* + *waiting-for/owed commitments*.

## 2. Goals / Non-Goals

**Goals**
- One skill, three modes (backlog / weekly / daily), each reusing the same
  MCP machinery and behavioral rules.
- **Work and personal are never mixed in a single review** — the top-level
  scope of every run is one area of responsibility.
- Per-folder (per-area) review across all modes.
- Mirror the established `gtd-inbox-review` behavioral contract (one item per
  turn, per-item consent, banned-word hygiene, "done" not "trash").

**Non-Goals**
- Not a bulk-speed optimizer — decisions stay one-at-a-time and consent-based.
- No new OmniFocus data model.
- Calendar cadence (Phase 3) and the actual 200-project backlog run (Phase 4)
  are out of scope here. `skill-creator` evals are deferred.

## 3. Invocation & Area Resolution

```
/gtd-review [mode] [area]
```

- `mode` ∈ `backlog` · `weekly` · `daily`
- `area` ∈ `work` · `personal` · a folder name / Johnny-Decimal number
  (e.g. `32.21`, `"32 Inworld"`)

**Area resolves FIRST, on every run:**

| `area` value      | Resolves to                                                              |
|-------------------|--------------------------------------------------------------------------|
| `work`            | `32 Inworld` → `jwii3wAKVG7` (one digest pass; recurses all `32.xx`)      |
| `personal`        | `10-19 Life admin` → `opfl_ld1hDO` **+** `20-29 Parent` → `dqR-9hwJuSq` (two passes, merged) |
| folder name / JD# | resolve via cached IDs in `reference_omnifocus_ids.md`, else `get_folders(contains:true)`; **confirm the resolved folder name to the user before scanning** |

- **No `area` arg** → the skill asks `work` / `personal` / a folder before any
  scan. It **never** runs a blended whole-database scan.
- **No `mode` arg** → after the area is chosen, the skill runs one
  `get_review_digest(scope=due, folderId=…)` peek, proposes a mode from the
  counts (e.g. a large overdue backlog → suggest `backlog`), and confirms.
- **`31 Companies` / `31.11 HOA`** is **not** part of the `work` shorthand
  (`work` = `32 Inworld` only). It is reviewable only by passing its folder
  explicitly, so it is never silently mixed into a work or personal run.
  *(Confirm with user; trivially adjustable.)*

`flattened projects of targetFolder` (already used by `get_review_digest`)
recurses into subfolders, so a single parent `folderId` covers its whole
subtree.

## 4. Core Rule — Single-Area Discipline

Every run is confined to **one** area. Both passes filter to the same area:

- **Project pass** → `get_review_digest(folderId=…)` (native today).
- **Aging pass** → `get_tasks_by_tag(folderId=…)` (**new param**, §6).

Work and personal projects/commitments never co-occur in one session. For
`personal` (two roots), each pass runs per root and the results are merged
before presentation.

## 5. Modes

All modes walk items **one at a time** and obey the shared contract (§7).

### 5.1 Backlog (one-time, scope=all-active)
- `get_review_digest(scope=all-active, folderId=area)`, paginated for 200+.
- **Walk every project one at a time** in §4.1 priority order
  (flagged → deadline by `daysUntilDue` → else `daysOverdueForReview`; stalled
  flagged within each tier). No bulk auto-action.
  - *Healthy* (not stalled, has a `Planned` next action): one-line presentation
    + quick "y" → `mark_project_reviewed`.
  - *Stalled* / *no-`Planned`-action*: full decision menu (§7).
- **Resumable:** `mark_project_reviewed` drops a project out of `scope=due`, and
  the skill tracks "Project N of M" within the run; re-invoking resumes.
- `batch_mark_reviewed` is used **only** when the user explicitly says
  something like "mark the rest reviewed" — never as a default shortcut.

### 5.2 Weekly (steady-state, scope=due)
- `get_review_digest(scope=due, folderId=area)`, same one-at-a-time walk and
  ordering as backlog.
- **Plus** area-scoped commitment-aging (§8), both directions,
  `minAgeDays` + `sortByAge`.
- **Plus** a "every active project has a `Planned` next action" sweep —
  surface projects whose `plannedCount == 0` for a next-action decision.

### 5.3 Daily (light)
- Area-scoped: aging commitments (§8) + newly-stalled projects + flagged /
  forecast items (`get_flagged_tasks` / `get_forecast`).
- At the end, **offer** to hand off to `gtd-inbox-review` for inbox-zero —
  launches only on explicit "yes" (opt-in; complements `daily-manager`).
- "Newly-stalled" threshold: a project that became stalled
  (`availableCount == 0`) and whose `daysSinceActivity` is within the last
  7 days — i.e. it stalled recently rather than long ago.

## 6. MCP Change — `folderId` on `get_tasks_by_tag`

Small, contained addition folded into this phase (mirrors `get_review_digest`):

- **Builder** (`buildGetTasksByTagScript`): accept optional `folderId`. When
  present, resolve `set targetFolder to first flattened folder whose id is …`
  and restrict the per-tag task scan to that folder's subtree (intersect tag
  membership with `flattened tasks of targetFolder`). When absent, behavior is
  unchanged (whole database).
- **Tool** (`src/tools/review.ts`, where `get_tasks_by_tag` is registered):
  add optional `folderId` Zod param with a clear description; thread it through
  to `buildGetTasksByTagScript`.
- **Parser:** unchanged — `taskRecord` already emits the containing project
  name (`projName`); the filter happens server-side.
- **Tests:** add cases mirroring the digest's folder tests — assert the builder
  emits the `targetFolder` resolution + subtree restriction when `folderId` is
  set, and omits it otherwise; tool-schema integration test for the new param.
- **Docs:** update README tool list / param notes. **Tool count stays 36**
  (this is a param addition, not a new tool).

## 7. Shared Behavioral Contract (all modes)

Mirrors `gtd-inbox-review`'s contract verbatim where it overlaps:

- **Consent:** never `complete_task` / `delete_task` / drop a project without an
  explicit per-item "y" for that specific item. Prefetched/digest context is not
  permission. Always present the item + recommendation first, then wait.
  Reversible actions (`mark_reviewed`, move to `on hold`, set `reviewInterval`,
  add a `Planned` tag, rename, set defer date) may execute on a single "do it".
- **One item per turn** — never batch multiple projects/commitments in one
  message.
- **Banned-word hygiene** — never expose `slot`, `pipeline`, `cache`, raw
  OmniFocus IDs, etc.; label items `Project N` / `Task N`; folders/projects by
  human name. Run the pre-send self-check from `gtd-inbox-review`.
- **Word choice** — say "done"/"complete" with the right reason
  (shipped / superseded / bystander); never "trash"; never frame live/active
  topics as "moment passed."
- **Per-project decision menu:** confirm/add a `Planned` next action · complete
  (done) · move to `on hold` (someday/maybe) · drop · `mark_reviewed` · tighten
  `reviewInterval` (esp. flagged/deadline projects).
- **Memory rules honored:** work projects → folder `jwii3wAKVG7`; person tags
  `"First Last"` (verify with `get_tags(nameOnly:true)` before creating);
  `SRE-XXXX` projects are Jira epics (don't demote to tasks); delegated tasks →
  create a follow-up, don't just complete; `Planned` tag for next actions, flag
  only critical+urgent+hard-deadline; trimmed lookups
  (`omitNotes`/`nameOnly`/`contains`); check `reference_omnifocus_ids.md` first.

## 8. Commitment Aging (two directions, area-scoped)

Via `get_tasks_by_tag(folderId=area, minAgeDays, sortByAge)` over the resolved
`waiting for` tag and person tags:

| Tags on the task                 | Meaning                              | Follow-up action                         |
|----------------------------------|--------------------------------------|------------------------------------------|
| person tag **+** `waiting for`   | **Delegated** — you're waiting on them | Create a follow-up task to chase the person |
| person tag, **no** `waiting for` | **Owed** — you owe that person        | Treat as your own next action — add `Planned` / schedule / do it |

The skill resolves the exact `waiting for` spelling and the person tags at
runtime via `get_tags`, and classifies direction from each returned task's tag
list. `daysWaiting` is computed server-side.

## 9. Prefetch Model

**The digest is the prefetch.** A single `get_review_digest` pass returns the
stall / `Planned` / deadline / last-activity signals for every project, so the
skill does **not** need the A/B/C rotation pattern from `gtd-inbox-review`. A
background subagent is spawned only when a *single* project needs deeper context
(read its tasks/notes, or resolve a linked doc) before a decision — most
projects are decided straight from digest signals.

## 10. Presentation Format (per project)

```
Project N of M: [name] — [folder]
  Signals: [stalled? + reason | available N · Planned N] · [deadline in D days, if any]
           · [last activity D days ago] · [review D days overdue] [· flagged]
  Recommendation: [ONE action, stated plainly]
```

Wait for explicit "y" before any complete/delete/drop. Reversible actions
execute on "do it".

## 11. File Structure

Single `~/.claude/skills/gtd-review/SKILL.md` (frontmatter `user-invocable:
true`), mirroring `gtd-inbox-review`'s shape: a shared-core section (contract,
area resolution, decision menu, aging, OF action mapping, lookup economy) + a
compact section per mode. Split heavy per-mode detail into `references/` only if
a mode's section balloons (progressive disclosure).

## 12. Testing Strategy

- **MCP** (`folderId` on `get_tasks_by_tag`): unit tests on the builder (folder
  resolution + subtree restriction present iff `folderId` set) and a tool-schema
  integration test for the new param. Follow existing `review.test.ts` /
  `_tool-schema.integration.test.ts` patterns.
- **Skill:** behavior validated manually first (run weekly mode over a single
  small folder, verify single-area discipline + consent gating). Optional
  `skill-creator` evals later (out of scope for MVP).

## 13. Sequencing

1. **MCP:** add `folderId` to `get_tasks_by_tag` (builder + tool param + tests +
   README). Ship via PR.
2. **Skill:** author `gtd-review/SKILL.md` with the three modes + shared contract.
3. (Later phases, separate work: backlog run; calendar cadence.)

## 14. Decisions Confirmed

- Three modes built in v1: **backlog + weekly + daily**.
- Mode selection: **explicit arg wins; no arg → peek digest and propose**, after
  area is chosen.
- **Area scope resolves first; work and personal are never mixed.** `work` =
  `32 Inworld`; `personal` = `10-19` + `20-29` (two passes merged); any folder
  by name/JD#.
- Backlog mode: **walk every project one at a time**, no bulk auto-action;
  `batch_mark_reviewed` only on explicit request.
- Daily mode: **offer** `gtd-inbox-review` handoff at the end (opt-in).
- Aging is **area-scoped** via a **new `folderId` param on `get_tasks_by_tag`**
  (chosen over client-side filtering or person-tag heuristics for robustness).

## 15. Open Questions

- Confirm `31 Companies` / `31.11 HOA` placement: excluded from both `work` and
  `personal` shorthands (explicit-folder only) per §3 — acceptable?
