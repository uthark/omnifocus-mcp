import { escapeForAppleScript } from './executor.js';
import { APPLESCRIPT_HELPERS, buildOffsetTaskQuery } from './parser.js';

function reviewIntervalRecord(seconds: number): string {
  const day = 86400;
  const week = 7 * day;
  const month = 30 * day;
  const year = 365 * day;
  let unit: 'day' | 'week' | 'month' | 'year';
  let steps: number;
  if (seconds % year === 0) {
    unit = 'year';
    steps = seconds / year;
  } else if (seconds % month === 0) {
    unit = 'month';
    steps = seconds / month;
  } else if (seconds % week === 0) {
    unit = 'week';
    steps = seconds / week;
  } else {
    unit = 'day';
    steps = Math.max(1, Math.round(seconds / day));
  }
  return `{unit:${unit}, steps:${steps}, fixed:true}`;
}

export function buildGetProjectsScript(options: { status?: string; limit?: number; folderId?: string }): string {
  const statusFilter = options.status ?? 'active';
  const limit = options.limit ?? 100;
  const scope = options.folderId
    ? `set targetFolder to first flattened folder whose id is "${escapeForAppleScript(options.folderId)}"
    set allProjects to flattened projects of targetFolder whose status is ${statusFilter}`
    : `set allProjects to flattened projects whose status is ${statusFilter}`;
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
      set projNote to my escapeField(note of p)
      set projStatus to status of p as text
      set tCount to count of tasks of p
      try
        set revDate to my formatDate(next review date of p)
      on error
        set revDate to ""
      end try
      try
        set revInterval to (review interval of p) as integer
      on error
        set revInterval to 0
      end try
      set output to output & projId & tab & projName & tab & projNote & tab & projStatus & tab & tCount & tab & revDate & tab & revInterval & linefeed
    end repeat
    return output
  end tell
end tell
${APPLESCRIPT_HELPERS}`;
}

export function buildGetProjectByNameScript(name: string): string {
  const escaped = escapeForAppleScript(name);
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
  options: { note?: string; tags?: string[]; reviewInterval?: number; folderId?: string; tasks?: Array<{ name: string; note?: string }> },
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
  options: { status?: string; reviewInterval?: number; name?: string; note?: string },
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
    const statusMap: Record<string, string> = { active: 'active', 'on hold': 'on hold', done: 'done', dropped: 'dropped' };
    const asStatus = statusMap[options.status] ?? 'active';
    lines.push(`    set status of proj to ${asStatus}`);
  }
  if (options.reviewInterval !== undefined) {
    lines.push(`    set review interval of proj to ${reviewIntervalRecord(options.reviewInterval)}`);
  }
  lines.push(`    return id of proj`);
  lines.push(`  end tell`);
  lines.push(`end tell`);
  return lines.join('\n');
}
