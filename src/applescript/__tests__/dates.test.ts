import { describe, it, expect } from 'vitest';
import { normalizeDateString, parseDateComponents, buildSetDateBlock } from '../dates.js';

describe('normalizeDateString', () => {
  describe('AM/PM with full date', () => {
    it('converts PM time to 24-hour', () => {
      expect(normalizeDateString('April 28, 2026 1:00 PM')).toBe('April 28, 2026 13:00');
    });

    it('converts AM time to 24-hour', () => {
      expect(normalizeDateString('April 28, 2026 9:00 AM')).toBe('April 28, 2026 09:00');
    });

    it('handles 12 PM (noon)', () => {
      expect(normalizeDateString('May 1, 2026 12:00 PM')).toBe('May 1, 2026 12:00');
    });

    it('handles 12 AM (midnight)', () => {
      expect(normalizeDateString('May 1, 2026 12:00 AM')).toBe('May 1, 2026 00:00');
    });

    it('handles lowercase pm', () => {
      expect(normalizeDateString('April 28, 2026 1:00 pm')).toBe('April 28, 2026 13:00');
    });

    it('handles compact form like "1pm"', () => {
      expect(normalizeDateString('April 28, 2026 1pm')).toBe('April 28, 2026 13:00');
    });

    it('handles seconds in input', () => {
      expect(normalizeDateString('April 28, 2026 1:30:45 PM')).toBe('April 28, 2026 13:30:45');
    });

    it('handles ISO-like date with PM time', () => {
      expect(normalizeDateString('2026-04-28 1:00 PM')).toBe('2026-04-28 13:00');
    });

    it('handles a.m. / p.m. with periods', () => {
      expect(normalizeDateString('April 28, 2026 1:00 p.m.')).toBe('April 28, 2026 13:00');
    });
  });

  describe('time-only inputs', () => {
    it('converts standalone "1pm" to 13:00', () => {
      expect(normalizeDateString('1pm')).toBe('13:00');
    });

    it('converts standalone "9am" to 09:00', () => {
      expect(normalizeDateString('9am')).toBe('09:00');
    });

    it('preserves minutes in time-only input', () => {
      expect(normalizeDateString('1:30 PM')).toBe('13:30');
    });
  });

  describe('passthrough cases', () => {
    it('leaves 24-hour times alone', () => {
      expect(normalizeDateString('April 28, 2026 13:00')).toBe('April 28, 2026 13:00');
    });

    it('leaves date-only strings alone', () => {
      expect(normalizeDateString('April 28, 2026')).toBe('April 28, 2026');
    });

    it('leaves ISO date alone', () => {
      expect(normalizeDateString('2026-04-28')).toBe('2026-04-28');
    });

    it('trims surrounding whitespace', () => {
      expect(normalizeDateString('  April 28, 2026  ')).toBe('April 28, 2026');
    });
  });
});

describe('parseDateComponents', () => {
  it('parses ISO date', () => {
    expect(parseDateComponents('2026-05-18')).toEqual({
      year: 2026, month: 5, day: 18, hours: 0, minutes: 0, seconds: 0,
    });
  });

  it('parses ISO datetime with T separator', () => {
    expect(parseDateComponents('2026-05-18T09:30:45')).toEqual({
      year: 2026, month: 5, day: 18, hours: 9, minutes: 30, seconds: 45,
    });
  });

  it('parses ISO datetime with space separator', () => {
    expect(parseDateComponents('2026-05-18 17:00')).toEqual({
      year: 2026, month: 5, day: 18, hours: 17, minutes: 0, seconds: 0,
    });
  });

  it('parses US slash date', () => {
    expect(parseDateComponents('5/18/2026')).toEqual({
      year: 2026, month: 5, day: 18, hours: 0, minutes: 0, seconds: 0,
    });
  });

  it('parses US slash datetime', () => {
    expect(parseDateComponents('5/18/2026 17:00')).toEqual({
      year: 2026, month: 5, day: 18, hours: 17, minutes: 0, seconds: 0,
    });
  });

  it('parses long form with month name', () => {
    expect(parseDateComponents('May 18, 2026')).toEqual({
      year: 2026, month: 5, day: 18, hours: 0, minutes: 0, seconds: 0,
    });
  });

  it('parses long form with PM time after normalization', () => {
    expect(parseDateComponents('April 28, 2026 1:00 PM')).toEqual({
      year: 2026, month: 4, day: 28, hours: 13, minutes: 0, seconds: 0,
    });
  });

  it('throws on unrecognized input', () => {
    expect(() => parseDateComponents('not a date')).toThrow(/Unrecognized date format/);
  });
});

describe('buildSetDateBlock', () => {
  it('emits property-assignment block bypassing the AppleScript date parser', () => {
    const block = buildSetDateBlock('defer date of t', '2026-05-18T09:00:00');
    expect(block).toContain('set _dv to current date');
    expect(block).toContain('set day of _dv to 1');
    expect(block).toContain('set year of _dv to 2026');
    expect(block).toContain('set month of _dv to 5');
    expect(block).toContain('set day of _dv to 18');
    expect(block).toContain('set hours of _dv to 9');
    expect(block).toContain('set defer date of t to _dv');
    expect(block).not.toContain('date "2026-05-18');
  });

  it('emits missing value for empty string', () => {
    expect(buildSetDateBlock('defer date of t', '')).toBe('    set defer date of t to missing value');
  });

  it('respects custom indent', () => {
    const block = buildSetDateBlock('cutoff', '2026-05-18', '');
    expect(block.startsWith('using terms from scripting additions')).toBe(true);
    expect(block).toContain('set _dv to current date');
  });

  it('sets day=1 BEFORE year/month to avoid month-rollover', () => {
    const block = buildSetDateBlock('defer date of t', '2026-02-15');
    const dayResetIdx = block.indexOf('set day of _dv to 1');
    const monthIdx = block.indexOf('set month of _dv to 2');
    expect(dayResetIdx).toBeGreaterThanOrEqual(0);
    expect(monthIdx).toBeGreaterThan(dayResetIdx);
  });
});
