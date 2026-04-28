import { describe, it, expect } from 'vitest';
import { normalizeDateString } from '../dates.js';

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
