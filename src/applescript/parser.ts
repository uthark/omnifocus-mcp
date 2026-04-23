import type { OFFolder, OFProject, OFTask, StaleTask, PaginatedResult } from '../types.js';

export function unescapeField(value: string): string {
  if (value === '') return '';
  let result = '';
  let i = 0;
  while (i < value.length) {
    if (value[i] === '\\' && i + 1 < value.length) {
      const next = value[i + 1];
      if (next === 'n') { result += '\n'; i += 2; continue; }
      if (next === 't') { result += '\t'; i += 2; continue; }
      if (next === '\\') { result += '\\'; i += 2; continue; }
    }
    result += value[i];
    i++;
  }
  return result;
}

export function splitFields(line: string): string[] {
  return line.split('\t');
}

export function splitRecords(output: string): string[] {
  return output.split('\n').filter((line) => line !== '');
}

export function parsePaginatedOutput(output: string): { total: number; lines: string[] } {
  const records = splitRecords(output);
  if (records.length === 0) return { total: 0, lines: [] };
  const firstLine = records[0];
  if (firstLine.startsWith('TOTAL:')) {
    const total = parseInt(firstLine.slice(6), 10);
    return { total, lines: records.slice(1) };
  }
  return { total: records.length, lines: records };
}

export function parseTaskFields(fields: string[]): OFTask {
  return {
    id: fields[0] ?? '',
    name: unescapeField(fields[1] ?? ''),
    note: unescapeField(fields[2] ?? ''),
    creationDate: fields[3] ?? '',
    modificationDate: fields[4] ?? '',
    dueDate: fields[5] || null,
    deferDate: fields[6] || null,
    flagged: fields[7] === 'true',
    completed: fields[8] === 'true',
    completionDate: fields[9] || null,
    projectName: fields[10] || null,
    tags: fields[11] ? fields[11].split(',').filter((t) => t !== '') : [],
  };
}

/**
 * Shared AppleScript handlers for escaping fields, formatting dates,
 * collecting tag names, and building task records.
 */
export const APPLESCRIPT_HELPERS = `
on escapeField(theText)
  if theText is missing value then return ""
  set theText to theText as text
  set theText to my replaceText(theText, "\\\\", "\\\\\\\\")
  set theText to my replaceText(theText, tab, "\\\\t")
  set theText to my replaceText(theText, linefeed, "\\\\n")
  set theText to my replaceText(theText, return, "\\\\n")
  return theText
end escapeField

on replaceText(theText, searchFor, replaceWith)
  set oldDelims to AppleScript's text item delimiters
  set AppleScript's text item delimiters to searchFor
  set textItems to text items of theText
  set AppleScript's text item delimiters to replaceWith
  set theText to textItems as text
  set AppleScript's text item delimiters to oldDelims
  return theText
end replaceText

on formatDate(theDate)
  if theDate is missing value then return ""
  set y to year of theDate
  set m to (month of theDate as integer)
  set d to day of theDate
  set t to time of theDate
  set h to t div 3600
  set min to (t mod 3600) div 60
  set s to t mod 60
  set pad to "0"
  set mStr to text -2 thru -1 of (pad & m)
  set dStr to text -2 thru -1 of (pad & d)
  set hStr to text -2 thru -1 of (pad & h)
  set minStr to text -2 thru -1 of (pad & min)
  set sStr to text -2 thru -1 of (pad & s)
  return (y as text) & "-" & mStr & "-" & dStr & "T" & hStr & ":" & minStr & ":" & sStr
end formatDate

on getTagNames(t)
  using terms from application "OmniFocus"
    set tagNames to ""
    repeat with tg in tags of t
      if tagNames is not "" then set tagNames to tagNames & ","
      set tagNames to tagNames & name of tg
    end repeat
    return tagNames
  end using terms from
end getTagNames

on taskRecord(t)
  using terms from application "OmniFocus"
    set taskId to id of t
    set taskName to my escapeField(name of t)
    set taskNote to my escapeField(note of t)
    set cDateVal to creation date of t
    set cDate to my formatDate(cDateVal)
    set mDateVal to modification date of t
    set mDate to my formatDate(mDateVal)
    set duDateVal to due date of t
    set duDate to my formatDate(duDateVal)
    set defDateVal to defer date of t
    set defDate to my formatDate(defDateVal)
    set isFlagged to flagged of t
    set isCompleted to completed of t
    set compDateVal to completion date of t
    set compDate to my formatDate(compDateVal)
    try
      set projName to my escapeField(name of containing project of t)
    on error
      set projName to ""
    end try
    set tagStr to my getTagNames(t)
    return taskId & tab & taskName & tab & taskNote & tab & cDate & tab & mDate & tab & duDate & tab & defDate & tab & isFlagged & tab & isCompleted & tab & compDate & tab & projName & tab & tagStr
  end using terms from
end taskRecord`;

// ── Consolidated output parsers ──────────────────────────────────────

export function parsePaginatedTasks(output: string): PaginatedResult<OFTask> {
  const { total, lines } = parsePaginatedOutput(output);
  const items = lines.map((line) => parseTaskFields(splitFields(line)));
  return { total, items };
}

export function parseProjects(output: string): OFProject[] {
  return splitRecords(output).map((line) => {
    const fields = splitFields(line);
    return {
      id: fields[0] ?? '',
      name: unescapeField(fields[1] ?? ''),
      note: unescapeField(fields[2] ?? ''),
      status: ((fields[3] ?? 'active').replace(' status', '')) as OFProject['status'],
      taskCount: parseInt(fields[4] ?? '0', 10),
      nextReviewDate: fields[5] || null,
      reviewInterval: parseInt(fields[6] ?? '0', 10),
    };
  });
}

export function parseFolders(output: string): OFFolder[] {
  return splitRecords(output).map((line) => {
    const fields = splitFields(line);
    return {
      id: fields[0] ?? '',
      name: unescapeField(fields[1] ?? ''),
      projectCount: parseInt(fields[2] ?? '0', 10),
    };
  });
}

export function parseStaleTasks(output: string): PaginatedResult<StaleTask> {
  const { total, lines } = parsePaginatedOutput(output);
  const items = lines.map((line) => {
    const fields = splitFields(line);
    return {
      id: fields[0] ?? '',
      name: unescapeField(fields[1] ?? ''),
      modificationDate: fields[2] || null,
    };
  });
  return { total, items };
}

// ── Shared AppleScript query templates ───────────────────────────────

/**
 * Builds a paginated task query using a `whose` clause.
 * Returns tasks formatted via `taskRecord` with a TOTAL: header.
 */
export function buildPaginatedTaskQuery(whoseClause: string, limit: number, preamble = ''): string {
  const preambleBlock = preamble ? `${preamble}\n    ` : '';
  return `
tell application "OmniFocus"
  tell default document
    ${preambleBlock}set matchingTasks to (${whoseClause})
    set matchCount to count of matchingTasks
    set output to "TOTAL:" & matchCount & linefeed
    set maxCount to matchCount
    if maxCount > ${limit} then set maxCount to ${limit}
    repeat with i from 1 to maxCount
      set t to item i of matchingTasks
      set output to output & my taskRecord(t) & linefeed
    end repeat
    return output
  end tell
end tell
${APPLESCRIPT_HELPERS}`;
}

/**
 * Builds a paginated task query using offset/limit on a pre-fetched task list.
 * The `taskSetup` must assign the result to a variable named `allTasks`.
 */
export function buildOffsetTaskQuery(taskSetup: string, offset: number, limit: number): string {
  return `
tell application "OmniFocus"
  tell default document
    ${taskSetup}
    set taskCount to count of allTasks
    set output to "TOTAL:" & taskCount & linefeed
    set startIdx to ${offset + 1}
    set endIdx to ${offset + limit}
    if endIdx > taskCount then set endIdx to taskCount
    if startIdx > taskCount then return output
    repeat with i from startIdx to endIdx
      set t to item i of allTasks
      set output to output & my taskRecord(t) & linefeed
    end repeat
    return output
  end tell
end tell
${APPLESCRIPT_HELPERS}`;
}
