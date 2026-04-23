import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { runAppleScript } from '../applescript/executor.js';
import {
  buildGetProjectsScript,
  buildGetProjectByNameScript,
  buildGetProjectTasksScript,
  buildCreateProjectScript,
  buildUpdateProjectScript,
  buildGetFoldersScript,
} from '../applescript/projects.js';
import { parseProjects, parsePaginatedTasks, parseFolders } from '../applescript/parser.js';

export function registerProjectTools(server: McpServer): void {
  server.tool(
    'get_projects',
    'List projects with status, task counts, and review dates',
    {
      status: z.enum(['active', 'on hold', 'done', 'dropped']).default('active').describe('Filter by project status'),
      limit: z.number().int().min(1).max(500).default(10).describe('Max projects to return'),
    },
    async ({ status, limit }) => {
      const output = await runAppleScript(buildGetProjectsScript({ status, limit }));
      const projects = parseProjects(output);
      return { content: [{ type: 'text', text: JSON.stringify(projects, null, 2) }] };
    },
  );

  server.tool(
    'get_project_by_name',
    'Look up a project ID by name. Use this instead of get_projects when you know the project name.',
    {
      name: z.string().describe('Project name to look up'),
    },
    async ({ name }) => {
      const output = await runAppleScript(buildGetProjectByNameScript(name));
      const [id, projName] = output.split('\t');
      return { content: [{ type: 'text', text: JSON.stringify({ id, name: projName }) }] };
    },
  );

  server.tool(
    'get_project_tasks',
    'List tasks within a specific project',
    {
      projectId: z.string().describe('OmniFocus project ID'),
      offset: z.number().int().min(0).default(0).describe('Skip first N tasks'),
      limit: z.number().int().min(1).max(100).default(10).describe('Max tasks to return'),
    },
    async ({ projectId, offset, limit }) => {
      const output = await runAppleScript(buildGetProjectTasksScript(projectId, offset, limit));
      const result = parsePaginatedTasks(output);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'create_project',
    'Create a new project in OmniFocus',
    {
      name: z.string().describe('Project name'),
      note: z.string().optional().describe('Project note'),
      tags: z.array(z.string()).optional().describe('Tag names to assign'),
      reviewInterval: z.number().optional().describe('Review interval in seconds (604800 = 1 week)'),
      tasks: z.array(z.object({
        name: z.string().describe('Task name'),
        note: z.string().optional().describe('Task note'),
      })).optional().describe('Initial tasks to create in the project'),
    },
    async ({ name, note, tags, reviewInterval, tasks }) => {
      const output = await runAppleScript(buildCreateProjectScript(name, { note, tags, reviewInterval, tasks }));
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, projectId: output.trim() }) }] };
    },
  );

  server.tool(
    'update_project',
    'Change project properties: status, review interval, name, note',
    {
      projectId: z.string().describe('OmniFocus project ID'),
      status: z.enum(['active', 'on hold', 'done', 'dropped']).optional().describe('New project status'),
      reviewInterval: z.number().optional().describe('New review interval in seconds'),
      name: z.string().optional().describe('New project name'),
      note: z.string().optional().describe('New project note'),
    },
    async ({ projectId, status, reviewInterval, name, note }) => {
      const output = await runAppleScript(buildUpdateProjectScript(projectId, { status, reviewInterval, name, note }));
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, projectId: output.trim() }) }] };
    },
  );

  server.tool(
    'get_folders',
    'List folders (areas of responsibility) with their active project counts',
    {
      limit: z.number().int().min(1).max(100).default(50).describe('Max folders to return'),
    },
    async ({ limit }) => {
      const output = await runAppleScript(buildGetFoldersScript(limit));
      const folders = parseFolders(output);
      return { content: [{ type: 'text', text: JSON.stringify(folders, null, 2) }] };
    },
  );
}
