# omnifocus-mcp

MCP server for OmniFocus — enables AI assistants to manage tasks, projects, tags, and run GTD weekly reviews via the Model Context Protocol.

## Requirements

- macOS with OmniFocus installed
- Node.js 18+

## Setup

```bash
npm install
npm run build
```

Add to `.mcp.json` (project or `~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "omnifocus": {
      "command": "node",
      "args": ["/path/to/omnifocus-mcp/dist/index.js"]
    }
  }
}
```

## Tools (22 total)

### Inbox
- **get_inbox_tasks** — List tasks from system, private, or work inbox (paginated)
- **process_inbox_task** — Move task to project, assign tags/dates/flags
- **quick_entry** — Create a new task in inbox or directly in a project

### Tasks
- **complete_task** — Mark task as completed
- **delete_task** — Delete a task
- **update_task** — Modify name, note, tags, dates, flagged status
- **create_subtasks** — Break a task into subtasks
- **search_tasks** — Search incomplete tasks by name

### Projects
- **get_projects** — List projects filtered by status
- **get_project_tasks** — List tasks within a project (paginated)
- **create_project** — Create project with optional initial tasks
- **update_project** — Change status, review interval, name, note
- **get_folders** — List folders (areas of responsibility) with active project counts

### Tags
- **get_tags** — List tags (with limit)
- **create_tag** — Create tag (supports nesting via parent tag ID)

### Review
- **get_projects_due_for_review** — Projects past their review date
- **mark_project_reviewed** — Reset review timer
- **get_stale_tasks** — Tasks in a project not modified for N days
- **get_overdue_tasks** — Tasks past due date
- **get_forecast** — Tasks due in the next N days
- **get_completed_tasks** — Tasks completed since a given date
- **get_flagged_tasks** — List all flagged incomplete tasks (your "hot list")
- **get_available_tasks** — List actionable tasks in a project (not blocked, not deferred)
- **get_tasks_by_tag** — List incomplete tasks matching any of the given tags (e.g., @waiting_for, @errands)

## Development

```bash
npm run dev       # watch mode
npm test          # run tests
npm run build     # compile TypeScript
```
