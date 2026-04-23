import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { runAppleScript } from '../applescript/executor.js';
import {
  buildGetProjectsDueForReviewScript,
  buildMarkProjectReviewedScript,
  buildGetStaleTasksScript,
  buildGetOverdueTasksScript,
  buildGetForecastScript,
  buildGetCompletedTasksScript,
  parseProjectsForReviewOutput,
  parseTaskListOutput,
} from '../applescript/review.js';

export function registerReviewTools(server: McpServer): void {
  server.tool(
    'get_projects_due_for_review',
    'List projects that are past their review date',
    {
      limit: z.number().int().min(1).max(100).default(20).describe('Max projects to return'),
    },
    async ({ limit }) => {
      const output = await runAppleScript(buildGetProjectsDueForReviewScript(limit));
      const projects = parseProjectsForReviewOutput(output);
      return { content: [{ type: 'text', text: JSON.stringify(projects, null, 2) }] };
    },
  );

  server.tool(
    'mark_project_reviewed',
    'Mark a project as reviewed (resets review timer)',
    { projectId: z.string().describe('OmniFocus project ID') },
    async ({ projectId }) => {
      const output = await runAppleScript(buildMarkProjectReviewedScript(projectId));
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, projectId: output.trim() }) }] };
    },
  );

  server.tool(
    'get_stale_tasks',
    'Find tasks not modified for a long time (potential cleanup candidates)',
    {
      daysSinceModified: z.number().int().min(1).default(30).describe('Tasks not modified in this many days'),
    },
    async ({ daysSinceModified }) => {
      const output = await runAppleScript(buildGetStaleTasksScript(daysSinceModified));
      const result = parseTaskListOutput(output);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'get_overdue_tasks',
    'List tasks that are past their due date',
    {
      limit: z.number().int().min(1).max(100).default(20).describe('Max tasks to return'),
    },
    async ({ limit }) => {
      const output = await runAppleScript(buildGetOverdueTasksScript(limit));
      const result = parseTaskListOutput(output);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'get_forecast',
    'Show tasks due today and in the upcoming days',
    {
      days: z.number().int().min(1).max(90).default(7).describe('Number of days to look ahead'),
    },
    async ({ days }) => {
      const output = await runAppleScript(buildGetForecastScript(days));
      const result = parseTaskListOutput(output);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'get_completed_tasks',
    'List tasks completed since a given date (for weekly review summaries)',
    {
      since: z.string().describe('Date string (e.g., "April 15, 2026")'),
    },
    async ({ since }) => {
      const output = await runAppleScript(buildGetCompletedTasksScript(since));
      const result = parseTaskListOutput(output);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );
}
