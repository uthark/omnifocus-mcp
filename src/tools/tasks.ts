import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { runAppleScript } from '../applescript/executor.js';
import {
  buildCompleteTaskScript,
  buildDeleteTaskScript,
  buildUpdateTaskScript,
  buildCreateSubtasksScript,
} from '../applescript/tasks.js';

export function registerTaskTools(server: McpServer): void {
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
    'Modify task properties: name, note, tags, dates, flagged status',
    {
      taskId: z.string().describe('OmniFocus task ID'),
      name: z.string().optional().describe('New task name'),
      note: z.string().optional().describe('New task note'),
      tags: z.array(z.string()).optional().describe('Replace all tags with these tag names'),
      dueDate: z.string().optional().describe('Due date (e.g., "April 30, 2026")'),
      deferDate: z.string().optional().describe('Defer date (e.g., "April 25, 2026")'),
      flagged: z.boolean().optional().describe('Set flagged status'),
    },
    async ({ taskId, name, note, tags, dueDate, deferDate, flagged }) => {
      const output = await runAppleScript(buildUpdateTaskScript(taskId, { name, note, tags, dueDate, deferDate, flagged }));
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
}
