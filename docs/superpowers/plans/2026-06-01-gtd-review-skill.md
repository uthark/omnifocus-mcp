# gtd-review Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the `gtd-review` skill (backlog/weekly/daily project review over a single work/personal area), plus the one MCP change it needs — a `folderId` filter on `get_tasks_by_tag` so the commitment-aging pass respects the work/personal boundary.

**Architecture:** Two deliverables. (1) A small, TDD'd MCP change in the `omnifocus-mcp` repo: thread an optional `folderId` through `buildGetTasksByTagScript` and the `get_tasks_by_tag` tool, mirroring how `get_review_digest` already scopes to a folder. (2) A new personal skill file at `~/.claude/skills/gtd-review/SKILL.md` (outside this repo, alongside `gtd-inbox-review`) that wraps `get_review_digest`, `get_tasks_by_tag`, and `mark_project_reviewed` into a consent-based, one-item-at-a-time ritual.

**Tech Stack:** TypeScript, Zod, Vitest, AppleScript (OmniFocus automation), Markdown skill authoring.

**Spec:** `docs/superpowers/specs/2026-06-01-gtd-review-skill-design.md`

---

## File Structure

**Repo changes (PR on branch `feat/gtd-review-skill`):**
- Modify: `src/applescript/review.ts` — add optional `folderId` param to `buildGetTasksByTagScript`.
- Modify: `src/tools/review.ts:115-140` — add `folderId` Zod param to `get_tasks_by_tag`, pass it through.
- Modify: `src/applescript/__tests__/review.test.ts` — builder folder-scoping tests.
- Modify: `src/tools/__tests__/_tool-schema.integration.test.ts` — schema parse test for the new param.
- Modify: `README.md` — document `folderId` on `get_tasks_by_tag`.

**Personal config (not in this repo):**
- Create: `~/.claude/skills/gtd-review/SKILL.md` — the skill.

---

## Task 1: Add `folderId` to `buildGetTasksByTagScript`

**Files:**
- Modify: `src/applescript/review.ts:256-286` (`buildGetTasksByTagScript`)
- Test: `src/applescript/__tests__/review.test.ts:128-158` (the `buildGetTasksByTagScript` describe block)

- [ ] **Step 1: Write the failing tests**

Add these two `it` blocks inside the existing `describe('buildGetTasksByTagScript', …)` block in `src/applescript/__tests__/review.test.ts`:

```ts
  it('scopes tasks to a folder subtree when folderId is given', () => {
    const script = buildGetTasksByTagScript(['Work'], 10, 'fld123');
    expect(script).toContain('fld123');
    expect(script).toContain('flattened folder whose id');
    expect(script).toContain('folderProjIds');
    expect(script).toContain('every flattened project of targetFolder');
  });

  it('omits folder scoping when folderId is absent', () => {
    const script = buildGetTasksByTagScript(['Work'], 10);
    expect(script).not.toContain('folderProjIds');
    expect(script).not.toContain('targetFolder');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/applescript/__tests__/review.test.ts -t "buildGetTasksByTagScript"`
Expected: FAIL — the first new test fails because the current builder ignores a third argument (no `folderProjIds`/`targetFolder` text emitted).

- [ ] **Step 3: Implement the folderId param**

Replace the entire `buildGetTasksByTagScript` function in `src/applescript/review.ts` with:

```ts
export function buildGetTasksByTagScript(tagNames: string[], limit: number, folderId?: string): string {
  const escapedTags = tagNames.map((t) => `"${escapeForAppleScript(t)}"`).join(', ');
  const folderSetup = folderId
    ? `set targetFolder to first flattened folder whose id is "${escapeForAppleScript(folderId)}"
    set folderProjIds to (id of every flattened project of targetFolder)`
    : '';
  const folderGuard = folderId
    ? `set keepT to true
          try
            set cpid to id of containing project of t
            if folderProjIds does not contain cpid then set keepT to false
          on error
            set keepT to false
          end try`
    : 'set keepT to true';
  return `
tell application "OmniFocus"
  tell default document
    set targetTagNames to {${escapedTags}}
    ${folderSetup}
    set seenIds to {}
    set matchCount to 0
    set results to ""
    repeat with tagName in targetTagNames
      set tg to first flattened tag whose name is (tagName as text)
      set tagTasks to remaining tasks of tg
      repeat with t in tagTasks
        set tid to id of t
        if seenIds does not contain tid then
          ${folderGuard}
          if keepT then
            set end of seenIds to tid
            set matchCount to matchCount + 1
            if matchCount > ${limit} then
              -- already have enough results, just keep counting
            else
              set results to results & my taskRecord(t) & linefeed
            end if
          end if
        end if
      end repeat
    end repeat
    set output to "TOTAL:" & matchCount & linefeed & results
    return output
  end tell
end tell
${APPLESCRIPT_HELPERS}`;
}
```

Notes for the implementer:
- When `folderId` is absent, the emitted script is behavior-identical to today's (no `targetFolder`/`folderProjIds`, `keepT` is always `true`).
- A tag-task with no containing project (e.g. an inbox task) is **excluded** when folder-scoped — correct, since it isn't in the folder.
- `seenIds`/`matchCount` are only advanced for kept tasks, so `TOTAL` reflects the in-folder count.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/applescript/__tests__/review.test.ts -t "buildGetTasksByTagScript"`
Expected: PASS (all 7 tests in the block — 5 existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add src/applescript/review.ts src/applescript/__tests__/review.test.ts
git commit -m "feat: add optional folderId scoping to buildGetTasksByTagScript"
```

---

## Task 2: Thread `folderId` through the `get_tasks_by_tag` tool

**Files:**
- Modify: `src/tools/review.ts:115-140` (`get_tasks_by_tag` registration)
- Test: `src/tools/__tests__/_tool-schema.integration.test.ts` (add a `get_tasks_by_tag shape` describe block)

- [ ] **Step 1: Write the failing schema test**

Add this describe block inside the top-level `describe('tool schema integration …')` in `src/tools/__tests__/_tool-schema.integration.test.ts`. It mirrors the existing `get_projects shape` / `get_inbox_tasks shape` blocks and reuses the `z` / `zBool` imports already in the file:

```ts
  describe('get_tasks_by_tag shape', () => {
    const schema = z.object({
      tagNames: z.array(z.string()).min(1),
      limit: z.coerce.number().int().min(1).max(100).default(20),
      minAgeDays: z.coerce.number().int().min(0).optional(),
      sortByAge: zBool().default(false),
      folderId: z.string().optional(),
    });

    it('parses folderId alongside stringified aging params', () => {
      const r = schema.parse({ tagNames: ['Yuliya'], folderId: 'fld123', sortByAge: 'true', minAgeDays: '30' });
      expect(r.folderId).toBe('fld123');
      expect(r.sortByAge).toBe(true);
      expect(r.minAgeDays).toBe(30);
    });

    it('leaves folderId undefined when omitted', () => {
      const r = schema.parse({ tagNames: ['Yuliya'] });
      expect(r.folderId).toBeUndefined();
    });
  });
```

If `zBool` is not already imported in this test file, add it to the existing import from the same module the other blocks use (check the top of the file — `get_inbox_tasks shape` already relies on `zBool`).

- [ ] **Step 2: Run test to verify it fails (or confirm the schema mirror is correct)**

Run: `npx vitest run src/tools/__tests__/_tool-schema.integration.test.ts -t "get_tasks_by_tag shape"`
Expected: PASS for the schema mirror itself (this test validates the intended schema). It documents the contract; the real wiring is asserted by Step 4's full build + the tool change below. If it FAILS, fix the test's schema to match.

- [ ] **Step 3: Add `folderId` to the tool and pass it through**

In `src/tools/review.ts`, in the `get_tasks_by_tag` registration:

Add the param to the schema object (after `sortByAge`):

```ts
      sortByAge: zBool().default(false).describe('Sort returned tasks oldest-waiting first'),
      folderId: z.string().optional().describe('Restrict to tasks whose project lives in this folder (area of responsibility). Use to keep work and personal reviews separate.'),
```

Update the handler signature and the builder call:

```ts
    async ({ tagNames, limit, minAgeDays, sortByAge, folderId }) => {
      const aging = sortByAge || minAgeDays !== undefined;
      const fetchLimit = aging ? Math.max(limit, 500) : limit;
      const output = await runAppleScript(buildGetTasksByTagScript(tagNames, fetchLimit, folderId), 30_000);
```

Leave the rest of the handler (parse / aging / slice) unchanged.

- [ ] **Step 4: Build and run the full suite**

Run: `npm run build && npx vitest run`
Expected: PASS — TypeScript compiles (new param is optional, backward-compatible) and all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/tools/review.ts src/tools/__tests__/_tool-schema.integration.test.ts
git commit -m "feat: add folderId param to get_tasks_by_tag tool"
```

---

## Task 3: Document `folderId` on `get_tasks_by_tag` in the README

**Files:**
- Modify: `README.md` (the `get_tasks_by_tag` entry in the tool list)

- [ ] **Step 1: Locate the tool entry**

Run: `grep -n "get_tasks_by_tag" README.md`
Expected: a line describing the tool and its params (`minAgeDays`, `sortByAge`).

- [ ] **Step 2: Add the `folderId` param to its description**

Edit the `get_tasks_by_tag` README entry to append, in the same style as the existing param notes:

```
- `folderId` (optional): restrict to tasks whose project lives in this folder (area of responsibility), so work and personal commitment reviews stay separate. Mirrors `get_review_digest`'s `folderId`.
```

Do **not** change the tool count — this is a param addition, not a new tool (the count stays at 36).

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document folderId param on get_tasks_by_tag"
```

---

## Task 4: Author the `gtd-review` skill

**Files:**
- Create: `~/.claude/skills/gtd-review/SKILL.md`

This file is **outside the omnifocus-mcp repo** (personal config, alongside `~/.claude/skills/gtd-inbox-review/`). It is not committed to this repo.

- [ ] **Step 1: Create the skill directory**

```bash
mkdir -p ~/.claude/skills/gtd-review
```

- [ ] **Step 2: Write `~/.claude/skills/gtd-review/SKILL.md`**

Write the file with exactly this content:

````markdown
---
name: gtd-review
description: Review OmniFocus projects and commitments one at a time — backlog/weekly/daily modes over a single area (work OR personal, never mixed), using the review digest + commitment-aging tools. Use for weekly review, project portfolio review, clearing a review backlog, or a per-folder area review. Complements gtd-inbox-review (inbox tasks).
user-invocable: true
---

# GTD Review

Review OmniFocus **projects** and **waiting-for / owed commitments** one at a time. Complements `gtd-inbox-review` (which handles inbox *tasks*); this skill handles *projects* and *commitments*.

**Goal**: keep the project portfolio reviewed and commitments from slipping — without ever mixing work and personal in one sitting.

**Role**: you are the user's assistant. The user decides every action. Your job is to gather signals, present ONE recommendation, and wait. **Never call `complete_task` / `delete_task` or drop a project without an explicit "y"/"yes"/equivalent from the user for that specific item.** Digest/prefetched context is never permission.

## User-Facing Language — HARD STOP

These words MUST NEVER appear in user-facing messages: `slot`, `pipeline`, `prefetch`, `cache`/`cached`, `queue`, `rotation`, `digest`, `bucket`, raw OmniFocus IDs (e.g. `(jwii3wAKVG7)`).

Allowed: `Project N` / `Task N` (sequential counter), folders/projects by human name, "fetching" or silence while loading.

**Word choice**: say "**done**"/"complete" (with the right reason: shipped · superseded · bystander · moment-passed), never "trash." Never frame a live/active topic as "moment passed."

**Pre-send self-check (every user-facing message):** read your draft, scan for banned words (case-insensitive), rewrite if found.

## Step 0 — Resolve the AREA first (always, before any scan)

**Single-area discipline: work and personal never appear in the same review.**

Invocation: `/gtd-review [mode] [area]` where `mode` ∈ `backlog`|`weekly`|`daily`, `area` ∈ `work`|`personal`|folder.

| `area`     | Folder(s) to scan |
|------------|-------------------|
| `work`     | `32 Inworld` (`jwii3wAKVG7`) — one pass; recurses all `32.xx` |
| `personal` | `10-19 Life admin` (`opfl_ld1hDO`) **and** `20-29 Parent` (`dqR-9hwJuSq`) — one pass per root, results merged |
| folder/JD# | resolve via `reference_omnifocus_ids.md` first, else `get_folders(contains:true)`; **confirm the resolved folder name to the user before scanning** |

- **No `area`** → ask: "Work, personal, or a specific folder?" Never scan the whole database.
- `31 Companies` / `31.11 HOA` is **not** in `work` or `personal` — review it only when passed explicitly as a folder.

## Step 0b — Resolve the MODE

- Mode given → use it.
- No mode → after the area is set, run one `get_review_digest(scope:"due", folderId:<area>)` and propose:
  - many projects overdue for review → suggest **backlog**
  - a handful → suggest **weekly**
  - "just the hot list / what's urgent today" → suggest **daily**
  Confirm before proceeding.

## Shared contract (ALL modes)

- **Consent**: never `complete_task` / `delete_task` / drop without an explicit per-item "y". Always present the item + recommendation first, then wait. Reversible actions — `mark_project_reviewed`, move to `on hold`, set `reviewInterval`, add a `Planned` tag, rename, set defer date — may execute on a single "do it".
- **One item per turn.** Never batch multiple projects/commitments in one message.
- **Per-project decision menu**: confirm/add a `Planned` next action · complete (done) · move to `on hold` (someday/maybe) · drop · mark reviewed · tighten `reviewInterval` (esp. flagged/deadline projects).
- **Memory rules**: work projects → folder `jwii3wAKVG7`; person tags are `"First Last"` (verify with `get_tags(nameOnly:true)` before creating); `SRE-XXXX` projects are Jira epics — never demote to tasks; delegated tasks → create a follow-up, don't just complete; `Planned` tag for next actions, flag only critical+urgent+hard-deadline; always check `reference_omnifocus_ids.md` before a folder/project lookup; use trimmed lookups (`omitNotes`/`nameOnly`/`contains`).

## Prefetch model

The review scan **is** the prefetch: `get_review_digest` returns stall / Planned / deadline / last-activity signals for every project in one pass, so there is **no** A/B/C rotation. Spawn a background subagent only when a *single* project needs deeper context (read its tasks/notes via `get_project_tasks`, or resolve a linked doc) before a decision.

## Per-project presentation format

```
Project N of M: [name] — [folder name]
  [stalled: <reason> | available N · Planned N] · [deadline in D days, if any]
  · [last activity D days ago] · [review D days overdue][· flagged]
  Recommendation: [ONE action, stated plainly]
```

Wait for an explicit "y" before any complete/delete/drop.

## Mode: backlog (one-time, clear the review backlog)

1. Scan: `get_review_digest(scope:"all-active", folderId:<area>, limit:200)`. Paginate with `offset` until exhausted. For `personal`, run per root and merge.
2. Order projects by: **flagged first → deadline soonest (`daysUntilDue` asc) → most overdue for review (`daysOverdueForReview` desc)**; within a tier, surface stalled ones for attention.
3. **Walk every project one at a time** (track "Project N of M"):
   - Healthy (not stalled, `plannedCount > 0`): one-line presentation + quick "y" → `mark_project_reviewed`.
   - Stalled (`availableCount == 0`) or `plannedCount == 0`: full decision menu.
4. **Resumable**: `mark_project_reviewed` drops a project out of `scope:"due"`; if interrupted, re-invoke and continue. Never bulk-mark. Only if the user explicitly says "mark the rest reviewed" do you use `batch_mark_reviewed(projectIds:[…])`.

## Mode: weekly (steady-state deep review)

1. **Projects**: `get_review_digest(scope:"due", folderId:<area>)`, same ordering and one-at-a-time walk as backlog.
2. **Commitments (aging)**: resolve the `waiting for` tag spelling + relevant person tags via `get_tags(nameOnly:true)`, then `get_tasks_by_tag(tagNames:[…], folderId:<area>, sortByAge:true, minAgeDays:7)`. Classify each returned task by its tag list:
   - person tag **+** `waiting for` → **Delegated**: create a follow-up task to chase the person (`quick_entry`), don't just complete.
   - person tag, **no** `waiting for` → **Owed**: treat as your own next action — add `Planned` / schedule / do it.
3. **Next-action sweep**: surface any active project with `plannedCount == 0` for a "what's the next action?" decision.

## Mode: daily (light)

1. Area-scoped, fast:
   - Aging commitments: `get_tasks_by_tag(tagNames:[…], folderId:<area>, sortByAge:true, minAgeDays:7)` (same classification as weekly).
   - Newly-stalled projects: from `get_review_digest(scope:"all-active", folderId:<area>, onlyStalled:true)`, surface those whose `daysSinceActivity <= 7` (stalled *recently*).
   - Flagged / forecast: `get_flagged_tasks` and/or `get_forecast(days:1)`.
2. One item per turn.
3. **At the end**, offer (opt-in): "Want to run inbox review too?" — launch `gtd-inbox-review` only if the user says yes.

## OmniFocus action mapping

| Recommendation | Action |
|---|---|
| **Reviewed, healthy** | `mark_project_reviewed(projectId)` after "y" |
| **Done** (any reason) | `complete_task` (preferred) — only after explicit "y"; delete only on explicit confirmation |
| **Add next action** | `quick_entry` / `create_subtasks` into the project; tag `Planned` |
| **On hold (someday/maybe)** | `update_project(status:"on hold")` |
| **Drop** | `update_project(status:"dropped")` after explicit "y" (note: some statuses need manual OF cleanup if the MCP can't set them) |
| **Tighten review cadence** | `update_project(reviewInterval:…)` |
| **Delegated follow-up** | `quick_entry` "Follow up with [person] on [topic]"; tag person + `waiting for`; set defer date |

## Efficient lookups

- Find a folder/project: cached IDs in `reference_omnifocus_ids.md` first; else `get_folders(contains:true)` / `get_project_by_name(contains:true)`.
- Verify/find a person tag: `get_tags(nameOnly:true)` before assigning; never assume a tag exists.
- Read a project's tasks only when a decision needs them: `get_project_tasks(projectId, omitNotes:true)`.

## Edge cases

- **Empty project** (`incompleteCount == 0`, stalled `empty`): candidate for completion or a fresh next action — present the choice.
- **All-blocked/deferred** (stalled `blocked-or-deferred`): needs unblocking, not dropping.
- **No review interval / no next review date**: excluded from `scope:"due"`; visible under `scope:"all-active"`.
- **Personal area = two roots**: always run both `opfl_ld1hDO` and `dqR-9hwJuSq` and merge before ordering; don't stop after the first.
- **Interrupted backlog run**: re-invoke `/gtd-review backlog <area>`; reviewed projects no longer appear in `scope:"due"`.
````

- [ ] **Step 3: Verify the skill loads and frontmatter is valid**

Run: `head -5 ~/.claude/skills/gtd-review/SKILL.md`
Expected: valid YAML frontmatter (`name: gtd-review`, `description:`, `user-invocable: true`).

- [ ] **Step 4: Manual validation (single small area)**

In a Claude Code session, invoke `/gtd-review weekly 32.71` (the small "Learning & Growth" folder). Verify:
- The skill confirms the resolved folder name before scanning.
- It presents projects one at a time with the §presentation format.
- It never mixes in personal projects.
- It asks for an explicit "y" before any complete/drop.
- The aging pass uses `get_tasks_by_tag(..., folderId:"eYjmKJKfrty")` and stays inside the area.

Fix any wording/flow issues in `SKILL.md` directly, then re-run.

---

## Task 5: Open the PR for the repo changes

**Files:** none (git/gh only)

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feat/gtd-review-skill
```

- [ ] **Step 2: Open the PR**

```bash
gh pr create --title "feat: gtd-review skill support — folderId on get_tasks_by_tag" \
  --body "Phase 2 of the GTD review system. Adds an optional folderId filter to get_tasks_by_tag so the gtd-review skill's commitment-aging pass respects the work/personal boundary. Includes the skill design spec. The skill itself ships to ~/.claude/skills/gtd-review (personal config, not in this repo).

Spec: docs/superpowers/specs/2026-06-01-gtd-review-skill-design.md
Plan: docs/superpowers/plans/2026-06-01-gtd-review-skill.md"
```

- [ ] **Step 3: Watch CI**

Use `scripts/gh-pr.py checks` (or add the subcommand if missing, per repo CLAUDE.md) to confirm checks pass. Address failures before requesting review.

---

## Self-Review (done while writing this plan)

- **Spec coverage:** §3 area resolution → Task 4 Step 0; §4 single-area discipline → Task 4 Step 0 + aging `folderId`; §5 modes → Task 4 mode sections; §6 MCP change → Tasks 1–3; §7 contract → Task 4 "Shared contract"; §8 aging → weekly/daily aging steps; §9 prefetch → "Prefetch model"; §10 format → "Per-project presentation format"; §11 single-file structure → Task 4; §12 testing → Tasks 1–2 + Task 4 Step 4; §13 sequencing → task order. Covered.
- **Placeholder scan:** no TBD/TODO; all code blocks complete; AppleScript and TS shown in full.
- **Type consistency:** `buildGetTasksByTagScript(tagNames, limit, folderId?)` used identically in Task 1 (definition), Task 1 tests, and Task 2 (callsite). Tool param name `folderId` matches across schema, handler destructure, and README.
