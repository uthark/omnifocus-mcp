#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTagTools } from './tools/tags.js';
import { registerInboxTools } from './tools/inbox.js';
import { registerTaskTools } from './tools/tasks.js';
import { registerProjectTools } from './tools/projects.js';
import { registerReviewTools } from './tools/review.js';

const server = new McpServer({
  name: 'omnifocus-mcp',
  version: '0.1.0',
});

registerTagTools(server);
registerInboxTools(server);
registerTaskTools(server);
registerProjectTools(server);
registerReviewTools(server);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('Failed to start OmniFocus MCP server:', error);
  process.exit(1);
});
