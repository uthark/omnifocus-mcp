import { escapeForAppleScript } from './executor.js';
import { APPLESCRIPT_HELPERS, buildPaginatedTaskQuery } from './parser.js';

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

export function buildGetStaleTasksScript(projectId: string, daysSinceModified: number, limit: number): string {
  const escaped = escapeForAppleScript(projectId);
  return `
tell application "OmniFocus"
  tell default document
    set cutoffDate to (current date) - (${daysSinceModified} * days)
    set proj to first flattened project whose id is "${escaped}"
    set matchingTasks to (flattened tasks of proj whose completed is false and modification date < cutoffDate)
    set matchCount to count of matchingTasks
    set output to "TOTAL:" & matchCount & linefeed
    set maxCount to matchCount
    if maxCount > ${limit} then set maxCount to ${limit}
    repeat with i from 1 to maxCount
      set t to item i of matchingTasks
      set taskId to id of t
      set taskName to my escapeField(name of t)
      set mDate to my formatDate(modification date of t)
      set output to output & taskId & tab & taskName & tab & mDate & linefeed
    end repeat
    return output
  end tell
end tell
${APPLESCRIPT_HELPERS}`;
}

export function buildGetOverdueTasksScript(limit: number): string {
  return buildPaginatedTaskQuery(
    'flattened tasks whose completed is false and due date < now',
    limit,
    'set now to current date',
  );
}

export function buildGetForecastScript(days: number, limit: number): string {
  return buildPaginatedTaskQuery(
    'flattened tasks whose completed is false and due date >= now and due date <= futureDate',
    limit,
    `set now to current date\n    set futureDate to now + (${days} * days)`,
  );
}

export function buildGetCompletedTasksScript(since: string, limit: number): string {
  const escaped = escapeForAppleScript(since);
  return buildPaginatedTaskQuery(
    'flattened tasks whose completed is true and completion date >= sinceDate',
    limit,
    `set sinceDate to date "${escaped}"`,
  );
}
