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
    'List tags in OmniFocus. Pass nameOnly:true to return a flat array of names — much smaller payload when you only need to verify whether a tag exists.',
    {
      limit: z.number().int().min(1).max(500).default(50).describe('Max tags to return'),
      nameOnly: z.boolean().default(false).describe('Return a flat array of tag names instead of {id,name} objects'),
    },
    async ({ limit, nameOnly }) => {
      const output = await runAppleScript(buildGetTagsScript(limit));
      const tags = parseTagsOutput(output);
      const payload = nameOnly ? tags.map((t) => t.name) : tags;
      return {
        content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
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
