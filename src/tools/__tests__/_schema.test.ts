import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { zBool } from '../_schema.js';

describe('zBool', () => {
  it('accepts native booleans', () => {
    expect(zBool().parse(true)).toBe(true);
    expect(zBool().parse(false)).toBe(false);
  });

  it('coerces "true"/"false" (case-insensitive)', () => {
    expect(zBool().parse('true')).toBe(true);
    expect(zBool().parse('TRUE')).toBe(true);
    expect(zBool().parse(' True ')).toBe(true);
    expect(zBool().parse('false')).toBe(false);
    expect(zBool().parse('FALSE')).toBe(false);
  });

  it('coerces "1"/"0"', () => {
    expect(zBool().parse('1')).toBe(true);
    expect(zBool().parse('0')).toBe(false);
  });

  it('rejects ambiguous strings (does not silently truthy-coerce)', () => {
    expect(() => zBool().parse('yes')).toThrow();
    expect(() => zBool().parse('no')).toThrow();
    expect(() => zBool().parse('')).toThrow();
    expect(() => zBool().parse('on')).toThrow();
  });

  it('rejects non-string non-boolean input', () => {
    expect(() => zBool().parse(1)).toThrow();
    expect(() => zBool().parse(null)).toThrow();
  });

  it('respects .default() when input is undefined', () => {
    expect(zBool().default(false).parse(undefined)).toBe(false);
    expect(zBool().default(true).parse(undefined)).toBe(true);
  });

  it('respects .optional() when input is undefined', () => {
    expect(zBool().optional().parse(undefined)).toBe(undefined);
  });

  it('still coerces inside a default-wrapped schema', () => {
    expect(zBool().default(false).parse('true')).toBe(true);
    expect(zBool().default(true).parse('false')).toBe(false);
  });
});

describe('z.coerce.number() (zod-native — used in tools)', () => {
  it('accepts native numbers', () => {
    expect(z.coerce.number().int().parse(5)).toBe(5);
  });

  it('coerces numeric strings', () => {
    expect(z.coerce.number().int().parse('5')).toBe(5);
    expect(z.coerce.number().int().parse(' 7 ')).toBe(7);
    expect(z.coerce.number().int().min(0).parse('0')).toBe(0);
  });

  it('rejects non-numeric strings via .int() validation', () => {
    expect(() => z.coerce.number().int().parse('abc')).toThrow();
  });

  it('respects min/max chained after coerce', () => {
    const s = z.coerce.number().int().min(1).max(100);
    expect(s.parse('50')).toBe(50);
    expect(() => s.parse('0')).toThrow();
    expect(() => s.parse('101')).toThrow();
  });

  it('respects .default() when input is undefined', () => {
    expect(z.coerce.number().int().default(10).parse(undefined)).toBe(10);
  });
});
