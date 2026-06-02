import { describe, it, expect } from 'vitest';
import {
  unescapeField,
  splitRecords,
  splitFields,
  parsePaginatedOutput,
  parseTaskFields,
  parseReviewDigest,
} from '../parser.js';

describe('unescapeField', () => {
  it('returns plain text unchanged', () => {
    expect(unescapeField('hello world')).toBe('hello world');
  });
  it('unescapes literal backslash-n to newline', () => {
    expect(unescapeField('line1\\nline2')).toBe('line1\nline2');
  });
  it('unescapes literal backslash-t to tab', () => {
    expect(unescapeField('col1\\tcol2')).toBe('col1\tcol2');
  });
  it('unescapes literal double backslash to single backslash', () => {
    expect(unescapeField('path\\\\file')).toBe('path\\file');
  });
  it('handles multiple escapes in one string', () => {
    expect(unescapeField('a\\nb\\tc\\\\')).toBe('a\nb\tc\\');
  });
  it('returns empty string for empty input', () => {
    expect(unescapeField('')).toBe('');
  });
});

describe('splitFields', () => {
  it('splits on tab character', () => {
    expect(splitFields('a\tb\tc')).toEqual(['a', 'b', 'c']);
  });
  it('handles single field', () => {
    expect(splitFields('only')).toEqual(['only']);
  });
  it('preserves empty fields', () => {
    expect(splitFields('a\t\tc')).toEqual(['a', '', 'c']);
  });
});

describe('splitRecords', () => {
  it('splits on newline', () => {
    expect(splitRecords('a\nb\nc')).toEqual(['a', 'b', 'c']);
  });
  it('filters empty trailing lines', () => {
    expect(splitRecords('a\nb\n')).toEqual(['a', 'b']);
  });
  it('returns empty array for empty input', () => {
    expect(splitRecords('')).toEqual([]);
  });
});

describe('parsePaginatedOutput', () => {
  it('extracts total from TOTAL: prefix line', () => {
    const result = parsePaginatedOutput('TOTAL:42\nrecord1\nrecord2');
    expect(result.total).toBe(42);
    expect(result.lines).toEqual(['record1', 'record2']);
  });
  it('handles zero total with no records', () => {
    const result = parsePaginatedOutput('TOTAL:0');
    expect(result.total).toBe(0);
    expect(result.lines).toEqual([]);
  });
});

describe('parseTaskFields', () => {
  it('parses a full task record', () => {
    const fields = [
      'id1', 'Buy milk', '', '2026-01-15T10:00:00', '2026-01-15T10:00:00',
      '2026-02-01T00:00:00', '', 'true', 'false', '', 'Groceries', 'Errands,Home',
      '2026-01-30T00:00:00', 'FREQ=WEEKLY;INTERVAL=1', 'regularly', 'based on due', 'true', '15',
    ];
    const task = parseTaskFields(fields);
    expect(task).toEqual({
      id: 'id1',
      name: 'Buy milk',
      note: '',
      creationDate: '2026-01-15T10:00:00',
      modificationDate: '2026-01-15T10:00:00',
      dueDate: '2026-02-01T00:00:00',
      deferDate: null,
      flagged: true,
      completed: false,
      completionDate: null,
      projectName: 'Groceries',
      tags: ['Errands', 'Home'],
      plannedDate: '2026-01-30T00:00:00',
      recurrence: 'FREQ=WEEKLY;INTERVAL=1',
      repetitionSchedule: 'regularly',
      repetitionBasedOn: 'due',
      catchUpAutomatically: true,
      estimatedMinutes: 15,
    });
  });
  it('handles missing optional fields', () => {
    const fields = ['id2', 'Task', '', '', '', '', '', 'false', 'false', '', '', ''];
    const task = parseTaskFields(fields);
    expect(task.dueDate).toBeNull();
    expect(task.projectName).toBeNull();
    expect(task.tags).toEqual([]);
  });
  it('unescapes name and note fields', () => {
    const fields = [
      'id3', 'Line1\\nLine2', 'Note\\twith\\ttabs', '', '', '', '', 'false', 'false', '', '', '',
    ];
    const task = parseTaskFields(fields);
    expect(task.name).toBe('Line1\nLine2');
    expect(task.note).toBe('Note\twith\ttabs');
  });
});

describe('parseReviewDigest', () => {
  const now = new Date('2026-06-01T00:00:00');

  it('parses an enriched, stalled (blocked) project row', () => {
    const output = [
      'TOTAL:1',
      'p1\tMy Project\tWork\tactive status\ttrue\t2026-06-08T00:00:00\t5\t0\t0\t2026-03-01T00:00:00\t2026-05-01T00:00:00',
    ].join('\n');
    const r = parseReviewDigest(output, now);
    expect(r.total).toBe(1);
    const e = r.items[0];
    expect(e.id).toBe('p1');
    expect(e.name).toBe('My Project');
    expect(e.folder).toBe('Work');
    expect(e.status).toBe('active');
    expect(e.flagged).toBe(true);
    expect(e.dueDate).toBe('2026-06-08T00:00:00');
    expect(e.daysUntilDue).toBe(7);
    expect(e.incompleteCount).toBe(5);
    expect(e.availableCount).toBe(0);
    expect(e.plannedCount).toBe(0);
    expect(e.stalled).toBe(true);
    expect(e.stallReason).toBe('blocked-or-deferred');
    expect(e.daysSinceActivity).toBe(92);
    expect(e.daysOverdueForReview).toBe(31);
  });

  it('classifies an empty project as stalled/empty with null dates', () => {
    const output = [
      'TOTAL:1',
      'p2\tEmpty\t\tactive status\tfalse\t\t0\t0\t0\t2026-05-20T00:00:00\t',
    ].join('\n');
    const e = parseReviewDigest(output, now).items[0];
    expect(e.folder).toBeNull();
    expect(e.flagged).toBe(false);
    expect(e.dueDate).toBeNull();
    expect(e.daysUntilDue).toBeNull();
    expect(e.stalled).toBe(true);
    expect(e.stallReason).toBe('empty');
    expect(e.nextReviewDate).toBeNull();
    expect(e.daysOverdueForReview).toBeNull();
  });

  it('a project with available actions is not stalled', () => {
    const output = [
      'TOTAL:1',
      'p3\tHealthy\tHome\tactive status\tfalse\t\t4\t2\t1\t2026-05-31T00:00:00\t2026-06-15T00:00:00',
    ].join('\n');
    const e = parseReviewDigest(output, now).items[0];
    expect(e.availableCount).toBe(2);
    expect(e.plannedCount).toBe(1);
    expect(e.stalled).toBe(false);
    expect(e.stallReason).toBeNull();
    expect(e.daysOverdueForReview).toBe(-14);
  });

  it('returns empty for a zero-match digest', () => {
    const r = parseReviewDigest('TOTAL:0\n', now);
    expect(r.total).toBe(0);
    expect(r.items).toEqual([]);
  });
});
