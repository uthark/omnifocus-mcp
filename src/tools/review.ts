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
} from '../applescript/review.js';
import { parseProjects, parsePaginatedTasks, parseStaleTasks } from '../applescript/parser.js';

export function registerReviewTools(server: McpServer): void {
  server.tool(
    'get_projects_due_for_review',
    'List projects that are past their review date',
    {
      limit: z.number().int().min(1).max(100).default(10).describe('Max projects to return'),
    },
    async ({ limit }) => {
      const output = await runAppleScript(buildGetProjectsDueForReviewScript(limit));
      const projects = parseProjects(output);
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
    'Find tasks in a project not modified for a long time (potential cleanup candidates)',
    {
      projectId: z.string().describe('OmniFocus project ID to scan'),
      daysSinceModified: z.number().int().min(1).default(30).describe('Tasks not modified in this many days'),
      limit: z.number().int().min(1).max(100).default(10).describe('Max tasks to return'),
    },
    async ({ projectId, daysSinceModified, limit }) => {
      const output = await runAppleScript(buildGetStaleTasksScript(projectId, daysSinceModified, limit), 30_000);
      const result = parseStaleTasks(output);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'get_overdue_tasks',
    'List tasks that are past their due date',
    {
      limit: z.number().int().min(1).max(100).default(10).describe('Max tasks to return'),
    },
    async ({ limit }) => {
      const output = await runAppleScript(buildGetOverdueTasksScript(limit));
      const result = parsePaginatedTasks(output);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'get_forecast',
    'Show tasks due today and in the upcoming days',
    {
      days: z.number().int().min(1).max(90).default(7).describe('Number of days to look ahead'),
      limit: z.number().int().min(1).max(100).default(10).describe('Max tasks to return'),
    },
    async ({ days, limit }) => {
      const output = await runAppleScript(buildGetForecastScript(days, limit));
      const result = parsePaginatedTasks(output);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'get_completed_tasks',
    'List tasks completed since a given date (for weekly review summaries)',
    {
      since: z.string().describe('Date string (e.g., "April 15, 2026")'),
      limit: z.number().int().min(1).max(100).default(10).describe('Max tasks to return'),
    },
    async ({ since, limit }) => {
      const output = await runAppleScript(buildGetCompletedTasksScript(since, limit));
      const result = parsePaginatedTasks(output);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );
}
