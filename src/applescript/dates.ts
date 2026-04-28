// AppleScript's `date "..."` constructor uses the system's locale-dependent
// date parser. On macs configured for 24-hour time, the AM/PM marker is
// silently dropped, so `date "April 28, 2026 1:00 PM"` parses to 01:00.
// We normalize 12-hour times to 24-hour on the TS side before handing the
// string to AppleScript.

const AM_PM_PATTERN =
  /^(.*?)(?:[T\s]+)(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*(AM|PM|am|pm|a\.m\.|p\.m\.)\s*$/;

const TIME_ONLY_PATTERN = /^(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*(AM|PM|am|pm|a\.m\.|p\.m\.)\s*$/;

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
