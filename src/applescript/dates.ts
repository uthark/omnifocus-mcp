// AppleScript's `date "..."` constructor uses the system's locale-dependent
// date parser. On macs configured for 24-hour time, the AM/PM marker is
// silently dropped, so `date "April 28, 2026 1:00 PM"` parses to 01:00.
// We normalize 12-hour times to 24-hour on the TS side before handing the
// string to AppleScript.
//
// More dangerously, the same parser silently misinterprets ISO-style strings
// like "2026-05-18" — on en_US it parses to "Thursday, October 5, year 12186",
// which then overflows OmniFocus's internal range to a sentinel near
// 2000-12-31. To avoid this, we never embed a string in `date "..."` for
// date-setting. Instead, parse the input into components on the TS side and
// emit an AppleScript block that constructs the date via property assignment
// (year / month / day / hours / minutes / seconds), bypassing the parser.

const AM_PM_PATTERN =
  /^(.*?)(?:[T\s]+)(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*(AM|PM|am|pm|a\.m\.|p\.m\.)\s*$/;

const TIME_ONLY_PATTERN = /^(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*(AM|PM|am|pm|a\.m\.|p\.m\.)\s*$/;

const ISO_PATTERN =
  /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;

const US_SLASH_PATTERN =
  /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;

function to24Hour(hour12: number, marker: string): number {
  const isPM = /p/i.test(marker);
  if (hour12 === 12) return isPM ? 12 : 0;
  return isPM ? hour12 + 12 : hour12;
}

export function normalizeDateString(input: string): string {
  const trimmed = input.trim();

  const timeOnly = trimmed.match(TIME_ONLY_PATTERN);
  if (timeOnly) {
    const [, hourStr, minStr = '00', secStr, marker] = timeOnly;
    const hour = to24Hour(parseInt(hourStr, 10), marker);
    const time = secStr
      ? `${pad(hour)}:${minStr}:${secStr}`
      : `${pad(hour)}:${minStr}`;
    return time;
  }

  const match = trimmed.match(AM_PM_PATTERN);
  if (!match) return trimmed;

  const [, datePart, hourStr, minStr = '00', secStr, marker] = match;
  const hour = to24Hour(parseInt(hourStr, 10), marker);
  const time = secStr
    ? `${pad(hour)}:${minStr}:${secStr}`
    : `${pad(hour)}:${minStr}`;
  return `${datePart.trim()} ${time}`;
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

export interface DateComponents {
  year: number;
  month: number; // 1-12
  day: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export function parseDateComponents(input: string): DateComponents {
  const normalized = normalizeDateString(input).trim();

  const isoMatch = normalized.match(ISO_PATTERN);
  if (isoMatch) {
    return {
      year: parseInt(isoMatch[1], 10),
      month: parseInt(isoMatch[2], 10),
      day: parseInt(isoMatch[3], 10),
      hours: isoMatch[4] ? parseInt(isoMatch[4], 10) : 0,
      minutes: isoMatch[5] ? parseInt(isoMatch[5], 10) : 0,
      seconds: isoMatch[6] ? parseInt(isoMatch[6], 10) : 0,
    };
  }

  const usMatch = normalized.match(US_SLASH_PATTERN);
  if (usMatch) {
    return {
      year: parseInt(usMatch[3], 10),
      month: parseInt(usMatch[1], 10),
      day: parseInt(usMatch[2], 10),
      hours: usMatch[4] ? parseInt(usMatch[4], 10) : 0,
      minutes: usMatch[5] ? parseInt(usMatch[5], 10) : 0,
      seconds: usMatch[6] ? parseInt(usMatch[6], 10) : 0,
    };
  }

  // Long-form ("May 18, 2026", "April 28, 2026 13:00") — defer to JS Date,
  // which handles English month names predictably across Node versions.
  const parsed = new Date(normalized);
  if (!isNaN(parsed.getTime())) {
    return {
      year: parsed.getFullYear(),
      month: parsed.getMonth() + 1,
      day: parsed.getDate(),
      hours: parsed.getHours(),
      minutes: parsed.getMinutes(),
      seconds: parsed.getSeconds(),
    };
  }

  throw new Error(`Unrecognized date format: "${input}"`);
}

// Emit AppleScript that builds a date via property assignment on a fresh
// `current date`, then assigns it to `target` (e.g., "defer date of t").
// Bypasses the locale-dependent date-string parser entirely.
//
// The property-assignment block is wrapped in `using terms from scripting
// additions` so that `day` / `year` / `month` / `hours` / `minutes` /
// `seconds` resolve to standard AppleScript date properties rather than
// terms from the surrounding `tell application "OmniFocus"` block (which
// claims `day` and would otherwise reject the script with -1723).
//
// `set day of _dv to 1` runs before year/month assignment to prevent
// month-rollover when the current day-of-month exceeds the target month's
// last day (e.g., today=Mar 31 → set month=Feb would otherwise roll to Mar 3).
//
// Safe to call multiple times in the same script — `_dv` is reused
// sequentially, never compared across blocks.
export function buildSetDateBlock(target: string, value: string, indent = '    '): string {
  if (value === '') {
    return `${indent}set ${target} to missing value`;
  }
  const c = parseDateComponents(value);
  return [
    `${indent}using terms from scripting additions`,
    `${indent}  set _dv to current date`,
    `${indent}  set day of _dv to 1`,
    `${indent}  set year of _dv to ${c.year}`,
    `${indent}  set month of _dv to ${c.month}`,
    `${indent}  set day of _dv to ${c.day}`,
    `${indent}  set hours of _dv to ${c.hours}`,
    `${indent}  set minutes of _dv to ${c.minutes}`,
    `${indent}  set seconds of _dv to ${c.seconds}`,
    `${indent}end using terms from`,
    `${indent}set ${target} to _dv`,
  ].join('\n');
}
