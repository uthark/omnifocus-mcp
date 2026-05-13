# Agents guide — codebase orientation

Start here. This file is meant to save the next agent from re-exploring the codebase. When you discover something that would have helped you start faster, add it here.

## Layers

```
src/index.ts              Entry point — creates McpServer, registers tools, connects stdio transport
src/tools/*.ts            Tool registration — Zod schemas, calls AppleScript builders, parses output
src/applescript/*.ts      AppleScript builders — generate scripts, parse tab-delimited output
src/types.ts              Shared interfaces (OFTask, OFProject, OFTag, StaleTask, PaginatedResult)
src/config.ts             Inbox source config (system inbox, private project, work project)
```

## Where things live

| If you need to… | Look in… |
|---|---|
| Add a new tool | `src/tools/*.ts` (Zod schema + handler) + `src/applescript/*.ts` (script builder) |
| Change date handling | `src/applescript/dates.ts` — see [docs/date-formats.md](docs/date-formats.md) |
| Change a script's output format | `APPLESCRIPT_HELPERS` in `src/applescript/parser.ts` |
| Parse new output | `parsePaginatedTasks` / `parseProjects` / `parseFolders` / `parseStaleTasks` in `parser.ts` |
| Adjust inbox sources | `src/config.ts` (`inbox`, `private`, `work`) |
| Add a paginated query | `buildPaginatedTaskQuery` (whose-clause) or `buildOffsetTaskQuery` (offset/limit) |

## Data flow

1. MCP SDK dispatches tool call → `tools/*.ts` handler
2. Handler builds AppleScript string via `applescript/*.ts` builder
3. `executor.ts` runs script via `osascript` with configurable timeout (default 15s)
4. Builder or `parser.ts` parses tab-delimited stdout into typed objects
5. Handler returns JSON to MCP client

## AppleScript conventions

- Output format: tab-separated fields, newline-separated records
- Paginated results prefix output with `TOTAL:<count>\n`
- `APPLESCRIPT_HELPERS` (in `parser.ts`) provides shared handlers: `escapeField`, `replaceText`, `formatDate`, `getTagNames`, `taskRecord`
- `taskRecord` emits 18 tab-separated fields matching `OFTask` interface order
- All scripts wrapped in `tell application "OmniFocus" / tell default document`

## Shared templates in `parser.ts`

- **`buildPaginatedTaskQuery(whoseClause, limit, preamble)`** — for queries using `whose` clause filtering (overdue, forecast, completed). OmniFocus filters internally via a single Apple event. `preamble` is interpolated after a 4-space indent; multi-line preambles must indent line 2+ themselves to align.
- **`buildOffsetTaskQuery(taskSetup, offset, limit)`** — for offset/limit pagination over a pre-fetched task list. The `taskSetup` must assign to a variable named `allTasks`.
- **`parsePaginatedTasks(output)`** — parses `TOTAL:` header + task records into `PaginatedResult<OFTask>`
- **`parseProjects(output)`** — parses project records into `OFProject[]`
- **`parseStaleTasks(output)`** — parses lightweight stale task records (id, name, modDate)

## Pitfalls — read before touching AppleScript

These have all bitten us at least once. Don't re-discover them.

### 1. Never embed dates as strings in `date "..."`
AppleScript's `date "..."` constructor is locale-dependent and silently misinterprets ISO-style strings on `en_US` (e.g., `"2026-05-18"` parses to year 12186). Use `buildSetDateBlock` from `dates.ts`, which emits property-assignment AppleScript that bypasses the parser. Full write-up: [docs/date-formats.md](docs/date-formats.md).

### 2. Indexed vs unindexed properties for `whose` clauses
- **Indexed** (`completed`, `due date`, `completion date`): fast in `whose` clauses.
- **Unindexed** (`modification date`): `whose` works but scans every task. Scope per-project to keep the scan set small (see `get_stale_tasks`).

### 3. `count of` requires parentheses
```
count of flattened tasks of p whose completed is false   -- ERROR
count of (flattened tasks of p whose completed is false) -- OK
```
Without parens, AppleScript parses as `(count of flattened tasks of p) whose ...` and errors.

### 4. `review interval` is a record, not a number
It returns `{unit:week, steps:2, fixed:false}`. Extract numeric step count via `steps of (review interval of p)` wrapped in try/catch — some projects have no interval set.

### 5. AppleScript's reserved-ish short identifiers
Names like `st`, `id`, `name`, `date` can collide with the OmniFocus dictionary inside `tell` blocks. `set st to ...` was rejected as "Expected expression but found st" because `status` is a property in the OmniFocus suite. Use longer, distinctive variable names (`newSubtask`, `proj`, `t`, `_dv`).

Some standard AppleScript date properties — notably `day` — are also reclaimed by the OmniFocus tell scope. Trying `set day of _dv to 1` inside `tell application "OmniFocus"` errors with `Can't get day. Access not allowed. (-1723)`. Wrap any date-property arithmetic in `using terms from scripting additions … end using terms from` to restore the standard meaning. `buildSetDateBlock` already does this.

### 6. Per-item Apple events are slow (50–200ms each)
For large collections, prefer batch property fetching (`id of allTasks`) or `whose` clause filtering over iterating with per-item access.

### 7. AppleScript's `set day of d to N` and month-rollover
Setting `month` on a date whose `day` exceeds the target month's last day causes rollover (e.g., today=Mar 31, set month=Feb → date becomes Mar 3). Always `set day of d to 1` first, then year/month, then the desired day. See `buildSetDateBlock`.

### 8. MCP tool date writes — verify with `get_task`
Historically, date writes on existing tasks could silently fail (returned `success:true`, date unchanged). The current property-assignment implementation fixes this — but if you change date-setting code, end-to-end verify by reading the task back after a write.

## Testing

Tests live in `src/applescript/__tests__/` and `src/tools/__tests__/`. They verify:
- Script generation (correct AppleScript syntax, embedded parameters)
- Output parsing (tab splitting, field mapping, pagination)
- Schema integration (tool definitions are well-formed)

Run with `npm test` (vitest). End-to-end behavior against a real OmniFocus database is not exercised by the test suite — verify manually for date/state changes.

## Inbox sources

Configured in `config.ts`:
- `inbox` — OmniFocus system inbox
- `private` — Project named `---`
- `work` — Project named `32.01 Work Inbox`

## When you discover something new

Add it here. The cost of writing one paragraph for the next agent is much smaller than the cost of every future agent re-exploring. Specifically:

- Surprising AppleScript syntax → § Pitfalls
- New script template / helper → § Shared templates
- New layer / file → § Layers + § Where things live
- New deep dive → cross-link to a doc under `docs/`
