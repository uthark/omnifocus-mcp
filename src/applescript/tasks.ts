import { escapeForAppleScript } from './executor.js';
import { normalizeDateString } from './dates.js';
import { buildPaginatedTaskQuery, APPLESCRIPT_HELPERS } from './parser.js';

export function buildCompleteTaskScript(taskId: string): string {
  const escaped = escapeForAppleScript(taskId);
  return `
tell application "OmniFocus"
  tell default document
    set t to first flattened task whose id is "${escaped}"
    mark complete t
    return id of t
  end tell
end tell`;
}

export function buildGetTaskScript(taskId: string): string {
  const escaped = escapeForAppleScript(taskId);
  return `
tell application "OmniFocus"
  tell default document
    set t to first flattened task whose id is "${escaped}"
    return my taskRecord(t)
  end tell
end tell
${APPLESCRIPT_HELPERS}`;
}

export function buildUncompleteTaskScript(taskId: string): string {
  const escaped = escapeForAppleScript(taskId);
  return `
tell application "OmniFocus"
  tell default document
    set t to first flattened task whose id is "${escaped}"
    mark incomplete t
    return id of t
  end tell
end tell`;
}

export function buildDeleteTaskScript(taskId: string): string {
  const escaped = escapeForAppleScript(taskId);
  return `
tell application "OmniFocus"
  tell default document
    set t to first flattened task whose id is "${escaped}"
    delete t
    return "deleted"
  end tell
end tell`;
}

export function buildUpdateTaskScript(
  taskId: string,
  options: { name?: string; note?: string; tags?: string[]; dueDate?: string; deferDate?: string; plannedDate?: string; flagged?: boolean; completed?: boolean },
): string {
  const escapedId = escapeForAppleScript(taskId);
  const lines: string[] = [
    `tell application "OmniFocus"`,
    `  tell default document`,
    `    set t to first flattened task whose id is "${escapedId}"`,
  ];
  if (options.name !== undefined) {
    lines.push(`    set name of t to "${escapeForAppleScript(options.name)}"`);
  }
  if (options.note !== undefined) {
    lines.push(`    set note of t to "${escapeForAppleScript(options.note)}"`);
  }
  if (options.flagged !== undefined) {
    lines.push(`    set flagged of t to ${options.flagged}`);
  }
  if (options.completed !== undefined) {
    lines.push(`    mark ${options.completed ? 'complete' : 'incomplete'} t`);
  }
  if (options.dueDate !== undefined) {
    lines.push(`    set due date of t to date "${escapeForAppleScript(normalizeDateString(options.dueDate))}"`);
  }
  if (options.deferDate !== undefined) {
    lines.push(`    set defer date of t to date "${escapeForAppleScript(normalizeDateString(options.deferDate))}"`);
  }
  if (options.plannedDate !== undefined) {
    lines.push(`    set planned date of t to date "${escapeForAppleScript(normalizeDateString(options.plannedDate))}"`);
  }
  if (options.tags !== undefined) {
    lines.push(`    -- Remove existing tags`);
    lines.push(`    repeat while (count of tags of t) > 0`);
    lines.push(`      remove item 1 of tags of t from tags of t`);
    lines.push(`    end repeat`);
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

export function buildCreateSubtasksScript(
  taskId: string,
  subtasks: Array<{ name: string; note?: string }>,
): string {
  const escapedId = escapeForAppleScript(taskId);
  const lines: string[] = [
    `tell application "OmniFocus"`,
    `  tell default document`,
    `    set parentTask to first flattened task whose id is "${escapedId}"`,
    `    set ids to ""`,
  ];
  for (const subtask of subtasks) {
    const escapedName = escapeForAppleScript(subtask.name);
    const props = [`name:"${escapedName}"`];
    if (subtask.note) {
      props.push(`note:"${escapeForAppleScript(subtask.note)}"`);
    }
    lines.push(`    set newSubtask to make new task with properties {${props.join(', ')}} at end of tasks of parentTask`);
    lines.push(`    if ids is not "" then set ids to ids & ","`);
    lines.push(`    set ids to ids & id of newSubtask`);
  }
  lines.push(`    return ids`);
  lines.push(`  end tell`);
  lines.push(`end tell`);
  return lines.join('\n');
}

export function buildSearchTasksScript(query: string, limit: number): string {
  const escaped = escapeForAppleScript(query);
  return buildPaginatedTaskQuery(
    `flattened tasks whose completed is false and name contains "${escaped}"`,
    limit,
  );
}
