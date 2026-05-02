import { describe, it, expect } from 'vitest';
import { z } from 'zod';

/**
 * Demonstrates the root cause of the user-observed errors:
 *   "expected boolean, received string"
 *   "expected number, received string"
 *
 * The MCP SDK calls `inputSchema.parse(arguments)` on the JSON-RPC `arguments`
 * object before invoking the tool handler. If a client sends primitives as
 * JSON strings ("true", "5") instead of native booleans/numbers, plain
 * z.boolean() / z.number() schemas reject them with the exact error pattern
 * users see in the field.
 */
describe('root cause: zod rejects stringified primitives', () => {
  it('z.boolean() throws "expected boolean, received string" on "true"', () => {
    const schema = z.object({ contains: z.boolean() });
    const result = schema.safeParse({ contains: 'true' });

    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues[0]! as z.ZodInvalidTypeIssue;
      expect(issue.code).toBe('invalid_type');
      expect(issue.expected).toBe('boolean');
      expect(issue.received).toBe('string');
    }
  });

  it('z.number().int() throws "expected number, received string" on "5"', () => {
    const schema = z.object({ limit: z.number().int() });
    const result = schema.safeParse({ limit: '5' });

    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues[0]! as z.ZodInvalidTypeIssue;
      expect(issue.code).toBe('invalid_type');
      expect(issue.expected).toBe('number');
      expect(issue.received).toBe('string');
    }
  });
});
