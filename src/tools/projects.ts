import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { zBool, zNullableInt } from './_schema.js';
import { runAppleScript } from '../applescript/executor.js';
import {
  buildGetProjectsScript,
  buildGetProjectByNameScript,
  buildGetProjectTasksScript,
  buildCreateProjectScript,
  buildUpdateProjectScript,
  buildGetFoldersScript,
  buildCreateFolderScript,
  buildUpdateFolderScript,
  buildMoveProjectScript,
  buildDeleteFolderScript,
  buildConvertTaskToProjectScript,
} from '../applescript/projects.js';
import { parseProjects, parsePaginatedTasks, parseFolders } from '../applescript/parser.js';

export function registerProjectTools(server: McpServer): void {
  server.tool(
    'get_projects',
    'List projects with status, task counts, and review dates. Optionally scope to a folder (recursively). Pass omitNotes:true when you only need names/IDs — drops the often-verbose note field.',
    {
      status: z.enum(['active', 'on hold', 'done', 'dropped']).default('active').describe('Filter by project status'),
      limit: z.coerce.number().int().min(1).max(500).default(10).describe('Max projects to return'),
      folderId: z.string().optional().describe('If set, only return projects within this folder (recursive — includes projects in subfolders)'),
      omitNotes: zBool().default(false).describe('Omit the note field from each project to reduce output size'),
    },
    async ({ status, limit, folderId, omitNotes }) => {
      const output = await runAppleScript(buildGetProjectsScript({ status, limit, folderId, omitNotes }));
      const projects = parseProjects(output);
      if (omitNotes) {
        for (const p of projects) delete (p as { note?: string }).note;
      }
      return { content: [{ type: 'text', text: JSON.stringify(projects, null, 2) }] };
    },
  );

  server.tool(
    'get_project_by_name',
    'Look up project(s) by name. Default is exact match (single result). Pass contains:true for substring search returning all matches.',
    {
      name: z.string().describe('Project name to look up'),
      contains: zBool().default(false).describe('Substring search instead of exact match — returns all matches'),
      limit: z.coerce.number().int().min(1).max(100).default(25).describe('Max matches to return when contains=true'),
    },
    async ({ name, contains, limit }) => {
      const output = await runAppleScript(buildGetProjectByNameScript(name, { contains, limit }));
      if (contains) {
        const matches = output
          .split('\n')
          .filter((line) => line !== '')
          .map((line) => {
            const [id, projName] = line.split('\t');
            return { id, name: projName };
          });
        return { content: [{ type: 'text', text: JSON.stringify({ matches }) }] };
      }
      const [id, projName] = output.split('\t');
      return { content: [{ type: 'text', text: JSON.stringify({ id, name: projName }) }] };
    },
  );

  server.tool(
    'get_project_tasks',
    'List tasks within a specific project',
    {
      projectId: z.string().describe('OmniFocus project ID'),
      offset: z.coerce.number().int().min(0).default(0).describe('Skip first N tasks'),
      limit: z.coerce.number().int().min(1).max(100).default(10).describe('Max tasks to return'),
    },
    async ({ projectId, offset, limit }) => {
      const output = await runAppleScript(buildGetProjectTasksScript(projectId, offset, limit));
      const result = parsePaginatedTasks(output);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  const reviewIntervalSchema = {
    reviewIntervalSteps: z.coerce.number().int().positive().optional().describe('Review interval count, e.g. 2 with unit=week → every 2 weeks. Required together with reviewIntervalUnit.'),
    reviewIntervalUnit: z.enum(['minute', 'hour', 'day', 'week', 'month', 'year']).optional().describe('Review interval unit. Required together with reviewIntervalSteps.'),
    reviewIntervalFixed: zBool().optional().describe('If true (default), next review is computed on a fixed calendar; if false, it slides relative to last review'),
  };

  function buildReviewInterval(args: { reviewIntervalSteps?: number; reviewIntervalUnit?: 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year'; reviewIntervalFixed?: boolean }) {
    const { reviewIntervalSteps, reviewIntervalUnit, reviewIntervalFixed } = args;
    if (reviewIntervalSteps === undefined && reviewIntervalUnit === undefined) {
      if (reviewIntervalFixed !== undefined) {
        throw new Error('reviewIntervalFixed requires reviewIntervalSteps and reviewIntervalUnit');
      }
      return undefined;
    }
    if (reviewIntervalSteps === undefined || reviewIntervalUnit === undefined) {
      throw new Error('reviewIntervalSteps and reviewIntervalUnit must be set together');
    }
    return { steps: reviewIntervalSteps, unit: reviewIntervalUnit, fixed: reviewIntervalFixed ?? true };
  }

  server.tool(
    'create_project',
    'Create a new project in OmniFocus',
    {
      name: z.string().describe('Project name'),
      note: z.string().optional().describe('Project note'),
      tags: z.array(z.string()).optional().describe('Tag names to assign'),
      ...reviewIntervalSchema,
      folderId: z.string().optional().describe('Folder ID to place the project in (see get_folders)'),
      tasks: z.array(z.object({
        name: z.string().describe('Task name'),
        note: z.string().optional().describe('Task note'),
      })).optional().describe('Initial tasks to create in the project'),
    },
    async (args) => {
      const reviewInterval = buildReviewInterval(args);
      const output = await runAppleScript(buildCreateProjectScript(args.name, {
        note: args.note, tags: args.tags, reviewInterval, folderId: args.folderId, tasks: args.tasks,
      }));
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, projectId: output.trim() }) }] };
    },
  );

  server.tool(
    'update_project',
    'Change project properties: status, review interval/schedule, name, note',
    {
      projectId: z.string().describe('OmniFocus project ID'),
      status: z.enum(['active', 'on hold', 'done', 'dropped']).optional().describe('New project status'),
      ...reviewIntervalSchema,
      nextReviewDate: z.string().optional().describe('Next review date (e.g., "May 15, 2026"); empty string resets it from last-review + interval'),
      name: z.string().optional().describe('New project name'),
      note: z.string().optional().describe('New project note'),
      estimatedMinutes: zNullableInt().optional().describe('Estimated time in whole minutes; pass null to clear'),
    },
    async (args) => {
      const reviewInterval = buildReviewInterval(args);
      const output = await runAppleScript(buildUpdateProjectScript(args.projectId, {
        status: args.status, reviewInterval, nextReviewDate: args.nextReviewDate, name: args.name, note: args.note, estimatedMinutes: args.estimatedMinutes,
      }));
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, projectId: output.trim() }) }] };
    },
  );

  server.tool(
    'get_folders',
    'List folders (areas of responsibility) with their active project counts',
    {
      limit: z.coerce.number().int().min(1).max(100).default(50).describe('Max folders to return'),
    },
    async ({ limit }) => {
      const output = await runAppleScript(buildGetFoldersScript(limit));
      const folders = parseFolders(output);
      return { content: [{ type: 'text', text: JSON.stringify(folders, null, 2) }] };
    },
  );

  server.tool(
    'create_folder',
    'Create a new folder in OmniFocus, optionally inside a parent folder',
    {
      name: z.string().describe('Folder name'),
      parentFolderId: z.string().optional().describe('Parent folder ID (see get_folders); omit to create at document root'),
    },
    async ({ name, parentFolderId }) => {
      const output = await runAppleScript(buildCreateFolderScript(name, parentFolderId));
      const [folderId, folderName] = output.trim().split('\t');
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, folderId, name: folderName }) }] };
    },
  );

  server.tool(
    'update_folder',
    'Rename a folder',
    {
      folderId: z.string().describe('OmniFocus folder ID'),
      name: z.string().describe('New folder name'),
    },
    async ({ folderId, name }) => {
      const output = await runAppleScript(buildUpdateFolderScript(folderId, name));
      const [id, folderName] = output.trim().split('\t');
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, folderId: id, name: folderName }) }] };
    },
  );

  server.tool(
    'move_project',
    'Move a project into a different folder',
    {
      projectId: z.string().describe('OmniFocus project ID'),
      folderId: z.string().describe('Target folder ID (see get_folders)'),
    },
    async ({ projectId, folderId }) => {
      const output = await runAppleScript(buildMoveProjectScript(projectId, folderId));
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, projectId: output.trim() }) }] };
    },
  );

  server.tool(
    'convert_task_to_project',
    'Convert an existing task into a project, preserving its name, note, and tags. Completes the original task.',
    {
      taskId: z.string().describe('OmniFocus task ID to convert'),
      folderId: z.string().optional().describe('Folder ID to place the new project in (see get_folders); omit to create at document root'),
    },
    async ({ taskId, folderId }) => {
      const output = await runAppleScript(buildConvertTaskToProjectScript(taskId, { folderId }));
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, projectId: output.trim() }) }] };
    },
  );

  server.tool(
    'delete_folder',
    'Delete a folder. Refuses if the folder contains any projects — move or complete them first.',
    {
      folderId: z.string().describe('OmniFocus folder ID'),
    },
    async ({ folderId }) => {
      const output = await runAppleScript(buildDeleteFolderScript(folderId));
      const result = output.trim();
      if (result.startsWith('error:not-empty:')) {
        const count = result.split(':')[2];
        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: `Folder is not empty — move or complete its ${count} project(s) first` }) }] };
      }
      return { content: [{ type: 'text', text: JSON.stringify({ success: true }) }] };
    },
  );
}
