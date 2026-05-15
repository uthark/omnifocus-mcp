import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { runAppleScript } from '../applescript/executor.js';
import { zBool } from './_schema.js';
import {
  buildGetTagsScript,
  buildCreateTagScript,
  buildUpdateTagScript,
  buildDeleteTagScript,
  parseTagsOutput,
} from '../applescript/tags.js';

export function registerTagTools(server: McpServer): void {
  server.tool(
    'get_tags',
    'List tags in OmniFocus. Pass nameOnly:true to return a flat array of names — much smaller payload when you only need to verify whether a tag exists. Pass contains to filter by case-insensitive substring match on tag name.',
    {
      limit: z.coerce.number().int().min(1).max(500).default(50).describe('Max tags to return (applies after contains filter)'),
      nameOnly: zBool().default(false).describe('Return a flat array of tag names instead of {id,name} objects'),
      contains: z.string().optional().describe('Filter to tags whose name contains this substring (case-insensitive)'),
    },
    async ({ limit, nameOnly, contains }) => {
      const output = await runAppleScript(buildGetTagsScript(limit, contains));
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
    'update_tag',
    'Rename a tag and/or move it under a different parent tag. Pass empty string for parentTagId to move the tag to the document root.',
    {
      tagId: z.string().describe('OmniFocus tag ID'),
      name: z.string().optional().describe('New tag name'),
      parentTagId: z
        .string()
        .optional()
        .describe('New parent tag ID; pass empty string to move to document root'),
    },
    async ({ tagId, name, parentTagId }) => {
      if (name === undefined && parentTagId === undefined) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: 'no changes specified (set name and/or parentTagId)',
              }),
            },
          ],
        };
      }
      const output = await runAppleScript(
        buildUpdateTagScript(tagId, { name, parentTagId }),
      );
      const [id, tagName] = output.trim().split('\t');
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ success: true, tagId: id, name: tagName }),
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
