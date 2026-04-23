import { escapeForAppleScript } from './executor.js';
import {
  splitFields,
  parsePaginatedOutput,
  parseTaskFields,
  APPLESCRIPT_HELPERS,
} from './parser.js';
import type { OFTask, PaginatedResult } from '../types.js';

export function buildGetInboxTasksScript(offset: number, limit: number): string {
  return `
tell application "OmniFocus"
  tell default document
    set allTasks to inbox tasks
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

export function buildGetProjectInboxTasksScript(projectName: string, offset: number, limit: number): string {
  const escaped = escapeForAppleScript(projectName);
  return `
tell application "OmniFocus"
  tell default document
    set proj to first flattened project whose name is "${escaped}"
    set allTasks to flattened tasks of proj whose completed is false
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

export function buildProcessInboxTaskScript(
  taskId: string,
  options: { projectId?: string; tags?: string[]; dueDate?: string; deferDate?: string; flagged?: boolean },
): string {
  const escapedTaskId = escapeForAppleScript(taskId);
  const lines: string[] = [
    `tell application "OmniFocus"`,
    `  tell default document`,
    `    set t to first flattened task whose id is "${escapedTaskId}"`,
  ];
  if (options.projectId) {
    const escapedProjectId = escapeForAppleScript(options.projectId);
    lines.push(`    set proj to first flattened project whose id is "${escapedProjectId}"`);
    lines.push(`    move t to end of tasks of proj`);
  }
  if (options.tags && options.tags.length > 0) {
    for (const tag of options.tags) {
      const escapedTag = escapeForAppleScript(tag);
      lines.push(`    set tg to first flattened tag whose name is "${escapedTag}"`);
      lines.push(`    add tg to tags of t`);
    }
  }
  if (options.dueDate) {
    lines.push(`    set due date of t to date "${escapeForAppleScript(options.dueDate)}"`);
  }
  if (options.deferDate) {
    lines.push(`    set defer date of t to date "${escapeForAppleScript(options.deferDate)}"`);
  }
  if (options.flagged !== undefined) {
    lines.push(`    set flagged of t to ${options.flagged}`);
  }
  lines.push(`    return id of t`);
  lines.push(`  end tell`);
  lines.push(`end tell`);
  return lines.join('\n');
}

export function buildQuickEntryScript(
  name: string,
  options: { note?: string; projectId?: string; tags?: string[]; dueDate?: string; deferDate?: string; flagged?: boolean },
): string {
  const escapedName = escapeForAppleScript(name);
  const props: string[] = [`name:"${escapedName}"`];
  if (options.note) {
    props.push(`note:"${escapeForAppleScript(options.note)}"`);
  }
  if (options.flagged !== undefined) {
    props.push(`flagged:${options.flagged}`);
  }
  const lines: string[] = [
    `tell application "OmniFocus"`,
    `  tell default document`,
  ];
  if (options.projectId) {
    const escapedProjectId = escapeForAppleScript(options.projectId);
    lines.push(`    set proj to first flattened project whose id is "${escapedProjectId}"`);
    lines.push(`    set t to make new task with properties {${props.join(', ')}} at end of tasks of proj`);
  } else {
    lines.push(`    set t to make new inbox task with properties {${props.join(', ')}}`);
  }
  if (options.dueDate) {
    lines.push(`    set due date of t to date "${escapeForAppleScript(options.dueDate)}"`);
  }
  if (options.deferDate) {
    lines.push(`    set defer date of t to date "${escapeForAppleScript(options.deferDate)}"`);
  }
  if (options.tags && options.tags.length > 0) {
    for (const tag of options.tags) {
      const escapedTag = escapeForAppleScript(tag);
      lines.push(`    set tg to first flattened tag whose name is "${escapedTag}"`);
      lines.push(`    add tg to tags of t`);
    }
  }
  lines.push(`    return id of t`);
  lines.push(`  end tell`);
  lines.push(`end tell`);
  return lines.join('\n');
}

export function parseInboxTasksOutput(output: string): PaginatedResult<OFTask> {
  const { total, lines } = parsePaginatedOutput(output);
  const items = lines.map((line) => parseTaskFields(splitFields(line)));
  return { total, items };
}
