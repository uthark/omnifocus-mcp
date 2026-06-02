import type { OFTask } from '../types.js';
import { parseUtcDate, utcMidnight, diffDays } from '../utils/date.js';

export interface AgedTask extends OFTask {
  daysWaiting: number;
}

/** Days since the task started waiting: from its defer date if set, else its creation date. */
export function daysWaiting(task: OFTask, now: Date = new Date()): number {
  const ref = task.deferDate ?? task.creationDate;
  return diffDays(utcMidnight(now), parseUtcDate(ref));
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
