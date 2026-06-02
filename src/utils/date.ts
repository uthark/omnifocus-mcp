/**
 * Parse an ISO-like string as UTC. If the string carries no timezone, append
 * 'Z' so it is interpreted as UTC rather than local time — this keeps day-diff
 * math immune to the runner's timezone and to DST boundaries.
 */
export function parseUtcDate(s: string): Date {
  return new Date(s.includes('Z') || s.includes('+') ? s : s + 'Z');
}

/** The UTC-midnight instant of the given moment's UTC calendar day. */
export function utcMidnight(d: Date): Date {
  return new Date(d.toISOString().slice(0, 10) + 'T00:00:00Z');
}

/** Whole days from `b` to `a` (a − b), floored. */
export function diffDays(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / 86_400_000);
}
