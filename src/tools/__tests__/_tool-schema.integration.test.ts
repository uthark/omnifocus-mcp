import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { zBool } from '../_schema.js';

/**
 * Integration tests that exercise the SAME schema shapes the tool files use.
 * The MCP SDK wraps the schema record in `z.object(shape)` and calls
 * `safeParseAsync(schema, args)` — these tests reproduce that flow.
 *
 * Each test pair (native + stringified) proves the new schemas accept BOTH
 * forms, fixing the failures observed in the field.
 */
describe('tool schema integration — stringified primitives now parse', () => {
  describe('get_project_by_name shape', () => {
    const shape = z.object({
      name: z.string(),
      contains: zBool().default(false),
      limit: z.coerce.number().int().min(1).max(100).default(25),
    });

    it('parses native types', () => {
      const r = shape.parse({ name: 'foo', contains: true, limit: 50 });
      expect(r).toEqual({ name: 'foo', contains: true, limit: 50 });
    });

    it('parses stringified primitives (the original bug)', () => {
      const r = shape.parse({ name: 'foo', contains: 'true', limit: '50' });
      expect(r).toEqual({ name: 'foo', contains: true, limit: 50 });
    });

    it('still applies defaults when omitted', () => {
      const r = shape.parse({ name: 'foo' });
      expect(r).toEqual({ name: 'foo', contains: false, limit: 25 });
    });

    it('still rejects out-of-range numbers (post-coerce)', () => {
      expect(() => shape.parse({ name: 'foo', limit: '999' })).toThrow();
      expect(() => shape.parse({ name: 'foo', limit: '0' })).toThrow();
    });
  });

  describe('get_projects shape', () => {
    const shape = z.object({
      status: z.enum(['active', 'on hold', 'done', 'dropped']).default('active'),
      limit: z.coerce.number().int().min(1).max(500).default(10),
      folderId: z.string().optional(),
      omitNotes: zBool().default(false),
    });

    it('parses stringified omitNotes:"true" + limit:"100"', () => {
      const r = shape.parse({ omitNotes: 'true', limit: '100' });
      expect(r.omitNotes).toBe(true);
      expect(r.limit).toBe(100);
      expect(r.status).toBe('active');
    });

    it('parses omitNotes:"false"', () => {
      const r = shape.parse({ omitNotes: 'false' });
      expect(r.omitNotes).toBe(false);
    });
  });

  describe('get_tags shape', () => {
    const shape = z.object({
      limit: z.coerce.number().int().min(1).max(500).default(50),
      nameOnly: zBool().default(false),
    });

    it('parses stringified nameOnly + limit', () => {
      const r = shape.parse({ nameOnly: '1', limit: '5' });
      expect(r).toEqual({ nameOnly: true, limit: 5 });
    });
  });

  describe('get_inbox_tasks shape', () => {
    const shape = z.object({
      source: z.enum(['inbox', 'private', 'work']).default('inbox'),
      offset: z.coerce.number().int().min(0).default(0),
      limit: z.coerce.number().int().min(1).max(100).default(10),
      excludeCompleted: zBool().default(true),
      omitNotes: zBool().default(false),
    });

    it('parses fully-stringified payload', () => {
      const r = shape.parse({
        source: 'work',
        offset: '2',
        limit: '1',
        excludeCompleted: 'true',
        omitNotes: 'false',
      });
      expect(r).toEqual({
        source: 'work',
        offset: 2,
        limit: 1,
        excludeCompleted: true,
        omitNotes: false,
      });
    });
  });

  describe('update_task shape (optional booleans)', () => {
    const shape = z.object({
      taskId: z.string(),
      flagged: zBool().optional(),
      completed: zBool().optional(),
    });

    it('parses stringified optional booleans', () => {
      const r = shape.parse({ taskId: 'abc', flagged: 'true' });
      expect(r).toEqual({ taskId: 'abc', flagged: true });
    });

    it('leaves optional unset', () => {
      const r = shape.parse({ taskId: 'abc' });
      expect(r).toEqual({ taskId: 'abc' });
    });
  });
});
