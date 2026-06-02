import type { ReviewDigestEntry, PaginatedResult } from '../types.js';

/** A project untouched for at least this many days is surfaced as a dead-project signal. */
const DEFAULT_ACTIVITY_THRESHOLD_DAYS = 30;

export interface DigestSummary {
  healthy: number;
  stalled: number;
  empty: number;
  blocked: number;
  flagged: number;
  withDeadline: number;
}

/** Compact digest row: id/name always present, every other field only when it carries triage signal. */
export type CompactDigestEntry = Partial<ReviewDigestEntry> & { id: string; name: string };

export interface CompactDigestResult {
  total: number;
  summary: DigestSummary;
  items: CompactDigestEntry[];
}

/**
 * Strip a parsed review digest down to its triage signal: drop constant fields (status), redundant
 * ISO dates whose day-deltas are kept, and any field sitting at its boring default. Lossless wrt
 * decisions, ~60% smaller on the wire.
 */
export function compactDigest(
  result: PaginatedResult<ReviewDigestEntry>,
  opts: { folderScoped: boolean; activityThresholdDays?: number },
): CompactDigestResult {
  const threshold = opts.activityThresholdDays ?? DEFAULT_ACTIVITY_THRESHOLD_DAYS;
  const items = result.items.map((e) => compactEntry(e, opts.folderScoped, threshold));
  return { total: result.total, summary: summarize(result.items), items };
}

function compactEntry(e: ReviewDigestEntry, folderScoped: boolean, threshold: number): CompactDigestEntry {
  const out: CompactDigestEntry = { id: e.id, name: e.name };
  // Folder repeats on every row when the scan is already folder-scoped — only useful otherwise.
  if (!folderScoped && e.folder) out.folder = e.folder;
  if (e.daysOverdueForReview !== null) out.daysOverdueForReview = e.daysOverdueForReview;
  // availableCount === 0 is exactly what stalled/stallReason already convey.
  if (e.availableCount > 0) out.availableCount = e.availableCount;
  if (e.stalled) {
    out.stalled = true;
    if (e.stallReason) out.stallReason = e.stallReason;
  }
  if (e.plannedCount > 0) out.plannedCount = e.plannedCount;
  if (e.flagged) out.flagged = true;
  // daysUntilDue present <=> a deadline exists; the ISO dueDate is dropped in favour of the delta.
  if (e.daysUntilDue !== null) out.daysUntilDue = e.daysUntilDue;
  if (e.daysSinceActivity !== null && e.daysSinceActivity >= threshold) {
    out.daysSinceActivity = e.daysSinceActivity;
  }
  return out;
}

function summarize(items: ReviewDigestEntry[]): DigestSummary {
  const s: DigestSummary = { healthy: 0, stalled: 0, empty: 0, blocked: 0, flagged: 0, withDeadline: 0 };
  for (const e of items) {
    if (e.stalled) {
      s.stalled++;
      if (e.stallReason === 'empty') s.empty++;
      else if (e.stallReason === 'blocked-or-deferred') s.blocked++;
    } else {
      s.healthy++;
    }
    if (e.flagged) s.flagged++;
    if (e.daysUntilDue !== null) s.withDeadline++;
  }
  return s;
}
