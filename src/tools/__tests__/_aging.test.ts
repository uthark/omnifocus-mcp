import { describe, it, expect } from 'vitest';
import type { OFTask } from '../../types.js';
import { daysWaiting, withDaysWaiting, filterAndSortByAge } from '../_aging.js';

const now = new Date('2026-06-01T00:00:00Z');

function makeTask(over: Partial<OFTask>): OFTask {
  return {
    id: 'x', name: 'x', note: '', creationDate: '2026-01-01T00:00:00',
    modificationDate: '2026-01-01T00:00:00', dueDate: null, deferDate: null,
    plannedDate: null, flagged: false, completed: false, completionDate: null,
    projectName: null, tags: [], recurrence: null, repetitionSchedule: null,
    repetitionBasedOn: null, catchUpAutomatically: null, estimatedMinutes: null,
    ...over,
  };
}

describe('daysWaiting', () => {
  it('uses defer date when present', () => {
    expect(daysWaiting(makeTask({ deferDate: '2026-05-01T00:00:00' }), now)).toBe(31);
  });

  it('falls back to creation date when no defer date', () => {
    expect(daysWaiting(makeTask({ creationDate: '2026-04-01T00:00:00' }), now)).toBe(61);
  });
});

describe('withDaysWaiting', () => {
  it('attaches daysWaiting without dropping fields', () => {
    const aged = withDaysWaiting(makeTask({ name: 'Chase Bob', deferDate: '2026-05-22T00:00:00' }), now);
    expect(aged.name).toBe('Chase Bob');
    expect(aged.daysWaiting).toBe(10);
  });
});

describe('filterAndSortByAge', () => {
  const tasks = [
    withDaysWaiting(makeTask({ id: 'recent', deferDate: '2026-05-25T00:00:00' }), now), // 7
    withDaysWaiting(makeTask({ id: 'old', deferDate: '2026-03-01T00:00:00' }), now),     // 92
    withDaysWaiting(makeTask({ id: 'mid', deferDate: '2026-05-01T00:00:00' }), now),     // 31
  ];

  it('filters by minAgeDays', () => {
    const out = filterAndSortByAge(tasks, { minAgeDays: 30 });
    expect(out.map((t) => t.id).sort()).toEqual(['mid', 'old']);
  });

  it('sorts oldest first when sortByAge', () => {
    const out = filterAndSortByAge(tasks, { sortByAge: true });
    expect(out.map((t) => t.id)).toEqual(['old', 'mid', 'recent']);
  });

  it('returns input unchanged when no options given', () => {
    const out = filterAndSortByAge(tasks, {});
    expect(out).toHaveLength(3);
  });
});
