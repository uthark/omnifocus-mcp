import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { runAppleScript } from '../applescript/executor.js';
import {
  buildGetTagsScript,
  buildCreateTagScript,
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
}
