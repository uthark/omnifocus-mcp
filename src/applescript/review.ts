import { escapeForAppleScript } from './executor.js';
import {
  splitRecords,
  splitFields,
  unescapeField,
  parsePaginatedOutput,
  parseTaskFields,
  APPLESCRIPT_HELPERS,
} from './parser.js';
import type { OFProject, OFTask, PaginatedResult } from '../types.js';

export function buildGetProjectsDueForReviewScript(limit: number): string {
  return `
tell application "OmniFocus"
  tell default document
    set output to ""
    set now to current date
    set allProjects to flattened projects whose status is active
    set count_ to 0
    repeat with p in allProjects
      if next review date of p is not missing value and next review date of p < now then
        set projId to id of p
        set projName to my escapeField(name of p)
        set projNote to my escapeField(note of p)
        set projStatus to status of p as text
        set tCount to count of (flattened tasks of p whose completed is false)
        set revDate to my formatDate(next review date of p)
        try
          set revRec to review interval of p
          set revInterval to (steps of revRec) as text
        on error
          set revInterval to "0"
        end try
        set output to output & projId & tab & projName & tab & projNote & tab & projStatus & tab & tCount & tab & revDate & tab & revInterval & linefeed
        set count_ to count_ + 1
        if count_ >= ${limit} then exit repeat
      end if
    end repeat
    return output
  end tell
end tell
${APPLESCRIPT_HELPERS}`;
}

export function buildMarkProjectReviewedScript(projectId: string): string {
  const escaped = escapeForAppleScript(projectId);
  return `
tell application "OmniFocus"
  tell default document
    set proj to first flattened project whose id is "${escaped}"
    mark reviewed proj
    return id of proj
  end tell
end tell`;
}

export function buildGetStaleTasksScript(daysSinceModified: number, limit: number): string {
  return `
tell application "OmniFocus"
  tell default document
    set cutoffDate to (current date) - (${daysSinceModified} * days)
    set allTasks to flattened tasks whose completed is false
    set allIds to id of allTasks
    set allNames to name of allTasks
    set allModDates to modification date of allTasks
    set output to ""
    set matchCount to 0
    repeat with i from 1 to count of allIds
      set modDateVal to item i of allModDates
      if modDateVal is not missing value and modDateVal < cutoffDate then
        set taskId to item i of allIds
        set taskName to my escapeField(item i of allNames)
        set mDate to my formatDate(modDateVal)
        set output to output & taskId & tab & taskName & tab & mDate & linefeed
        set matchCount to matchCount + 1
        if matchCount >= ${limit} then exit repeat
      end if
    end repeat
    set output to "TOTAL:" & matchCount & linefeed & output
    return output
  end tell
end tell
${APPLESCRIPT_HELPERS}`;
}

export function buildGetOverdueTasksScript(limit: number): string {
  return `
tell application "OmniFocus"
  tell default document
    set output to ""
    set now to current date
    set matchingTasks to (flattened tasks whose completed is false and due date < now)
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

export function buildGetForecastScript(days: number, limit: number): string {
  return `
tell application "OmniFocus"
  tell default document
    set output to ""
    set now to current date
    set futureDate to now + (${days} * days)
    set matchingTasks to (flattened tasks whose completed is false and due date >= now and due date <= futureDate)
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

export function buildGetCompletedTasksScript(since: string, limit: number): string {
  const escaped = escapeForAppleScript(since);
  return `
tell application "OmniFocus"
  tell default document
    set output to ""
    set sinceDate to date "${escaped}"
    set matchingTasks to (flattened tasks whose completed is true and completion date >= sinceDate)
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

export function parseProjectsForReviewOutput(output: string): OFProject[] {
  const records = splitRecords(output);
  return records.map((line) => {
    const fields = splitFields(line);
    return {
      id: fields[0] ?? '',
      name: unescapeField(fields[1] ?? ''),
      note: unescapeField(fields[2] ?? ''),
      status: (fields[3] ?? 'active') as OFProject['status'],
      taskCount: parseInt(fields[4] ?? '0', 10),
      nextReviewDate: fields[5] || null,
      reviewInterval: parseInt(fields[6] ?? '0', 10),
    };
  });
}

export function parseTaskListOutput(output: string): PaginatedResult<OFTask> {
  const { total, lines } = parsePaginatedOutput(output);
  const items = lines.map((line) => parseTaskFields(splitFields(line)));
  return { total, items };
}

export interface StaleTask {
  id: string;
  name: string;
  modificationDate: string | null;
}

export function parseStaleTasksOutput(output: string): PaginatedResult<StaleTask> {
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
