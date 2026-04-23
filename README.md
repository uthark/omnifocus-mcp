# omnifocus-mcp

MCP server for OmniFocus — a GTD weekly review assistant powered by Claude.

## Prerequisites

- macOS with OmniFocus installed
- Node.js 20+

## Setup

```bash
npm install
npm run build
```

## Claude Code Configuration

Add to your Claude Code MCP settings (`~/.claude/settings.json` or project `.claude/settings.json`):

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

Replace `/path/to/omnifocus-mcp` with the actual path.

## Available Tools

### Inbox Processing
- **get_inbox_tasks** — List inbox items (system inbox, private, or work)
- **process_inbox_task** — Move inbox task to project, assign tags, set dates
- **quick_entry** — Create a new task

### Task Management
- **complete_task** — Mark task as completed
- **delete_task** — Delete a task
- **update_task** — Modify task properties
- **create_subtasks** — Break a task into subtasks

### Project Management
- **get_projects** — List projects with status and review info
- **get_project_tasks** — List tasks within a project
- **create_project** — Create a new project
- **update_project** — Change project properties

### Review Support
- **get_projects_due_for_review** — Projects past review date
- **mark_project_reviewed** — Mark project as reviewed
- **get_stale_tasks** — Tasks not modified recently
- **get_overdue_tasks** — Tasks past due date

### Tags
- **get_tags** — List all tags
- **create_tag** — Create a new tag

### Reporting
- **get_forecast** — Tasks due in upcoming days
- **get_completed_tasks** — Tasks completed since a date

## Development

```bash
npm run dev       # Watch mode
npm test          # Run unit tests
npm run test:watch # Watch tests
```
