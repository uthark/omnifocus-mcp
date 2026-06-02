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
  buildGetTasksByTagScript,
  buildGetAvailableTasksScript,
  buildGetFlaggedTasksScript,
  buildGetReviewDigestScript,
  buildBatchMarkReviewedScript,
} from '../applescript/review.js';
import { parseProjects, parsePaginatedTasks, parseStaleTasks, parseReviewDigest } from '../applescript/parser.js';
import { compactJson } from './_compact.js';
import { zBool } from './_schema.js';
import { withDaysWaiting, filterAndSortByAge } from './_aging.js';

export function registerReviewTools(server: McpServer): void {
  server.tool(
    'get_projects_due_for_review',
    'List projects that are past their review date',
    {
      limit: z.coerce.number().int().min(1).max(100).default(10).describe('Max projects to return'),
    },
    async ({ limit }) => {
      const output = await runAppleScript(buildGetProjectsDueForReviewScript(limit));
      const projects = parseProjects(output);
      return { content: [{ type: 'text', text: compactJson(projects) }] };
    },
  );

  server.tool(
    'mark_project_reviewed',
    'Mark a project as reviewed (resets review timer)',
    { projectId: z.string().describe('OmniFocus project ID') },
    async ({ projectId }) => {
      const output = await runAppleScript(buildMarkProjectReviewedScript(projectId));
      return { content: [{ type: 'text', text: compactJson({ success: true, projectId: output.trim() }) }] };
    },
  );

  server.tool(
    'batch_mark_reviewed',
    'Mark multiple projects as reviewed in a single pass (resets their review timers). Use to bulk-clear the healthy remainder during a review sweep.',
    {
      projectIds: z.array(z.string()).min(1).describe('OmniFocus project IDs to mark reviewed'),
    },
    async ({ projectIds }) => {
      const output = await runAppleScript(buildBatchMarkReviewedScript(projectIds), 60_000);
      const reviewedCount = parseInt(output.trim(), 10) || 0;
      return { content: [{ type: 'text', text: compactJson({ success: true, reviewedCount }) }] };
    },
  );

  server.tool(
    'get_stale_tasks',
    'Find tasks in a project not modified for a long time (potential cleanup candidates)',
    {
      projectId: z.string().describe('OmniFocus project ID to scan'),
      daysSinceModified: z.coerce.number().int().min(1).default(30).describe('Tasks not modified in this many days'),
      limit: z.coerce.number().int().min(1).max(100).default(10).describe('Max tasks to return'),
    },
    async ({ projectId, daysSinceModified, limit }) => {
      const output = await runAppleScript(buildGetStaleTasksScript(projectId, daysSinceModified, limit), 30_000);
      const result = parseStaleTasks(output);
      return { content: [{ type: 'text', text: compactJson(result) }] };
    },
  );

  server.tool(
    'get_overdue_tasks',
    'List tasks that are past their due date',
    {
      limit: z.coerce.number().int().min(1).max(100).default(10).describe('Max tasks to return'),
    },
    async ({ limit }) => {
      const output = await runAppleScript(buildGetOverdueTasksScript(limit));
      const result = parsePaginatedTasks(output);
      return { content: [{ type: 'text', text: compactJson(result) }] };
    },
  );

  server.tool(
    'get_forecast',
    'Show tasks due today and in the upcoming days',
    {
      days: z.coerce.number().int().min(1).max(90).default(7).describe('Number of days to look ahead'),
      limit: z.coerce.number().int().min(1).max(100).default(10).describe('Max tasks to return'),
    },
    async ({ days, limit }) => {
      const output = await runAppleScript(buildGetForecastScript(days, limit));
      const result = parsePaginatedTasks(output);
      return { content: [{ type: 'text', text: compactJson(result) }] };
    },
  );

  server.tool(
    'get_completed_tasks',
    'List tasks completed since a given date (for weekly review summaries)',
    {
      since: z.string().describe('Date string (e.g., "April 15, 2026")'),
      limit: z.coerce.number().int().min(1).max(100).default(10).describe('Max tasks to return'),
    },
    async ({ since, limit }) => {
      const output = await runAppleScript(buildGetCompletedTasksScript(since, limit));
      const result = parsePaginatedTasks(output);
      return { content: [{ type: 'text', text: compactJson(result) }] };
    },
  );

  server.tool(
    'get_tasks_by_tag',
    'List incomplete tasks that have any of the specified tags. Use for GTD context lists like @waiting_for, @errands, @agenda, or person tags. Pass sortByAge/minAgeDays to surface aging commitments oldest-first (each task includes daysWaiting and its full tag list, so callers can tell "waiting on someone" from "owed to someone"). When sortByAge/minAgeDays is used, total reflects the count after age filtering.',
    {
      tagNames: z.array(z.string()).min(1).describe('Tag names to filter by (returns tasks matching ANY of these tags)'),
      limit: z.coerce.number().int().min(1).max(100).default(20).describe('Max tasks to return'),
      minAgeDays: z.coerce.number().int().min(0).optional().describe('Only return tasks that have been waiting at least this many days (by defer date, else creation date)'),
      sortByAge: zBool().default(false).describe('Sort returned tasks oldest-waiting first'),
      folderId: z.string().optional().describe('Restrict to tasks whose project lives in this folder (area of responsibility). Use to keep work and personal reviews separate.'),
    },
    async ({ tagNames, limit, minAgeDays, sortByAge, folderId }) => {
      const aging = sortByAge || minAgeDays !== undefined;
      // When aging, fetch a wider window so sort/filter sees more than the first `limit`
      // in list order. Caveat: tags with >500 incomplete tasks are truncated to 500 before
      // aging — acceptable for typical @waiting_for / person-tag lists.
      const fetchLimit = aging ? Math.max(limit, 500) : limit;
      const output = await runAppleScript(buildGetTasksByTagScript(tagNames, fetchLimit, folderId), 30_000);
      const parsed = parsePaginatedTasks(output);
      if (!aging) {
        return { content: [{ type: 'text', text: compactJson(parsed) }] };
      }
      const aged = parsed.items.map((t) => withDaysWaiting(t));
      const filtered = filterAndSortByAge(aged, { minAgeDays, sortByAge });
      const result = { total: filtered.length, items: filtered.slice(0, limit) };
      return { content: [{ type: 'text', text: compactJson(result) }] };
    },
  );

  server.tool(
    'get_available_tasks',
    'List tasks in a project that are currently actionable (not completed, not blocked, not deferred to the future)',
    {
      projectId: z.string().describe('OmniFocus project ID to scan'),
      limit: z.coerce.number().int().min(1).max(100).default(20).describe('Max tasks to return'),
    },
    async ({ projectId, limit }) => {
      const output = await runAppleScript(buildGetAvailableTasksScript(projectId, limit), 30_000);
      const result = parsePaginatedTasks(output);
      return { content: [{ type: 'text', text: compactJson(result) }] };
    },
  );

  server.tool(
    'get_flagged_tasks',
    'List all flagged incomplete tasks (your "hot list" / next actions)',
    {
      limit: z.coerce.number().int().min(1).max(100).default(20).describe('Max tasks to return'),
      deferBefore: z.string().optional().describe('Only return tasks whose defer date is on or before this date (YYYY-MM-DD). Tasks with no defer date are always included.'),
    },
    async ({ limit, deferBefore }) => {
      const output = await runAppleScript(buildGetFlaggedTasksScript(limit, deferBefore));
      const result = parsePaginatedTasks(output);
      return { content: [{ type: 'text', text: compactJson(result) }] };
    },
  );

  server.tool(
    'get_review_digest',
    'Portfolio review digest: one row per project with stall, next-action (Planned), deadline, and last-activity signals for fast GTD weekly-review triage. scope=due returns projects past their review date; scope=all-active returns every active project (use for the one-time backlog pass).',
    {
      scope: z.enum(['due', 'all-active']).default('due').describe('due = past review date; all-active = every active project'),
      folderId: z.string().optional().describe('Restrict the scan to a single folder (area of responsibility)'),
      includeOnHold: zBool().default(false).describe('Include on-hold (someday/maybe) projects'),
      onlyStalled: zBool().default(false).describe('Only return projects with no available next action'),
      limit: z.coerce.number().int().min(1).max(500).default(200).describe('Max projects to return'),
      offset: z.coerce.number().int().min(0).default(0).describe('Pagination offset'),
    },
    async ({ scope, folderId, includeOnHold, onlyStalled, limit, offset }) => {
      const output = await runAppleScript(
        buildGetReviewDigestScript({ scope, folderId, includeOnHold, onlyStalled, limit, offset }),
        60_000,
      );
      const result = parseReviewDigest(output);
      return { content: [{ type: 'text', text: compactJson(result) }] };
    },
  );
}
