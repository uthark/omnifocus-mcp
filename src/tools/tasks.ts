import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { zBool } from './_schema.js';
import { runAppleScript } from '../applescript/executor.js';
import {
  buildCompleteTaskScript,
  buildUncompleteTaskScript,
  buildDeleteTaskScript,
  buildUpdateTaskScript,
  buildCreateSubtasksScript,
  buildSearchTasksScript,
  buildGetTaskScript,
} from '../applescript/tasks.js';
import { parsePaginatedTasks, parseTaskFields, splitFields } from '../applescript/parser.js';

export function registerTaskTools(server: McpServer): void {
  server.tool(
    'get_task',
    'Fetch a single task by ID with full properties (including completed status)',
    { taskId: z.string().describe('OmniFocus task ID') },
    async ({ taskId }) => {
      const output = await runAppleScript(buildGetTaskScript(taskId));
      const task = parseTaskFields(splitFields(output.trim()));
      return { content: [{ type: 'text', text: JSON.stringify(task, null, 2) }] };
    },
  );

  server.tool(
    'complete_task',
    'Mark a task as completed',
    { taskId: z.string().describe('OmniFocus task ID') },
    async ({ taskId }) => {
      const output = await runAppleScript(buildCompleteTaskScript(taskId));
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, taskId: output.trim() }) }] };
    },
  );

  server.tool(
    'uncomplete_task',
    'Reopen a completed task (mark incomplete)',
    { taskId: z.string().describe('OmniFocus task ID') },
    async ({ taskId }) => {
      const output = await runAppleScript(buildUncompleteTaskScript(taskId));
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, taskId: output.trim() }) }] };
    },
  );

  server.tool(
    'delete_task',
    'Delete a task from OmniFocus',
    { taskId: z.string().describe('OmniFocus task ID') },
    async ({ taskId }) => {
      await runAppleScript(buildDeleteTaskScript(taskId));
      return { content: [{ type: 'text', text: JSON.stringify({ success: true }) }] };
    },
  );

  server.tool(
    'update_task',
    'Modify task properties: name, note, tags, dates, flagged, completed status',
    {
      taskId: z.string().describe('OmniFocus task ID'),
      name: z.string().optional().describe('New task name'),
      note: z.string().optional().describe('New task note'),
      tags: z.array(z.string()).optional().describe('Replace all tags with these tag names'),
      dueDate: z.string().optional().describe('Due date (e.g., "April 30, 2026")'),
      deferDate: z.string().optional().describe('Defer date (e.g., "April 25, 2026")'),
      flagged: zBool().optional().describe('Set flagged status'),
      completed: zBool().optional().describe('Set completion status (true=complete, false=reopen)'),
    },
    async ({ taskId, name, note, tags, dueDate, deferDate, flagged, completed }) => {
      const output = await runAppleScript(buildUpdateTaskScript(taskId, { name, note, tags, dueDate, deferDate, flagged, completed }));
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, taskId: output.trim() }) }] };
    },
  );

  server.tool(
    'create_subtasks',
    'Break a task into subtasks',
    {
      taskId: z.string().describe('Parent task ID'),
      subtasks: z.array(z.object({
        name: z.string().describe('Subtask name'),
        note: z.string().optional().describe('Subtask note'),
      })).describe('Subtasks to create'),
    },
    async ({ taskId, subtasks }) => {
      const output = await runAppleScript(buildCreateSubtasksScript(taskId, subtasks));
      const ids = output.trim().split(',').filter((id) => id !== '');
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, subtaskIds: ids }) }] };
    },
  );

  server.tool(
    'search_tasks',
    'Search incomplete tasks by name. Use this to find tasks when you know part of the name.',
    {
      query: z.string().describe('Text to search for in task names (case-insensitive contains match)'),
      limit: z.coerce.number().int().min(1).max(100).default(20).describe('Max tasks to return'),
    },
    async ({ query, limit }) => {
      const output = await runAppleScript(buildSearchTasksScript(query, limit));
      const result = parsePaginatedTasks(output);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );
}
