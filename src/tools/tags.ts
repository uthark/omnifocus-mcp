import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { runAppleScript } from '../applescript/executor.js';
import {
  buildGetTagsScript,
  buildCreateTagScript,
  buildDeleteTagScript,
  parseTagsOutput,
} from '../applescript/tags.js';

export function registerTagTools(server: McpServer): void {
  server.tool(
    'get_tags',
    'List tags in OmniFocus',
    {
      limit: z.number().int().min(1).max(500).default(50).describe('Max tags to return'),
    },
    async ({ limit }) => {
      const output = await runAppleScript(buildGetTagsScript(limit));
      const tags = parseTagsOutput(output);
      return {
        content: [{ type: 'text', text: JSON.stringify(tags, null, 2) }],
      };
    },
  );

  server.tool(
    'create_tag',
    'Create a new tag in OmniFocus',
    {
      name: z.string().describe('Tag name'),
      parentTagId: z
        .string()
        .optional()
        .describe('Parent tag ID for nested tags'),
    },
    async ({ name, parentTagId }) => {
      const output = await runAppleScript(
        buildCreateTagScript(name, parentTagId),
      );
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ id: output.trim(), name }),
          },
        ],
      };
    },
  );

  server.tool(
    'delete_tag',
    'Delete a tag by ID. Refuses if the tag has child tags. Tasks that had the tag are simply untagged (not deleted). Returns how many tasks were untagged.',
    {
      tagId: z.string().describe('OmniFocus tag ID'),
    },
    async ({ tagId }) => {
      const raw = (await runAppleScript(buildDeleteTagScript(tagId))).trim();
      if (raw.startsWith('error:has-children:')) {
        const childTagCount = Number(raw.split(':')[2] ?? '0');
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                deleted: false,
                error: 'has-children',
                childTagCount,
              }),
            },
          ],
        };
      }
      const tasksUntagged = raw.startsWith('deleted:')
        ? Number(raw.split(':')[1] ?? '0')
        : 0;
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ deleted: true, tasksUntagged }),
          },
        ],
      };
    },
  );
}
