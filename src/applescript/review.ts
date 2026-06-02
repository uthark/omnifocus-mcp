import { escapeForAppleScript } from './executor.js';
import { buildSetDateBlock } from './dates.js';
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
    set last review date of proj to (current date)
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
  // Preamble is interpolated after `    ` in the template, so first line
  // inherits that indent — strip leading indent from `buildSetDateBlock` and
  // re-indent the rest to align with the surrounding 4-space block.
  const preamble = buildSetDateBlock('sinceDate', since, '').replace(/\n/g, '\n    ');
  return buildPaginatedTaskQuery(
    'flattened tasks whose completed is true and completion date >= sinceDate',
    limit,
    preamble,
  );
}

export function buildGetFlaggedTasksScript(limit: number, deferBefore?: string): string {
  if (!deferBefore) {
    return buildPaginatedTaskQuery(
      'flattened tasks whose completed is false and flagged is true',
      limit,
    );
  }
  const setCutoff = buildSetDateBlock('cutoff', deferBefore);
  return `
tell application "OmniFocus"
  tell default document
${setCutoff}
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

export function buildGetReviewDigestScript(options: {
  scope: 'due' | 'all-active';
  folderId?: string;
  includeOnHold: boolean;
  onlyStalled: boolean;
  limit: number;
  offset: number;
}): string {
  const statusClause = options.includeOnHold
    ? 'status is active or status is on hold'
    : 'status is active';
  const projectSet = options.folderId
    ? `set targetFolder to first flattened folder whose id is "${escapeForAppleScript(options.folderId)}"
    set candidates to (flattened projects of targetFolder whose ${statusClause})`
    : `set candidates to (flattened projects whose ${statusClause})`;
  // scope=due includes only projects OmniFocus considers due (review date set and in the past); projects with no review date are intentionally excluded.
  const dueGuard = options.scope === 'due'
    ? `if (next review date of p is missing value) or (next review date of p >= now) then set includeP to false`
    : '';
  const stalledGuard = options.onlyStalled
    ? `if availCount > 0 then set includeP to false`
    : '';
  return `
tell application "OmniFocus"
  tell default document
    set now to current date
    ${projectSet}
    set matchCount to 0
    set emitted to 0
    set output to ""
    repeat with p in candidates
      set includeP to true
      ${dueGuard}
      if includeP then
        set incompleteTasks to (flattened tasks of p whose completed is false)
        set incompleteCount to count of incompleteTasks
        set availCount to 0
        set plannedCount to 0
        set lastAct to missing value
        repeat with t in incompleteTasks
          set md to modification date of t
          if lastAct is missing value or md > lastAct then set lastAct to md
          set tnames to my getTagNames(t)
          if ("," & tnames & ",") contains ",Planned," then set plannedCount to plannedCount + 1
          if blocked of t is false then
            set effDefer to effective defer date of t
            if effDefer is missing value or effDefer < now then set availCount to availCount + 1
          end if
        end repeat
        if lastAct is missing value then set lastAct to modification date of p
        ${stalledGuard}
        if includeP then
          set matchCount to matchCount + 1
          if matchCount > ${options.offset} and emitted < ${options.limit} then
            set projId to id of p
            set projName to my escapeField(name of p)
            set folderName to ""
            try
              set c to container of p
              if class of c is folder then set folderName to my escapeField(name of c)
            end try
            set projStatus to status of p as text
            set isFlagged to flagged of p
            set duDate to my formatDate(due date of p)
            set lastActStr to my formatDate(lastAct)
            set revDate to my formatDate(next review date of p)
            set output to output & projId & tab & projName & tab & folderName & tab & projStatus & tab & isFlagged & tab & duDate & tab & incompleteCount & tab & availCount & tab & plannedCount & tab & lastActStr & tab & revDate & linefeed
            set emitted to emitted + 1
          end if
        end if
      end if
    end repeat
    return "TOTAL:" & matchCount & linefeed & output
  end tell
end tell
${APPLESCRIPT_HELPERS}`;
}

export function buildBatchMarkReviewedScript(projectIds: string[]): string {
  const list = projectIds.map((id) => `"${escapeForAppleScript(id)}"`).join(', ');
  return `
tell application "OmniFocus"
  tell default document
    set projIds to {${list}}
    set okCount to 0
    repeat with pid in projIds
      try
        set proj to first flattened project whose id is (pid as text)
        set last review date of proj to (current date)
        set okCount to okCount + 1
      end try
    end repeat
    return okCount as text
  end tell
end tell`;
}

export function buildGetTasksByTagScript(tagNames: string[], limit: number, folderId?: string): string {
  const escapedTags = tagNames.map((t) => `"${escapeForAppleScript(t)}"`).join(', ');
  const folderSetup = folderId
    ? `
    set targetFolder to first flattened folder whose id is "${escapeForAppleScript(folderId)}"
    set folderProjIds to (id of every flattened project of targetFolder)`
    : '';
  const folderGuard = folderId
    ? `set keepT to true
          try
            set cpid to id of containing project of t
            if folderProjIds does not contain cpid then set keepT to false
          on error
            set keepT to false
          end try`
    : 'set keepT to true';
  return `
tell application "OmniFocus"
  tell default document
    set targetTagNames to {${escapedTags}}${folderSetup}
    set seenIds to {}
    set matchCount to 0
    set results to ""
    repeat with tagName in targetTagNames
      set tg to first flattened tag whose name is (tagName as text)
      set tagTasks to remaining tasks of tg
      repeat with t in tagTasks
        set tid to id of t
        if seenIds does not contain tid then
          ${folderGuard}
          if keepT then
            set end of seenIds to tid
            set matchCount to matchCount + 1
            if matchCount > ${limit} then
              -- already have enough results, just keep counting
            else
              set results to results & my taskRecord(t) & linefeed
            end if
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
