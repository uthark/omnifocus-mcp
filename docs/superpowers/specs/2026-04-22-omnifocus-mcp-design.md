# OmniFocus MCP Server — Design Spec

## Problem

User has ~2,000 tasks in OmniFocus with several hundred unprocessed inbox items. Weekly reviews aren't happening consistently because the backlog is overwhelming. An MCP server would let Claude guide the user through GTD weekly reviews conversationally — processing inbox items, reviewing projects, cleaning up stale tasks — in manageable batches.

## Architecture

TypeScript MCP server using `@modelcontextprotocol/sdk`. Runs as a stdio-based server launched by Claude Code.

```
Claude Code <-> MCP Server (TypeScript/Node) <-> osascript <-> OmniFocus
```

- **Stateless** — OmniFocus is the sole source of truth. No database or local state.
- **AppleScript bridge** — all OmniFocus interactions go through `osascript` via `execFile` (not `exec`, to avoid shell injection).
- **Same-machine only** — OmniFocus runs on the same Mac as the MCP server.

## MCP Tools

### Inbox Processing

The user has multiple inboxes: the OmniFocus system inbox plus "private inbox" and "work inbox" projects that function as additional inboxes. All inbox tools accept a `source` parameter to select which inbox to process.

| Tool | Description | Parameters |
|------|-------------|------------|
| `get_inbox_tasks` | List inbox items with pagination | `source?` ("inbox", "private", "work"; default "inbox"), `offset?`, `limit?` (default 20) |
| `process_inbox_task` | Move inbox task to project, assign tags, set dates | `taskId`, `projectId?`, `tags?`, `deferDate?`, `dueDate?`, `flagged?` |
| `quick_entry` | Create a new task | `name`, `note?`, `projectId?`, `tags?`, `deferDate?`, `dueDate?`, `flagged?` |

When `source` is "private" or "work", `get_inbox_tasks` reads tasks from the corresponding project instead of the OmniFocus system inbox.

### Task Management

| Tool | Description | Parameters |
|------|-------------|------------|
| `complete_task` | Mark task as completed | `taskId` |
| `delete_task` | Delete a task | `taskId` |
| `update_task` | Modify task properties | `taskId`, `name?`, `note?`, `tags?`, `deferDate?`, `dueDate?`, `flagged?` |
| `create_subtasks` | Break a task into subtasks | `taskId`, `subtasks` (array of {name, note?}) |

### Project Management

| Tool | Description | Parameters |
|------|-------------|------------|
| `get_projects` | List projects with status, task counts, last review date | `status?` (active/on hold/completed), `limit?` |
| `get_project_tasks` | List tasks in a project | `projectId`, `offset?`, `limit?` |
| `create_project` | Create a new project | `name`, `note?`, `tags?`, `reviewInterval?`, `tasks?` |
| `update_project` | Change project properties | `projectId`, `status?`, `reviewInterval?`, `name?`, `note?` |

### Review Support

| Tool | Description | Parameters |
|------|-------------|------------|
| `get_projects_due_for_review` | Projects past their review date | `limit?` |
| `mark_project_reviewed` | Mark a project as reviewed | `projectId` |
| `get_stale_tasks` | Tasks not modified for a long time, flagged with no due date | `daysSinceModified?` (default 30) |
| `get_overdue_tasks` | Tasks past their due date | `limit?` |

### Tags

| Tool | Description | Parameters |
|------|-------------|------------|
| `get_tags` | List all tags | none |
| `create_tag` | Create a new tag | `name`, `parentTagId?` |

### Summary / Reporting

| Tool | Description | Parameters |
|------|-------------|------------|
| `get_forecast` | Tasks due today and upcoming week | `days?` (default 7) |
| `get_completed_tasks` | Tasks completed since a date | `since` (date string) |

## AppleScript Layer

- Each tool maps to one or more AppleScript snippets executed via `execFile("osascript", ["-e", script])`.
- AppleScript output is a **delimited string** (not JSON) — AppleScript is unreliable at JSON escaping. The TypeScript layer parses delimited output into structured JSON.
- **Pagination:** List tools accept `offset` and `limit`. Default batch size is 20.
- **Task identity:** OmniFocus internal task IDs (persistent, unique) are used to reference items across tool calls.
- **Error handling:** OmniFocus not running, invalid task IDs, and other failures return clear MCP error responses.

## Project Structure

```
omnifocus-mcp/
├── src/
│   ├── index.ts              # MCP server entry, tool registration
│   ├── applescript/
│   │   ├── executor.ts       # osascript execFile wrapper, output parsing
│   │   ├── inbox.ts          # inbox AppleScript templates
│   │   ├── tasks.ts          # task management AppleScript templates
│   │   ├── projects.ts       # project AppleScript templates
│   │   ├── tags.ts           # tag AppleScript templates
│   │   └── review.ts         # review & reporting AppleScript templates
│   └── tools/
│       ├── inbox.ts          # inbox tool handlers
│       ├── tasks.ts          # task tool handlers
│       ├── projects.ts       # project tool handlers
│       ├── tags.ts           # tag tool handlers
│       └── review.ts         # review & reporting tool handlers
├── package.json
├── tsconfig.json
└── README.md
```

**Two layers:**
- `src/applescript/` — AppleScript snippet templates and output parsing
- `src/tools/` — MCP tool definitions and input validation
- `executor.ts` — shared wrapper for shelling out to `osascript` via `execFile`

## Dependencies

- `@modelcontextprotocol/sdk` — MCP protocol handling
- TypeScript tooling (`typescript`, `@types/node`)
- No other runtime dependencies

## Testing

**Approach: TDD where feasible.** Write tests before implementation for all pure logic. The AppleScript execution boundary is the only part that can't be unit-tested.

### What gets TDD treatment

- **AppleScript output parsing** — given a raw delimited string from osascript, does it produce the correct structured object? Write the parser test first, then the parser.
- **Input validation** — given tool parameters, are invalid inputs rejected with clear errors? Write validation tests first, then the validators.
- **AppleScript template generation** — given tool parameters, does it produce the correct AppleScript string? Write template tests first, then the templates.
- **Edge cases** — empty inbox, no projects, missing optional fields, special characters in task names.

### What doesn't get TDD

- **`executor.ts`** — the thin `execFile` wrapper that actually shells out to `osascript`. Tested manually against real OmniFocus.
- **End-to-end integration** — requires a live OmniFocus instance with real data.

### Test tooling

- **Vitest** as the test runner (fast, TypeScript-native, good DX).
- Tests live alongside source: `src/applescript/__tests__/`, `src/tools/__tests__/`.
- `npm test` runs the full unit suite.

## Intended Workflow

The MCP enables Claude to guide a weekly review conversationally:

1. **Inbox triage (batched):** Fetch 20 inbox items, help user decide on each — assign to project, tag, date, delete, or defer. Repeat in batches.
2. **Project review:** Surface projects due for review, walk through each — check next actions, mark stale tasks, update status, mark reviewed.
3. **Stale task cleanup:** Find tasks that may have been completed elsewhere (e.g., Slack-sourced tasks) or are no longer relevant.
4. **Forecast check:** Review upcoming week, flag conflicts or overload.
5. **Completed summary:** Recap what got done since last review.

The user's goal is to gradually reach full GTD weekly review capability, starting from a ~2,000 task backlog with several hundred unprocessed inbox items.
