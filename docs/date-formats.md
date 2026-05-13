# Date format handling

All MCP tool parameters accepting dates (`dueDate`, `deferDate`, `plannedDate`, `nextReviewDate`, `since`, `deferBefore`) accept multiple input formats. The TS layer parses the input into year/month/day/hours/minutes/seconds **on this side** and emits AppleScript that assigns those numeric components onto a fresh `current date` — bypassing the locale-dependent `date "..."` string parser entirely.

This is the safe path. Callers do not need to know about AppleScript's quirks.

## Accepted input formats

| Format | Example |
|---|---|
| ISO date | `2026-05-18` |
| ISO datetime with `T` | `2026-05-18T09:00:00` |
| ISO datetime with space | `2026-05-18 17:00` |
| US slash date | `5/18/2026` |
| US slash datetime | `5/18/2026 17:00` |
| Long form | `May 18, 2026` |
| Long form with time | `April 28, 2026 1:00 PM` |
| 12-hour AM/PM variants | `1pm`, `1:30 PM`, `1:00 p.m.` |

AM/PM is normalized to 24-hour. Unrecognized formats throw `Unrecognized date format: "<input>"` at script-build time (not silently misinterpreted at runtime).

## Why the indirection?

AppleScript's `date "..."` constructor uses `NSDateFormatter` with the system locale, and it is **silently wrong** on ISO-style inputs. On `en_US`:

```bash
$ osascript -e 'return date "2026-05-18"'
date Thursday, October 5, 12186 at 00:00:00
```

The dashes confuse the scanner; the year is interpreted as ~12186. When OmniFocus stores that out-of-range value, it overflows to a sentinel near `2000-12-31T16:00:00`. The tool would return `success: true` with the date silently wrong.

Earlier versions of this MCP server embedded the input string in `date "..."` directly and were vulnerable to this bug. As of the date-parsing rewrite, we never embed user input in `date "..."`.

## How it works internally

```
caller passes "2026-05-18T09:00:00"
   ↓
src/applescript/dates.ts → normalizeDateString  (AM/PM → 24h)
   ↓
src/applescript/dates.ts → parseDateComponents  (regex / JS Date fallback)
   ↓
{ year: 2026, month: 5, day: 18, hours: 9, minutes: 0, seconds: 0 }
   ↓
src/applescript/dates.ts → buildSetDateBlock
   ↓
AppleScript:
    using terms from scripting additions    ← required so `day` etc. resolve
      set _dv to current date                  to the standard date class
      set day of _dv to 1                      properties rather than the
      set year of _dv to 2026                  OmniFocus tell-block terms
      set month of _dv to 5                    (`day` collides there: -1723)
      set day of _dv to 18
      set hours of _dv to 9
      set minutes of _dv to 0
      set seconds of _dv to 0
    end using terms from
    set defer date of t to _dv
```

The `set day of _dv to 1` line runs before year/month assignment to prevent month-rollover (e.g., today=Mar 31, set month=Feb would otherwise roll to Mar 3 because Feb 31 doesn't exist).

The `_dv` variable is intentionally reused across multiple date blocks in the same script — each block reassigns `current date` to it before setting properties, so there is no cross-block interference. Safe and idiomatic.

## Tests

- `src/applescript/__tests__/dates.test.ts` — covers `normalizeDateString`, `parseDateComponents`, `buildSetDateBlock`.
- `src/applescript/__tests__/{tasks,inbox,projects,review}.test.ts` — verify the property-assignment block appears in each script that sets a date.

## Extending the parser

To add a new accepted format, add a regex branch in `parseDateComponents` (in `src/applescript/dates.ts`). The `new Date()` fallback already handles many English-language formats; only add explicit branches if the JS `Date` constructor misinterprets the format you need.
