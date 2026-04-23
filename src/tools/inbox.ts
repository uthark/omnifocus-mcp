import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { runAppleScript } from '../applescript/executor.js';
import {
  buildGetInboxTasksScript,
  buildGetProjectInboxTasksScript,
  buildProcessInboxTaskScript,
  buildQuickEntryScript,
} from '../applescript/inbox.js';
import { parsePaginatedTasks } from '../applescript/parser.js';
import { INBOX_SOURCES } from '../config.js';

export function registerInboxTools(server: McpServer): void {
  server.tool(
    'get_inbox_tasks',
    'List inbox tasks with pagination. Supports system inbox and project-based inboxes (private, work).',
    {
      source: z.enum(['inbox', 'private', 'work']).default('inbox').describe('Which inbox to read: "inbox" (system), "private" (11.01 Inbox), "work" (32.01 Work Inbox)'),
      offset: z.number().int().min(0).default(0).describe('Skip first N tasks'),
      limit: z.number().int().min(1).max(100).default(10).describe('Max tasks to return'),
      excludeCompleted: z.boolean().default(true).describe('Exclude completed tasks (default: true)'),
    },
    async ({ source, offset, limit, excludeCompleted }) => {
      const inboxConfig = INBOX_SOURCES[source];
      let script: string;
      if (inboxConfig.type === 'project' && inboxConfig.projectName) {
        script = buildGetProjectInboxTasksScript(inboxConfig.projectName, offset, limit);
      } else {
        script = buildGetInboxTasksScript(offset, limit, excludeCompleted);
      }
      const output = await runAppleScript(script);
      const result = parsePaginatedTasks(output);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'process_inbox_task',
    'Move an inbox task to a project, assign tags, and set dates. Use this to process items during inbox triage.',
    {
      taskId: z.string().describe('OmniFocus task ID'),
      projectId: z.string().optional().describe('Project ID to move task into'),
      tags: z.array(z.string()).optional().describe('Tag names to assign'),
      dueDate: z.string().optional().describe('Due date (e.g., "April 30, 2026")'),
      deferDate: z.string().optional().describe('Defer date (e.g., "April 25, 2026")'),
      flagged: z.boolean().optional().describe('Set flagged status'),
    },
    async ({ taskId, projectId, tags, dueDate, deferDate, flagged }) => {
      const output = await runAppleScript(buildProcessInboxTaskScript(taskId, { projectId, tags, dueDate, deferDate, flagged }));
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, taskId: output.trim() }) }] };
    },
  );

  server.tool(
    'quick_entry',
    'Create a new task in the inbox or directly in a project.',
    {
      name: z.string().describe('Task name'),
      note: z.string().optional().describe('Task note'),
      projectId: z.string().optional().describe('Project ID to create task in (omit for inbox)'),
      tags: z.array(z.string()).optional().describe('Tag names to assign'),
      dueDate: z.string().optional().describe('Due date (e.g., "April 30, 2026")'),
      deferDate: z.string().optional().describe('Defer date (e.g., "April 25, 2026")'),
      flagged: z.boolean().optional().describe('Set flagged status'),
    },
    async ({ name, note, projectId, tags, dueDate, deferDate, flagged }) => {
      const output = await runAppleScript(buildQuickEntryScript(name, { note, projectId, tags, dueDate, deferDate, flagged }));
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, taskId: output.trim() }) }] };
    },
  );
}
