# Architecture

## Layers

```
src/index.ts              Entry point — creates McpServer, registers tools, connects stdio transport
src/tools/*.ts            Tool registration — Zod schemas, calls AppleScript builders, parses output
src/applescript/*.ts      AppleScript builders — generate scripts, parse tab-delimited output
src/types.ts              Shared interfaces (OFTask, OFProject, OFTag, StaleTask, PaginatedResult)
src/config.ts             Inbox source config (system inbox, private project, work project)
```

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
- `taskRecord` emits 12 tab-separated fields matching `OFTask` interface order
- All scripts wrapped in `tell application "OmniFocus" / tell default document`

## Shared templates in `parser.ts`

- **`buildPaginatedTaskQuery(whoseClause, limit, preamble)`** — for queries using `whose` clause filtering (overdue, forecast, completed). OmniFocus filters internally via a single Apple event.
- **`buildOffsetTaskQuery(taskSetup, offset, limit)`** — for offset/limit pagination over a pre-fetched task list. The `taskSetup` must assign to a variable named `allTasks`.
- **`parsePaginatedTasks(output)`** — parses `TOTAL:` header + task records into `PaginatedResult<OFTask>`
- **`parseProjects(output)`** — parses project records into `OFProject[]`
- **`parseStaleTasks(output)`** — parses lightweight stale task records (id, name, modDate)

## Performance constraints

- **Indexed properties** (`completed`, `due date`, `completion date`): fast in `whose` clauses
- **Unindexed properties** (`modification date`): `whose` clause works but scans all tasks. `get_stale_tasks` is scoped per-project to keep scan set small.
- **Per-item Apple events** are slow (~50-200ms each). Use batch property fetching (`id of allTasks`) or `whose` clause filtering instead of iterating.
- **`count of` parenthesization**: `count of (flattened tasks of p whose completed is false)` — without parens, AppleScript parses it as `(count of flattened tasks of p) whose ...` which errors.
- **`review interval`** is a record `{unit, steps, fixed}`, not a number. Extract via `steps of (review interval of p)` with try/catch.

## Testing

Tests live in `src/applescript/__tests__/`. They verify:
- Script generation (correct AppleScript syntax, embedded parameters)
- Output parsing (tab splitting, field mapping, pagination)

Run with `npm test` (vitest).

## Inbox sources

Configured in `config.ts`:
- `inbox` — OmniFocus system inbox
- `private` — Project named `---`
- `work` — Project named `32.01 Work Inbox`
