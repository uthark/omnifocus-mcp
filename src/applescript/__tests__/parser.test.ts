import { describe, it, expect } from 'vitest';
import {
  unescapeField,
  splitRecords,
  splitFields,
  parsePaginatedOutput,
  parseTaskFields,
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
