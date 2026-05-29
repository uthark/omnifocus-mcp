import { describe, it, expect } from 'vitest';
import { compactJson } from '../_compact.js';

describe('compactJson', () => {
  it('drops null and undefined', () => {
    const out = JSON.parse(compactJson({ a: 1, b: null, c: undefined }));
    expect(out).toEqual({ a: 1 });
  });

  it('drops empty strings and empty arrays', () => {
    const out = JSON.parse(compactJson({ a: 1, note: '', tags: [] }));
    expect(out).toEqual({ a: 1 });
  });

  it('preserves false, 0, and non-empty strings/arrays', () => {
    const out = JSON.parse(
      compactJson({ flagged: false, count: 0, name: 'x', tags: ['y'] }),
    );
    expect(out).toEqual({ flagged: false, count: 0, name: 'x', tags: ['y'] });
  });

  it('recurses into nested objects and arrays', () => {
    const out = JSON.parse(
      compactJson({
        items: [
          { id: '1', dueDate: null, name: 'a' },
          { id: '2', dueDate: '2026-01-01', note: '' },
        ],
        cursor: null,
      }),
    );
    expect(out).toEqual({
      items: [
        { id: '1', name: 'a' },
        { id: '2', dueDate: '2026-01-01' },
      ],
    });
  });

  it('drops nested objects that become empty after pruning', () => {
    const out = JSON.parse(
      compactJson({ a: 1, meta: { x: null, y: '' } }),
    );
    expect(out).toEqual({ a: 1 });
  });

  it('emits single-line JSON (no pretty-print whitespace)', () => {
    const s = compactJson({ a: 1, b: 2 });
    expect(s).toBe('{"a":1,"b":2}');
    expect(s).not.toContain('\n');
  });

  it('handles root-level scalars, arrays, and objects', () => {
    expect(compactJson(42)).toBe('42');
    expect(compactJson('hi')).toBe('"hi"');
    expect(compactJson([1, null, 2])).toBe('[1,null,2]');
    expect(compactJson({ a: null })).toBe('{}');
  });

  it('leaves Date instances intact (serializes via toJSON)', () => {
    const d = new Date('2026-01-01T00:00:00.000Z');
    const s = compactJson({ when: d });
    expect(s).toBe('{"when":"2026-01-01T00:00:00.000Z"}');
  });
});
