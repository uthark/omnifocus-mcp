import { describe, it, expect } from 'vitest';
import type { ReviewDigestEntry, PaginatedResult } from '../../types.js';
import { compactDigest } from '../_digest.js';

function makeEntry(over: Partial<ReviewDigestEntry> = {}): ReviewDigestEntry {
  return {
    id: 'p1',
    name: 'Proj',
    folder: '32 Inworld',
    status: 'active',
    flagged: false,
    dueDate: null,
    daysUntilDue: null,
    incompleteCount: 6,
    availableCount: 6,
    plannedCount: 0,
    stalled: false,
    stallReason: null,
    lastActivityDate: '2026-06-01T00:00:00',
    daysSinceActivity: 0,
    nextReviewDate: '2026-05-05T00:00:00',
    daysOverdueForReview: 28,
    ...over,
  };
}

function wrap(items: ReviewDigestEntry[]): PaginatedResult<ReviewDigestEntry> {
  return { total: items.length, items };
}

describe('compactDigest — healthy entry', () => {
  const result = compactDigest(wrap([makeEntry()]), { folderScoped: false });
  const e = result.items[0];

  it('keeps id, name, availableCount, daysOverdueForReview', () => {
    expect(e.id).toBe('p1');
    expect(e.name).toBe('Proj');
    expect(e.availableCount).toBe(6);
    expect(e.daysOverdueForReview).toBe(28);
  });

  it('drops constant and ISO-date fields', () => {
    expect('status' in e).toBe(false);
    expect('incompleteCount' in e).toBe(false);
    expect('lastActivityDate' in e).toBe(false);
    expect('nextReviewDate' in e).toBe(false);
    expect('dueDate' in e).toBe(false);
  });

  it('omits boring-default signal fields', () => {
    expect('stalled' in e).toBe(false);
    expect('stallReason' in e).toBe(false);
    expect('plannedCount' in e).toBe(false);
    expect('flagged' in e).toBe(false);
    expect('daysUntilDue' in e).toBe(false);
    expect('daysSinceActivity' in e).toBe(false);
  });
});

describe('compactDigest — stalled dead entry', () => {
  const result = compactDigest(
    wrap([
      makeEntry({
        incompleteCount: 0,
        availableCount: 0,
        stalled: true,
        stallReason: 'empty',
        daysSinceActivity: 620,
        daysOverdueForReview: 103,
      }),
    ]),
    { folderScoped: false },
  );
  const e = result.items[0];

  it('surfaces the stall signals', () => {
    expect(e.stalled).toBe(true);
    expect(e.stallReason).toBe('empty');
    expect(e.daysSinceActivity).toBe(620);
    expect(e.daysOverdueForReview).toBe(103);
  });

  it('omits availableCount when zero (stall already says it)', () => {
    expect('availableCount' in e).toBe(false);
  });
});

describe('compactDigest — folder field', () => {
  it('drops folder when folder-scoped', () => {
    const e = compactDigest(wrap([makeEntry()]), { folderScoped: true }).items[0];
    expect('folder' in e).toBe(false);
  });

  it('keeps folder when not folder-scoped', () => {
    const e = compactDigest(wrap([makeEntry()]), { folderScoped: false }).items[0];
    expect(e.folder).toBe('32 Inworld');
  });
});

describe('compactDigest — conditional fields', () => {
  it('includes plannedCount only when > 0', () => {
    const e = compactDigest(wrap([makeEntry({ plannedCount: 2 })]), { folderScoped: false }).items[0];
    expect(e.plannedCount).toBe(2);
  });

  it('includes flagged only when true', () => {
    const e = compactDigest(wrap([makeEntry({ flagged: true })]), { folderScoped: false }).items[0];
    expect(e.flagged).toBe(true);
  });

  it('includes daysUntilDue when a deadline exists, dropping ISO dueDate', () => {
    const e = compactDigest(
      wrap([makeEntry({ dueDate: '2026-06-10T00:00:00', daysUntilDue: 9 })]),
      { folderScoped: false },
    ).items[0];
    expect(e.daysUntilDue).toBe(9);
    expect('dueDate' in e).toBe(false);
  });
});

describe('compactDigest — daysSinceActivity threshold', () => {
  it('omits when below the default 30-day threshold', () => {
    const e = compactDigest(wrap([makeEntry({ daysSinceActivity: 10 })]), { folderScoped: false }).items[0];
    expect('daysSinceActivity' in e).toBe(false);
  });

  it('includes when at or above the default threshold', () => {
    const e = compactDigest(wrap([makeEntry({ daysSinceActivity: 30 })]), { folderScoped: false }).items[0];
    expect(e.daysSinceActivity).toBe(30);
  });

  it('respects a custom threshold', () => {
    const e = compactDigest(
      wrap([makeEntry({ daysSinceActivity: 45 })]),
      { folderScoped: false, activityThresholdDays: 60 },
    ).items[0];
    expect('daysSinceActivity' in e).toBe(false);
  });
});

describe('compactDigest — summary', () => {
  const result = compactDigest(
    wrap([
      makeEntry({ id: 'h1' }), // healthy
      makeEntry({ id: 'h2', flagged: true }), // healthy + flagged
      makeEntry({ id: 's1', availableCount: 0, stalled: true, stallReason: 'empty' }),
      makeEntry({ id: 's2', availableCount: 0, stalled: true, stallReason: 'blocked-or-deferred' }),
      makeEntry({ id: 'd1', dueDate: '2026-06-10T00:00:00', daysUntilDue: 9 }),
    ]),
    { folderScoped: false },
  );

  it('counts the portfolio breakdown over returned rows', () => {
    expect(result.summary).toEqual({
      healthy: 3,
      stalled: 2,
      empty: 1,
      blocked: 1,
      flagged: 1,
      withDeadline: 1,
    });
  });

  it('passes through the pagination total', () => {
    expect(result.total).toBe(5);
  });
});
