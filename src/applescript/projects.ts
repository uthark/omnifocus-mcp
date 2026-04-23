import { escapeForAppleScript } from './executor.js';
import { APPLESCRIPT_HELPERS, buildOffsetTaskQuery } from './parser.js';

export function buildGetProjectsScript(options: { status?: string; limit?: number }): string {
  const statusFilter = options.status ?? 'active';
  const limit = options.limit ?? 100;
  return `
tell application "OmniFocus"
  tell default document
    set output to ""
    set allProjects to flattened projects whose status is ${statusFilter}
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
  options: { note?: string; tags?: string[]; reviewInterval?: number; tasks?: Array<{ name: string; note?: string }> },
): string {
  const escapedName = escapeForAppleScript(name);
  const props: string[] = [`name:"${escapedName}"`];
  if (options.note) {
    props.push(`note:"${escapeForAppleScript(options.note)}"`);
  }
  if (options.reviewInterval) {
    props.push(`review interval:${options.reviewInterval}`);
  }
  const lines: string[] = [
    `tell application "OmniFocus"`,
    `  tell default document`,
    `    set proj to make new project with properties {${props.join(', ')}}`,
  ];
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
    set allFolders to folders
    set count_ to 0
    repeat with f in allFolders
      set folderId to id of f
      set folderName to my escapeField(name of f)
      set projCount to count of (projects of f whose status is active)
      set output to output & folderId & tab & folderName & tab & projCount & linefeed
      set count_ to count_ + 1
      if count_ >= ${limit} then exit repeat
    end repeat
    return output
  end tell
end tell
${APPLESCRIPT_HELPERS}`;
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
    lines.push(`    set review interval of proj to ${options.reviewInterval}`);
  }
  lines.push(`    return id of proj`);
  lines.push(`  end tell`);
  lines.push(`end tell`);
  return lines.join('\n');
}
