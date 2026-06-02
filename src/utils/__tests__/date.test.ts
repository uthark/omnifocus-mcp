import { describe, it, expect } from 'vitest';
import { parseUtcDate, utcMidnight, diffDays } from '../date.js';

describe('parseUtcDate', () => {
  it('treats a naive ISO string as UTC', () => {
    expect(parseUtcDate('2026-06-01T00:00:00').toISOString()).toBe('2026-06-01T00:00:00.000Z');
  });
  it('respects an explicit Z', () => {
    expect(parseUtcDate('2026-06-01T00:00:00Z').toISOString()).toBe('2026-06-01T00:00:00.000Z');
  });
});

describe('utcMidnight', () => {
  it('floors to the UTC calendar day', () => {
    expect(utcMidnight(new Date('2026-06-01T15:30:00Z')).toISOString()).toBe('2026-06-01T00:00:00.000Z');
  });
});

describe('diffDays', () => {
  it('computes floored whole-day differences', () => {
    expect(diffDays(parseUtcDate('2026-06-01'), parseUtcDate('2026-05-01'))).toBe(31);
    expect(diffDays(parseUtcDate('2026-05-01'), parseUtcDate('2026-06-15'))).toBe(-45);
  });
});
