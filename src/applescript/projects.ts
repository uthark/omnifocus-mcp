import { escapeForAppleScript } from './executor.js';
import { normalizeDateString } from './dates.js';
import { APPLESCRIPT_HELPERS, buildOffsetTaskQuery } from './parser.js';

export type ReviewIntervalUnit = 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';

export interface ReviewInterval {
  steps: number;
  unit: ReviewIntervalUnit;
  fixed: boolean;
}

function reviewIntervalRecord(interval: ReviewInterval): string {
  return `{unit:${interval.unit}, steps:${interval.steps}, fixed:${interval.fixed}}`;
}

function setDateLine(target: string, value: string): string {
  if (value === '') return `    set ${target} to missing value`;
  return `    set ${target} to date "${escapeForAppleScript(normalizeDateString(value))}"`;
}

export function buildGetProjectsScript(options: { status?: string; limit?: number; folderId?: string; omitNotes?: boolean }): string {
  const statusFilter = options.status ?? 'active';
  const limit = options.limit ?? 100;
  const scope = options.folderId
    ? `set targetFolder to first flattened folder whose id is "${escapeForAppleScript(options.folderId)}"
    set allProjects to flattened projects of targetFolder whose status is ${statusFilter}`
    : `set allProjects to flattened projects whose status is ${statusFilter}`;
  const noteLine = options.omitNotes
    ? `set projNote to ""`
    : `set projNote to my escapeField(note of p)`;
  return `
tell application "OmniFocus"
  tell default document
    set output to ""
    ${scope}
    set projCount to count of allProjects
    set maxCount to ${limit}
    if maxCount > projCount then set maxCount to projCount
    repeat with i from 1 to maxCount
      set p to item i of allProjects
      set projId to id of p
      set projName to my escapeField(name of p)
      ${noteLine}
      set projStatus to status of p as text
      set tCount to count of tasks of p
      try
        set revDate to my formatDate(next review date of p)
      on error
        set revDate to ""
      end try
      set revSteps to ""
      set revUnit to ""
      set revFixed to ""
      try
        set ri to review interval of p
        if ri is not missing value then
          set revSteps to (steps of ri) as text
          set revUnit to (unit of ri) as text
          set revFixed to (fixed of ri) as text
        end if
      end try
      set estMin to ""
      try
        set em to estimated minutes of p
        if em is not missing value then set estMin to em as text
      end try
      set output to output & projId & tab & projName & tab & projNote & tab & projStatus & tab & tCount & tab & revDate & tab & revSteps & tab & revUnit & tab & revFixed & tab & estMin & linefeed
    end repeat
    return output
  end tell
end tell
${APPLESCRIPT_HELPERS}`;
}

export function buildGetProjectByNameScript(name: string, options: { contains?: boolean; limit?: number } = {}): string {
  const escaped = escapeForAppleScript(name);
  if (options.contains) {
    const limit = options.limit ?? 25;
    return `
tell application "OmniFocus"
  tell default document
    set output to ""
    set matches to flattened projects whose name contains "${escaped}"
    set matchCount to count of matches
    set maxCount to ${limit}
    if maxCount > matchCount then set maxCount to matchCount
    repeat with i from 1 to maxCount
      set p to item i of matches
      set output to output & (id of p) & tab & (name of p) & linefeed
    end repeat
    return output
  end tell
end tell`;
  }
  return `
tell application "OmniFocus"
  tell default document
    set p to first flattened project whose name is "${escaped}"
    set projId to id of p
    set projName to name of p
    return projId & tab & projName
  end tell
end tell`;
}

export function buildGetProjectTasksScript(projectId: string, offset: number, limit: number): string {
  const escaped = escapeForAppleScript(projectId);
  return buildOffsetTaskQuery(
    `set proj to first flattened project whose id is "${escaped}"\n    set allTasks to flattened tasks of proj whose completed is false`,
    offset,
    limit,
  );
}

export function buildCreateProjectScript(
  name: string,
  options: { note?: string; tags?: string[]; reviewInterval?: ReviewInterval; folderId?: string; tasks?: Array<{ name: string; note?: string }> },
): string {
  const escapedName = escapeForAppleScript(name);
  const props: string[] = [`name:"${escapedName}"`];
  if (options.note) {
    props.push(`note:"${escapeForAppleScript(options.note)}"`);
  }
  if (options.reviewInterval) {
    props.push(`review interval:${reviewIntervalRecord(options.reviewInterval)}`);
  }
  const lines: string[] = [
    `tell application "OmniFocus"`,
    `  tell default document`,
  ];
  if (options.folderId) {
    const escapedFolderId = escapeForAppleScript(options.folderId);
    lines.push(`    set targetFolder to first flattened folder whose id is "${escapedFolderId}"`);
    lines.push(`    set proj to make new project with properties {${props.join(', ')}} at end of projects of targetFolder`);
  } else {
    lines.push(`    set proj to make new project with properties {${props.join(', ')}}`);
  }
  if (options.tags && options.tags.length > 0) {
    for (const tag of options.tags) {
      const escapedTag = escapeForAppleScript(tag);
      lines.push(`    set tg to first flattened tag whose name is "${escapedTag}"`);
      lines.push(`    add tg to tags of proj`);
    }
  }
  if (options.tasks && options.tasks.length > 0) {
    for (const task of options.tasks) {
      const taskName = escapeForAppleScript(task.name);
      const taskProps = [`name:"${taskName}"`];
      if (task.note) {
        taskProps.push(`note:"${escapeForAppleScript(task.note)}"`);
      }
      lines.push(`    make new task with properties {${taskProps.join(', ')}} at end of tasks of proj`);
    }
  }
  lines.push(`    return id of proj`);
  lines.push(`  end tell`);
  lines.push(`end tell`);
  return lines.join('\n');
}

export function buildGetFoldersScript(limit: number): string {
  return `
tell application "OmniFocus"
  tell default document
    set output to ""
    set allFolders to flattened folders
    set count_ to 0
    repeat with f in allFolders
      set folderId to id of f
      set folderName to my escapeField(name of f)
      set parentId to ""
      try
        set parentContainer to container of f
        if class of parentContainer is folder then
          set parentId to id of parentContainer
        end if
      end try
      set projCount to count of (projects of f whose status is active)
      set output to output & folderId & tab & folderName & tab & parentId & tab & projCount & linefeed
      set count_ to count_ + 1
      if count_ >= ${limit} then exit repeat
    end repeat
    return output
  end tell
end tell
${APPLESCRIPT_HELPERS}`;
}

export function buildCreateFolderScript(name: string, parentFolderId?: string): string {
  const escapedName = escapeForAppleScript(name);
  const lines: string[] = [`tell application "OmniFocus"`, `  tell default document`];
  if (parentFolderId) {
    const escapedParent = escapeForAppleScript(parentFolderId);
    lines.push(`    set parentFolder to first flattened folder whose id is "${escapedParent}"`);
    lines.push(`    set newFolder to make new folder with properties {name:"${escapedName}"} at end of folders of parentFolder`);
  } else {
    lines.push(`    set newFolder to make new folder with properties {name:"${escapedName}"} at end of folders`);
  }
  lines.push(`    return id of newFolder & tab & name of newFolder`);
  lines.push(`  end tell`);
  lines.push(`end tell`);
  return lines.join('\n');
}

export function buildUpdateFolderScript(folderId: string, name: string): string {
  const escapedId = escapeForAppleScript(folderId);
  const escapedName = escapeForAppleScript(name);
  return [
    `tell application "OmniFocus"`,
    `  tell default document`,
    `    set f to first flattened folder whose id is "${escapedId}"`,
    `    set name of f to "${escapedName}"`,
    `    return id of f & tab & name of f`,
    `  end tell`,
    `end tell`,
  ].join('\n');
}

export function buildMoveProjectScript(projectId: string, folderId: string): string {
  const escapedProject = escapeForAppleScript(projectId);
  const escapedFolder = escapeForAppleScript(folderId);
  return [
    `tell application "OmniFocus"`,
    `  tell default document`,
    `    set proj to first flattened project whose id is "${escapedProject}"`,
    `    set targetFolder to first flattened folder whose id is "${escapedFolder}"`,
    `    move proj to end of projects of targetFolder`,
    `    return id of proj`,
    `  end tell`,
    `end tell`,
  ].join('\n');
}

export function buildDeleteFolderScript(folderId: string): string {
  const escapedId = escapeForAppleScript(folderId);
  return [
    `tell application "OmniFocus"`,
    `  tell default document`,
    `    set f to first flattened folder whose id is "${escapedId}"`,
    `    set projCount to count of projects of f`,
    `    if projCount > 0 then`,
    `      return "error:not-empty:" & projCount`,
    `    end if`,
    `    delete f`,
    `    return "deleted"`,
    `  end tell`,
    `end tell`,
  ].join('\n');
}

export function buildConvertTaskToProjectScript(
  taskId: string,
  options: { folderId?: string },
): string {
  const escapedId = escapeForAppleScript(taskId);
  const lines: string[] = [
    `tell application "OmniFocus"`,
    `  tell default document`,
    `    set t to first flattened task whose id is "${escapedId}"`,
    `    set taskName to name of t`,
    `    set taskNote to note of t`,
    `    set taskTags to tags of t`,
  ];
  if (options.folderId) {
    const escapedFolder = escapeForAppleScript(options.folderId);
    lines.push(`    set targetFolder to first flattened folder whose id is "${escapedFolder}"`);
    lines.push(`    set proj to make new project with properties {name:taskName, note:taskNote} at end of projects of targetFolder`);
  } else {
    lines.push(`    set proj to make new project with properties {name:taskName, note:taskNote}`);
  }
  lines.push(`    repeat with tg in taskTags`);
  lines.push(`      add tg to tags of proj`);
  lines.push(`    end repeat`);
  lines.push(`    mark complete t`);
  lines.push(`    return id of proj`);
  lines.push(`  end tell`);
  lines.push(`end tell`);
  return lines.join('\n');
}

export function buildUpdateProjectScript(
  projectId: string,
  options: { status?: string; reviewInterval?: ReviewInterval; nextReviewDate?: string; name?: string; note?: string; estimatedMinutes?: number | null },
): string {
  const escapedId = escapeForAppleScript(projectId);
  const lines: string[] = [
    `tell application "OmniFocus"`,
    `  tell default document`,
    `    set proj to first flattened project whose id is "${escapedId}"`,
  ];
  if (options.name !== undefined) {
    lines.push(`    set name of proj to "${escapeForAppleScript(options.name)}"`);
  }
  if (options.note !== undefined) {
    lines.push(`    set note of proj to "${escapeForAppleScript(options.note)}"`);
  }
  if (options.status !== undefined) {
    if (options.status === 'done') {
      lines.push(`    mark complete proj`);
    } else if (options.status === 'dropped') {
      lines.push(`    mark dropped proj`);
    } else {
      const statusMap: Record<string, string> = { active: 'active', 'on hold': 'on hold' };
      const asStatus = statusMap[options.status] ?? 'active';
      lines.push(`    set status of proj to ${asStatus}`);
    }
  }
  if (options.reviewInterval !== undefined) {
    lines.push(`    set review interval of proj to ${reviewIntervalRecord(options.reviewInterval)}`);
  }
  if (options.nextReviewDate !== undefined) {
    lines.push(setDateLine('next review date of proj', options.nextReviewDate));
  }
  if (options.estimatedMinutes !== undefined) {
    lines.push(
      options.estimatedMinutes === null
        ? `    set estimated minutes of proj to missing value`
        : `    set estimated minutes of proj to ${options.estimatedMinutes}`,
    );
  }
  lines.push(`    return id of proj`);
  lines.push(`  end tell`);
  lines.push(`end tell`);
  return lines.join('\n');
}
