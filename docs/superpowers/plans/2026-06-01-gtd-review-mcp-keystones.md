# GTD Review MCP Keystones — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the server-side MCP keystones that make reviewing 200+ OmniFocus projects tractable — a one-pass enriched review digest (with stall, next-action, deadline, and activity signals), waiting-for/commitment aging on `get_tasks_by_tag`, and `batch_mark_reviewed`.

**Architecture:** Each tool follows the existing 3-layer split: an AppleScript-builder (`src/applescript/review.ts`) → a pure parser (`src/applescript/parser.ts`) → a registered tool (`src/tools/review.ts`). Heavy set-computation (per-project task scans) runs in a single AppleScript pass; date arithmetic and aging run in testable TypeScript. No new OmniFocus data model.

**Tech Stack:** TypeScript (ESM, `.js` import suffixes), Zod (with `zBool()` from `src/tools/_schema.ts`), Vitest, AppleScript via `runAppleScript`.

**Spec:** `docs/superpowers/specs/2026-06-01-gtd-review-system-design.md` (§4 only — skill + cadence are out of scope for this plan).

---

## File Structure

- `src/types.ts` — add `ReviewDigestEntry` interface.
- `src/applescript/review.ts` — add `buildGetReviewDigestScript`, `buildBatchMarkReviewedScript`.
- `src/applescript/parser.ts` — add `parseReviewDigest` + private `diffDays`; extend the type import.
- `src/tools/_aging.ts` — **new**: `daysWaiting`, `withDaysWaiting`, `filterAndSortByAge`, `AgedTask` (tool-layer transform, sibling to `_compact.ts`).
- `src/tools/review.ts` — register `get_review_digest` + `batch_mark_reviewed`; extend `get_tasks_by_tag` with `minAgeDays`/`sortByAge`.
- `src/applescript/__tests__/review.test.ts` — builder tests.
- `src/applescript/__tests__/parser.test.ts` — `parseReviewDigest` tests.
- `src/tools/__tests__/_aging.test.ts` — **new**: aging-helper tests.
- `README.md` — Review tool list + header count `34 → 36`.

**Performance note (carry into review):** `get_review_digest` loops every incomplete task of every candidate project once (for `availableCount`, `plannedCount`, `lastActivity`). On very large databases the per-task `getTagNames` call is the heaviest part. We use a 60s timeout. If it proves too slow in practice, the documented fallback (NOT built now, per YAGNI) is to gate `plannedCount`/`lastActivity` behind an `enrich` flag — see spec §4.1.

---

## Task 1: `get_review_digest` AppleScript builder

**Files:**
- Modify: `src/applescript/review.ts` (add `buildGetReviewDigestScript`)
- Test: `src/applescript/__tests__/review.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/applescript/__tests__/review.test.ts`. First add the import to the existing import block from `'../review.js'`:

```typescript
  buildGetReviewDigestScript,
```

Then append this describe block:

```typescript
describe('buildGetReviewDigestScript', () => {
  const base = { scope: 'due' as const, includeOnHold: false, onlyStalled: false, limit: 200, offset: 0 };

  it('scope=due filters by next review date', () => {
    const script = buildGetReviewDigestScript(base);
    expect(script).toContain('next review date');
    expect(script).toContain('current date');
  });

  it('scope=all-active does not filter by review date in the guard', () => {
    const script = buildGetReviewDigestScript({ ...base, scope: 'all-active' });
    expect(script).not.toContain('next review date of p >=');
  });

  it('defaults to active projects only', () => {
    const script = buildGetReviewDigestScript(base);
    expect(script).toContain('whose status is active');
  });

  it('includeOnHold widens the status clause', () => {
    const script = buildGetReviewDigestScript({ ...base, includeOnHold: true });
    expect(script).toContain('on hold');
  });

  it('onlyStalled adds an availability guard', () => {
    const script = buildGetReviewDigestScript({ ...base, onlyStalled: true });
    expect(script).toContain('if availCount > 0 then set includeP to false');
  });

  it('scopes to a folder when folderId is given', () => {
    const script = buildGetReviewDigestScript({ ...base, folderId: 'fld123' });
    expect(script).toContain('fld123');
    expect(script).toContain('flattened projects of targetFolder');
  });

  it('counts Planned next actions and computes availability', () => {
    const script = buildGetReviewDigestScript(base);
    expect(script).toContain(',Planned,');
    expect(script).toContain('effective defer date');
    expect(script).toContain('blocked of t is false');
  });

  it('emits a TOTAL header and honors limit/offset', () => {
    const script = buildGetReviewDigestScript({ ...base, limit: 50, offset: 10 });
    expect(script).toContain('"TOTAL:"');
    expect(script).toContain('emitted < 50');
    expect(script).toContain('matchCount > 10');
  });

  it('includes the APPLESCRIPT_HELPERS', () => {
    const script = buildGetReviewDigestScript(base);
    expect(script).toContain('escapeField');
    expect(script).toContain('getTagNames');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/applescript/__tests__/review.test.ts -t buildGetReviewDigestScript`
Expected: FAIL — `buildGetReviewDigestScript is not a function` (import error / undefined).

- [ ] **Step 3: Implement the builder**

Add to `src/applescript/review.ts`. The file already imports `escapeForAppleScript` and `APPLESCRIPT_HELPERS`; reuse them. Append this function:

```typescript
export function buildGetReviewDigestScript(options: {
  scope: 'due' | 'all-active';
  folderId?: string;
  includeOnHold: boolean;
  onlyStalled: boolean;
  limit: number;
  offset: number;
}): string {
  const statusClause = options.includeOnHold
    ? 'status is active or status is on hold'
    : 'status is active';
  const projectSet = options.folderId
    ? `set targetFolder to first flattened folder whose id is "${escapeForAppleScript(options.folderId)}"
    set candidates to (flattened projects of targetFolder whose ${statusClause})`
    : `set candidates to (flattened projects whose ${statusClause})`;
  const dueGuard = options.scope === 'due'
    ? `if (next review date of p is missing value) or (next review date of p >= now) then set includeP to false`
    : '';
  const stalledGuard = options.onlyStalled
    ? `if availCount > 0 then set includeP to false`
    : '';
  return `
tell application "OmniFocus"
  tell default document
    set now to current date
    ${projectSet}
    set matchCount to 0
    set emitted to 0
    set output to ""
    repeat with p in candidates
      set includeP to true
      ${dueGuard}
      if includeP then
        set incompleteTasks to (flattened tasks of p whose completed is false)
        set incompleteCount to count of incompleteTasks
        set availCount to 0
        set plannedCount to 0
        set lastAct to missing value
        repeat with t in incompleteTasks
          set md to modification date of t
          if lastAct is missing value or md > lastAct then set lastAct to md
          set tnames to my getTagNames(t)
          if ("," & tnames & ",") contains ",Planned," then set plannedCount to plannedCount + 1
          if blocked of t is false then
            set effDefer to effective defer date of t
            if effDefer is missing value or effDefer < now then set availCount to availCount + 1
          end if
        end repeat
        if lastAct is missing value then set lastAct to modification date of p
        ${stalledGuard}
        if includeP then
          set matchCount to matchCount + 1
          if matchCount > ${options.offset} and emitted < ${options.limit} then
            set projId to id of p
            set projName to my escapeField(name of p)
            set folderName to ""
            try
              set c to container of p
              if class of c is folder then set folderName to my escapeField(name of c)
            end try
            set projStatus to status of p as text
            set isFlagged to flagged of p
            set duDate to my formatDate(due date of p)
            set lastActStr to my formatDate(lastAct)
            set revDate to my formatDate(next review date of p)
            set output to output & projId & tab & projName & tab & folderName & tab & projStatus & tab & isFlagged & tab & duDate & tab & incompleteCount & tab & availCount & tab & plannedCount & tab & lastActStr & tab & revDate & linefeed
            set emitted to emitted + 1
          end if
        end if
      end if
    end repeat
    return "TOTAL:" & matchCount & linefeed & output
  end tell
end tell
${APPLESCRIPT_HELPERS}`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/applescript/__tests__/review.test.ts -t buildGetReviewDigestScript`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/applescript/review.ts src/applescript/__tests__/review.test.ts
git commit -m "feat: add get_review_digest AppleScript builder"
```

---

## Task 2: `ReviewDigestEntry` type + `parseReviewDigest` parser

**Files:**
- Modify: `src/types.ts` (add interface)
- Modify: `src/applescript/parser.ts` (add parser + `diffDays`; extend type import)
- Test: `src/applescript/__tests__/parser.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/applescript/__tests__/parser.test.ts`. If `parseReviewDigest` is not already imported there, add it to the import from `'../parser.js'`:

```typescript
import { parseReviewDigest } from '../parser.js';
```

Then add:

```typescript
describe('parseReviewDigest', () => {
  const now = new Date('2026-06-01T00:00:00');

  it('parses an enriched, stalled (blocked) project row', () => {
    const output = [
      'TOTAL:1',
      'p1\tMy Project\tWork\tactive status\ttrue\t2026-06-08T00:00:00\t5\t0\t0\t2026-03-01T00:00:00\t2026-05-01T00:00:00',
    ].join('\n');
    const r = parseReviewDigest(output, now);
    expect(r.total).toBe(1);
    const e = r.items[0];
    expect(e.id).toBe('p1');
    expect(e.name).toBe('My Project');
    expect(e.folder).toBe('Work');
    expect(e.status).toBe('active');
    expect(e.flagged).toBe(true);
    expect(e.dueDate).toBe('2026-06-08T00:00:00');
    expect(e.daysUntilDue).toBe(7);
    expect(e.incompleteCount).toBe(5);
    expect(e.availableCount).toBe(0);
    expect(e.plannedCount).toBe(0);
    expect(e.stalled).toBe(true);
    expect(e.stallReason).toBe('blocked-or-deferred');
    expect(e.daysSinceActivity).toBe(92);
    expect(e.daysOverdueForReview).toBe(31);
  });

  it('classifies an empty project as stalled/empty with null dates', () => {
    const output = [
      'TOTAL:1',
      'p2\tEmpty\t\tactive status\tfalse\t\t0\t0\t0\t2026-05-20T00:00:00\t',
    ].join('\n');
    const e = parseReviewDigest(output, now).items[0];
    expect(e.folder).toBeNull();
    expect(e.flagged).toBe(false);
    expect(e.dueDate).toBeNull();
    expect(e.daysUntilDue).toBeNull();
    expect(e.stalled).toBe(true);
    expect(e.stallReason).toBe('empty');
    expect(e.nextReviewDate).toBeNull();
    expect(e.daysOverdueForReview).toBeNull();
  });

  it('a project with available actions is not stalled', () => {
    const output = [
      'TOTAL:1',
      'p3\tHealthy\tHome\tactive status\tfalse\t\t4\t2\t1\t2026-05-31T00:00:00\t2026-06-15T00:00:00',
    ].join('\n');
    const e = parseReviewDigest(output, now).items[0];
    expect(e.availableCount).toBe(2);
    expect(e.plannedCount).toBe(1);
    expect(e.stalled).toBe(false);
    expect(e.stallReason).toBeNull();
    expect(e.daysOverdueForReview).toBe(-14);
  });

  it('returns empty for a zero-match digest', () => {
    const r = parseReviewDigest('TOTAL:0\n', now);
    expect(r.total).toBe(0);
    expect(r.items).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/applescript/__tests__/parser.test.ts -t parseReviewDigest`
Expected: FAIL — `parseReviewDigest is not a function`.

- [ ] **Step 3: Add the type**

In `src/types.ts`, append after the `OFProject` interface:

```typescript
export interface ReviewDigestEntry {
  id: string;
  name: string;
  folder: string | null;
  status: OFProject['status'];
  flagged: boolean;
  dueDate: string | null;
  daysUntilDue: number | null;
  incompleteCount: number;
  availableCount: number;
  plannedCount: number;
  stalled: boolean;
  stallReason: 'empty' | 'blocked-or-deferred' | null;
  lastActivityDate: string | null;
  daysSinceActivity: number | null;
  nextReviewDate: string | null;
  daysOverdueForReview: number | null;
}
```

- [ ] **Step 4: Implement the parser**

In `src/applescript/parser.ts`, extend the first import line to include the new type:

```typescript
import type { OFFolder, OFProject, OFTask, ReviewDigestEntry, StaleTask, PaginatedResult } from '../types.js';
```

Then add, right after the existing `parseProjects` function:

```typescript
function diffDays(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / 86_400_000);
}

export function parseReviewDigest(output: string, now: Date = new Date()): PaginatedResult<ReviewDigestEntry> {
  const { total, lines } = parsePaginatedOutput(output);
  const items = lines.map((line) => {
    const f = splitFields(line);
    const incompleteCount = parseInt(f[6] ?? '0', 10);
    const availableCount = parseInt(f[7] ?? '0', 10);
    const plannedCount = parseInt(f[8] ?? '0', 10);
    const dueDate = f[5] || null;
    const lastActivityDate = f[9] || null;
    const nextReviewDate = f[10] || null;
    const stalled = availableCount === 0;
    const stallReason: ReviewDigestEntry['stallReason'] = stalled
      ? (incompleteCount === 0 ? 'empty' : 'blocked-or-deferred')
      : null;
    return {
      id: f[0] ?? '',
      name: unescapeField(f[1] ?? ''),
      folder: f[2] ? unescapeField(f[2]) : null,
      status: ((f[3] ?? 'active').replace(' status', '')) as OFProject['status'],
      flagged: f[4] === 'true',
      dueDate,
      daysUntilDue: dueDate ? diffDays(new Date(dueDate), now) : null,
      incompleteCount,
      availableCount,
      plannedCount,
      stalled,
      stallReason,
      lastActivityDate,
      daysSinceActivity: lastActivityDate ? diffDays(now, new Date(lastActivityDate)) : null,
      nextReviewDate,
      daysOverdueForReview: nextReviewDate ? diffDays(now, new Date(nextReviewDate)) : null,
    };
  });
  return { total, items };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/applescript/__tests__/parser.test.ts -t parseReviewDigest`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/applescript/parser.ts src/applescript/__tests__/parser.test.ts
git commit -m "feat: add ReviewDigestEntry type and parseReviewDigest parser"
```

---

## Task 3: Register the `get_review_digest` tool

**Files:**
- Modify: `src/tools/review.ts`

- [ ] **Step 1: Extend imports**

In `src/tools/review.ts`, add `buildGetReviewDigestScript` to the import from `'../applescript/review.js'`, add `parseReviewDigest` to the import from `'../applescript/parser.js'`, and add a `zBool` import:

```typescript
import { zBool } from './_schema.js';
```

- [ ] **Step 2: Register the tool**

Inside `registerReviewTools`, add (e.g. right after the `get_projects_due_for_review` registration):

```typescript
  server.tool(
    'get_review_digest',
    'Portfolio review digest: one row per project with stall, next-action (Planned), deadline, and last-activity signals for fast GTD weekly-review triage. scope=due returns projects past their review date; scope=all-active returns every active project (use for the one-time backlog pass).',
    {
      scope: z.enum(['due', 'all-active']).default('due').describe('due = past review date; all-active = every active project'),
      folderId: z.string().optional().describe('Restrict the scan to a single folder (area of responsibility)'),
      includeOnHold: zBool().default(false).describe('Include on-hold (someday/maybe) projects'),
      onlyStalled: zBool().default(false).describe('Only return projects with no available next action'),
      limit: z.coerce.number().int().min(1).max(500).default(200).describe('Max projects to return'),
      offset: z.coerce.number().int().min(0).default(0).describe('Pagination offset'),
    },
    async ({ scope, folderId, includeOnHold, onlyStalled, limit, offset }) => {
      const output = await runAppleScript(
        buildGetReviewDigestScript({ scope, folderId, includeOnHold, onlyStalled, limit, offset }),
        60_000,
      );
      const result = parseReviewDigest(output);
      return { content: [{ type: 'text', text: compactJson(result) }] };
    },
  );
```

- [ ] **Step 3: Build and run the full suite**

Run: `npm run build && npm test`
Expected: build succeeds; all existing tests PASS (the integration suite reconstructs schema shapes per-tool and does not enumerate tools, so it neither breaks nor auto-covers the new tool — builder/parser coverage from Tasks 1–2 is the safety net).

- [ ] **Step 4: Commit**

```bash
git add src/tools/review.ts
git commit -m "feat: register get_review_digest tool"
```

---

## Task 4: `batch_mark_reviewed` AppleScript builder

**Files:**
- Modify: `src/applescript/review.ts`
- Test: `src/applescript/__tests__/review.test.ts`

- [ ] **Step 1: Write the failing tests**

Add `buildBatchMarkReviewedScript` to the `'../review.js'` import in `src/applescript/__tests__/review.test.ts`, then append:

```typescript
describe('buildBatchMarkReviewedScript', () => {
  it('includes every project id', () => {
    const script = buildBatchMarkReviewedScript(['a1', 'b2', 'c3']);
    expect(script).toContain('a1');
    expect(script).toContain('b2');
    expect(script).toContain('c3');
  });

  it('marks each project reviewed and counts successes', () => {
    const script = buildBatchMarkReviewedScript(['a1']);
    expect(script).toContain('mark reviewed');
    expect(script).toContain('okCount');
  });

  it('escapes quotes in ids', () => {
    const script = buildBatchMarkReviewedScript(['weird"id']);
    expect(script).toContain('\\"id');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/applescript/__tests__/review.test.ts -t buildBatchMarkReviewedScript`
Expected: FAIL — `buildBatchMarkReviewedScript is not a function`.

- [ ] **Step 3: Implement the builder**

Append to `src/applescript/review.ts`:

```typescript
export function buildBatchMarkReviewedScript(projectIds: string[]): string {
  const list = projectIds.map((id) => `"${escapeForAppleScript(id)}"`).join(', ');
  return `
tell application "OmniFocus"
  tell default document
    set projIds to {${list}}
    set okCount to 0
    repeat with pid in projIds
      try
        set proj to first flattened project whose id is (pid as text)
        mark reviewed proj
        set okCount to okCount + 1
      end try
    end repeat
    return okCount as text
  end tell
end tell`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/applescript/__tests__/review.test.ts -t buildBatchMarkReviewedScript`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/applescript/review.ts src/applescript/__tests__/review.test.ts
git commit -m "feat: add batch_mark_reviewed AppleScript builder"
```

---

## Task 5: Register the `batch_mark_reviewed` tool

**Files:**
- Modify: `src/tools/review.ts`

- [ ] **Step 1: Extend imports**

Add `buildBatchMarkReviewedScript` to the `'../applescript/review.js'` import in `src/tools/review.ts`.

- [ ] **Step 2: Register the tool**

Inside `registerReviewTools`, add (e.g. right after the `mark_project_reviewed` registration):

```typescript
  server.tool(
    'batch_mark_reviewed',
    'Mark multiple projects as reviewed in a single pass (resets their review timers). Use to bulk-clear the healthy remainder during a review sweep.',
    {
      projectIds: z.array(z.string()).min(1).describe('OmniFocus project IDs to mark reviewed'),
    },
    async ({ projectIds }) => {
      const output = await runAppleScript(buildBatchMarkReviewedScript(projectIds), 60_000);
      const reviewedCount = parseInt(output.trim(), 10) || 0;
      return { content: [{ type: 'text', text: compactJson({ success: true, reviewedCount }) }] };
    },
  );
```

- [ ] **Step 3: Build and run the full suite**

Run: `npm run build && npm test`
Expected: build succeeds; all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/tools/review.ts
git commit -m "feat: register batch_mark_reviewed tool"
```

---

## Task 6: Commitment-aging helper (`_aging.ts`)

**Files:**
- Create: `src/tools/_aging.ts`
- Test: `src/tools/__tests__/_aging.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/tools/__tests__/_aging.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { OFTask } from '../../types.js';
import { daysWaiting, withDaysWaiting, filterAndSortByAge } from '../_aging.js';

const now = new Date('2026-06-01T00:00:00');

function makeTask(over: Partial<OFTask>): OFTask {
  return {
    id: 'x', name: 'x', note: '', creationDate: '2026-01-01T00:00:00',
    modificationDate: '2026-01-01T00:00:00', dueDate: null, deferDate: null,
    plannedDate: null, flagged: false, completed: false, completionDate: null,
    projectName: null, tags: [], recurrence: null, repetitionSchedule: null,
    repetitionBasedOn: null, catchUpAutomatically: null, estimatedMinutes: null,
    ...over,
  };
}

describe('daysWaiting', () => {
  it('uses defer date when present', () => {
    expect(daysWaiting(makeTask({ deferDate: '2026-05-01T00:00:00' }), now)).toBe(31);
  });

  it('falls back to creation date when no defer date', () => {
    expect(daysWaiting(makeTask({ creationDate: '2026-04-01T00:00:00' }), now)).toBe(61);
  });
});

describe('withDaysWaiting', () => {
  it('attaches daysWaiting without dropping fields', () => {
    const aged = withDaysWaiting(makeTask({ name: 'Chase Bob', deferDate: '2026-05-22T00:00:00' }), now);
    expect(aged.name).toBe('Chase Bob');
    expect(aged.daysWaiting).toBe(10);
  });
});

describe('filterAndSortByAge', () => {
  const tasks = [
    withDaysWaiting(makeTask({ id: 'recent', deferDate: '2026-05-25T00:00:00' }), now), // 7
    withDaysWaiting(makeTask({ id: 'old', deferDate: '2026-03-01T00:00:00' }), now),     // 92
    withDaysWaiting(makeTask({ id: 'mid', deferDate: '2026-05-01T00:00:00' }), now),     // 31
  ];

  it('filters by minAgeDays', () => {
    const out = filterAndSortByAge(tasks, { minAgeDays: 30 });
    expect(out.map((t) => t.id).sort()).toEqual(['mid', 'old']);
  });

  it('sorts oldest first when sortByAge', () => {
    const out = filterAndSortByAge(tasks, { sortByAge: true });
    expect(out.map((t) => t.id)).toEqual(['old', 'mid', 'recent']);
  });

  it('returns input unchanged when no options given', () => {
    const out = filterAndSortByAge(tasks, {});
    expect(out).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/tools/__tests__/_aging.test.ts`
Expected: FAIL — cannot find module `'../_aging.js'`.

- [ ] **Step 3: Implement the helper**

Create `src/tools/_aging.ts`:

```typescript
import type { OFTask } from '../types.js';

export interface AgedTask extends OFTask {
  daysWaiting: number;
}

/** Days since the task started waiting: from its defer date if set, else its creation date. */
export function daysWaiting(task: OFTask, now: Date = new Date()): number {
  const ref = task.deferDate ?? task.creationDate;
  return Math.floor((now.getTime() - new Date(ref).getTime()) / 86_400_000);
}

export function withDaysWaiting(task: OFTask, now: Date = new Date()): AgedTask {
  return { ...task, daysWaiting: daysWaiting(task, now) };
}

export function filterAndSortByAge(
  tasks: AgedTask[],
  opts: { minAgeDays?: number; sortByAge?: boolean },
): AgedTask[] {
  let out = tasks;
  if (opts.minAgeDays !== undefined) {
    out = out.filter((t) => t.daysWaiting >= opts.minAgeDays!);
  }
  if (opts.sortByAge) {
    out = [...out].sort((a, b) => b.daysWaiting - a.daysWaiting);
  }
  return out;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/tools/__tests__/_aging.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/tools/_aging.ts src/tools/__tests__/_aging.test.ts
git commit -m "feat: add commitment-aging helper (daysWaiting, filter/sort by age)"
```

---

## Task 7: Wire aging into `get_tasks_by_tag`

**Files:**
- Modify: `src/tools/review.ts` (extend the existing `get_tasks_by_tag` registration)

**Context:** The existing `get_tasks_by_tag` builder already returns each task's creation/defer dates and tag list, so aging needs no AppleScript change. When aging is requested we fetch a larger internal window (so sort/filter is accurate, not limited to the first `limit` in list order), then filter/sort/truncate in TypeScript. The returned task list keeps its tags, so the skill can classify direction (delegated `waiting for` vs owed bare-person-tag) from the same payload.

- [ ] **Step 1: Extend imports**

In `src/tools/review.ts`, add:

```typescript
import { withDaysWaiting, filterAndSortByAge } from './_aging.js';
```

- [ ] **Step 2: Replace the `get_tasks_by_tag` registration**

Find the existing `get_tasks_by_tag` `server.tool(...)` call and replace it with:

```typescript
  server.tool(
    'get_tasks_by_tag',
    'List incomplete tasks that have any of the specified tags. Use for GTD context lists like @waiting_for, @errands, @agenda, or person tags. Pass sortByAge/minAgeDays to surface aging commitments oldest-first (each task includes daysWaiting and its full tag list, so callers can tell "waiting on someone" from "owed to someone").',
    {
      tagNames: z.array(z.string()).min(1).describe('Tag names to filter by (returns tasks matching ANY of these tags)'),
      limit: z.coerce.number().int().min(1).max(100).default(20).describe('Max tasks to return'),
      minAgeDays: z.coerce.number().int().min(0).optional().describe('Only return tasks that have been waiting at least this many days (by defer date, else creation date)'),
      sortByAge: zBool().default(false).describe('Sort returned tasks oldest-waiting first'),
    },
    async ({ tagNames, limit, minAgeDays, sortByAge }) => {
      const aging = sortByAge || minAgeDays !== undefined;
      const fetchLimit = aging ? Math.max(limit, 500) : limit;
      const output = await runAppleScript(buildGetTasksByTagScript(tagNames, fetchLimit), 30_000);
      const parsed = parsePaginatedTasks(output);
      if (!aging) {
        return { content: [{ type: 'text', text: compactJson(parsed) }] };
      }
      const aged = parsed.items.map((t) => withDaysWaiting(t));
      const filtered = filterAndSortByAge(aged, { minAgeDays, sortByAge });
      const result = { total: filtered.length, items: filtered.slice(0, limit) };
      return { content: [{ type: 'text', text: compactJson(result) }] };
    },
  );
```

- [ ] **Step 3: Build and run the full suite**

Run: `npm run build && npm test`
Expected: build succeeds; all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/tools/review.ts
git commit -m "feat: add minAgeDays/sortByAge commitment aging to get_tasks_by_tag"
```

---

## Task 8: Update README and final verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the tool count header**

In `README.md` line 30, change:

```markdown
## Tools (34 total)
```

to:

```markdown
## Tools (36 total)
```

- [ ] **Step 2: Update the Review section**

Replace the existing `get_tasks_by_tag` bullet and add the two new tools so the Review list reads:

```markdown
- **get_projects_due_for_review** — Projects past their review date
- **get_review_digest** — One row per project with stall / next-action (Planned) / deadline / last-activity signals; `scope=due` or `all-active`, optional `folderId`, `onlyStalled`, pagination — the engine for weekly review and the one-time backlog pass
- **mark_project_reviewed** — Reset review timer
- **batch_mark_reviewed** — Reset review timers for many projects in one call
- **get_stale_tasks** — Tasks in a project not modified for N days
- **get_overdue_tasks** — Tasks past due date
- **get_forecast** — Tasks due in the next N days
- **get_completed_tasks** — Tasks completed since a given date
- **get_flagged_tasks** — List all flagged incomplete tasks (your "hot list")
- **get_available_tasks** — List actionable tasks in a project (not blocked, not deferred)
- **get_tasks_by_tag** — List incomplete tasks matching any of the given tags (e.g., @waiting_for, @errands); `sortByAge`/`minAgeDays` surface aging commitments with a `daysWaiting` field
```

- [ ] **Step 3: Full verification**

Run: `npm run build && npm test`
Expected: build succeeds; entire suite PASS, zero failures.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document get_review_digest, batch_mark_reviewed, and get_tasks_by_tag aging (36 tools)"
```

---

## Done criteria

- `npm run build` clean; `npm test` fully green.
- Three capabilities shipped: `get_review_digest`, `batch_mark_reviewed`, and `get_tasks_by_tag` aging.
- README reflects 36 tools.
- Live smoke test against OmniFocus (manual, post-merge): `get_review_digest scope=all-active onlyStalled=true` returns stalled projects; `get_tasks_by_tag tagNames=["waiting for"] sortByAge=true` returns oldest-first commitments. (AppleScript-touching tools can only be unit-tested at the builder/parser layer; end-to-end requires a live OmniFocus.)

## Out of scope (later plans)

- The `gtd-review` skill (backlog / weekly / daily modes) — spec §5.
- Recurring calendar-event cadence — spec §6.
- The one-time 200-project backlog remediation run — spec §7.
