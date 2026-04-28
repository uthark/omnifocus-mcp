import { escapeForAppleScript } from './executor.js';
import { normalizeDateString } from './dates.js';
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
  const escaped = escapeForAppleScript(normalizeDateString(since));
  return buildPaginatedTaskQuery(
    'flattened tasks whose completed is true and completion date >= sinceDate',
    limit,
    `set sinceDate to date "${escaped}"`,
  );
}

export function buildGetFlaggedTasksScript(limit: number, deferBefore?: string): string {
  if (!deferBefore) {
    return buildPaginatedTaskQuery(
      'flattened tasks whose completed is false and flagged is true',
      limit,
    );
  }
  const escaped = escapeForAppleScript(normalizeDateString(deferBefore));
  return `
tell application "OmniFocus"
  tell default document
    set cutoff to date "${escaped}"
    set allTasks to flattened tasks whose completed is false and flagged is true
    set matchCount to 0
    set results to ""
    repeat with t in allTasks
      set d to defer date of t
      if d is missing value or d <= cutoff then
        set matchCount to matchCount + 1
        if matchCount <= ${limit} then
          set results to results & my taskRecord(t) & linefeed
        end if
      end if
    end repeat
    set output to "TOTAL:" & matchCount & linefeed & results
    return output
  end tell
end tell
${APPLESCRIPT_HELPERS}`;
}

export function buildGetAvailableTasksScript(projectId: string, limit: number): string {
  const escaped = escapeForAppleScript(projectId);
  return `
tell application "OmniFocus"
  tell default document
    set now to current date
    set proj to first flattened project whose id is "${escaped}"
    set projTasks to flattened tasks of proj whose completed is false and blocked is false
    set matchCount to 0
    set results to ""
    repeat with t in projTasks
      set effDefer to effective defer date of t
      if effDefer is missing value or effDefer < now then
        set matchCount to matchCount + 1
        set results to results & my taskRecord(t) & linefeed
        if matchCount = ${limit} then exit repeat
      end if
    end repeat
    set output to "TOTAL:" & matchCount & linefeed & results
    return output
  end tell
end tell
${APPLESCRIPT_HELPERS}`;
}

export function buildGetTasksByTagScript(tagNames: string[], limit: number): string {
  const escapedTags = tagNames.map((t) => `"${escapeForAppleScript(t)}"`).join(', ');
  return `
tell application "OmniFocus"
  tell default document
    set targetTagNames to {${escapedTags}}
    set seenIds to {}
    set matchCount to 0
    set results to ""
    repeat with tagName in targetTagNames
      set tg to first flattened tag whose name is (tagName as text)
      set tagTasks to remaining tasks of tg
      repeat with t in tagTasks
        set tid to id of t
        if seenIds does not contain tid then
          set end of seenIds to tid
          set matchCount to matchCount + 1
          if matchCount > ${limit} then
            -- already have enough results, just keep counting
          else
            set results to results & my taskRecord(t) & linefeed
          end if
        end if
      end repeat
    end repeat
    set output to "TOTAL:" & matchCount & linefeed & results
    return output
  end tell
end tell
${APPLESCRIPT_HELPERS}`;
}
