import type { OFTask } from '../types.js';

export interface AgedTask extends OFTask {
  daysWaiting: number;
}

/** Parse a naive ISO date string as UTC to avoid DST-induced day shifts. */
function parseUtcDate(s: string): Date {
  return new Date(s.includes('Z') || s.includes('+') ? s : s + 'Z');
}

/** Days since the task started waiting: from its defer date if set, else its creation date. */
export function daysWaiting(task: OFTask, now: Date = new Date()): number {
  const ref = task.deferDate ?? task.creationDate;
  // Anchor both ends to UTC midnight to make the diff DST-immune
  const refUtc = parseUtcDate(ref);
  const nowUtc = new Date(now.toISOString().slice(0, 10) + 'T00:00:00Z');
  return Math.floor((nowUtc.getTime() - refUtc.getTime()) / 86_400_000);
}

export function withDaysWaiting(task: OFTask, now: Date = new Date()): AgedTask {
  return { ...task, daysWaiting: daysWaiting(task, now) };
}

export function filterAndSortByAge(
  tasks: AgedTask[],
  opts: { minAgeDays?: number; sortByAge?: boolean },
): AgedTask[] {
  let out = tasks;
  if (opts.minAgeDays !== undefined) {
    out = out.filter((t) => t.daysWaiting >= opts.minAgeDays!);
  }
  if (opts.sortByAge) {
    out = [...out].sort((a, b) => b.daysWaiting - a.daysWaiting);
  }
  return out;
}
