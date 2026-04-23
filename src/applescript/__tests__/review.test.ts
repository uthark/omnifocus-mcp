import { describe, it, expect } from 'vitest';
import {
  buildGetProjectsDueForReviewScript,
  buildMarkProjectReviewedScript,
  buildGetStaleTasksScript,
  buildGetOverdueTasksScript,
  buildGetForecastScript,
  buildGetCompletedTasksScript,
  buildGetFlaggedTasksScript,
  buildGetAvailableTasksScript,
  buildGetTasksByTagScript,
} from '../review.js';
import { parseProjects, parsePaginatedTasks } from '../parser.js';

describe('buildGetProjectsDueForReviewScript', () => {
  it('queries projects past review date', () => {
    const script = buildGetProjectsDueForReviewScript(10);
    expect(script).toContain('next review date');
    expect(script).toContain('current date');
  });
});

describe('buildMarkProjectReviewedScript', () => {
  it('marks project as reviewed', () => {
    const script = buildMarkProjectReviewedScript('proj123');
    expect(script).toContain('proj123');
    expect(script).toContain('mark reviewed');
  });
});

describe('buildGetStaleTasksScript', () => {
  it('queries tasks not modified in N days within a project', () => {
    const script = buildGetStaleTasksScript('proj123', 30, 10);
    expect(script).toContain('modification date');
    expect(script).toContain('proj123');
  });
});

describe('buildGetOverdueTasksScript', () => {
  it('queries tasks past due date', () => {
    const script = buildGetOverdueTasksScript(20);
    expect(script).toContain('due date');
    expect(script).toContain('current date');
  });
});

describe('buildGetForecastScript', () => {
  it('queries tasks due in next N days', () => {
    const script = buildGetForecastScript(7, 10);
    expect(script).toContain('due date');
  });
});

describe('buildGetCompletedTasksScript', () => {
  it('queries tasks completed since a date', () => {
    const script = buildGetCompletedTasksScript('2026-04-15', 10);
    expect(script).toContain('2026-04-15');
    expect(script).toContain('completion date');
  });
});

describe('buildGetFlaggedTasksScript', () => {
  it('contains flagged is true', () => {
    const script = buildGetFlaggedTasksScript(15);
    expect(script).toContain('flagged is true');
  });

  it('contains completed is false', () => {
    const script = buildGetFlaggedTasksScript(15);
    expect(script).toContain('completed is false');
  });

  it('respects the limit parameter', () => {
    const script = buildGetFlaggedTasksScript(42);
    expect(script).toContain('42');
  });
});

describe('buildGetAvailableTasksScript', () => {
  it('filters by blocked and effective defer date', () => {
    const script = buildGetAvailableTasksScript('proj123', 10);
    expect(script).toContain('blocked is false');
    expect(script).toContain('effective defer date');
  });

  it('scopes query to a project', () => {
    const script = buildGetAvailableTasksScript('proj123', 10);
    expect(script).toContain('proj123');
    expect(script).toContain('flattened tasks of proj');
  });

  it('contains completed is false', () => {
    const script = buildGetAvailableTasksScript('proj123', 10);
    expect(script).toContain('completed is false');
  });

  it('respects the limit parameter', () => {
    const script = buildGetAvailableTasksScript('proj123', 37);
    expect(script).toContain('37');
  });
});

describe('buildGetTasksByTagScript', () => {
  it('includes all provided tag names in the script', () => {
    const script = buildGetTasksByTagScript(['Work', 'Errands', 'Home'], 10);
    expect(script).toContain('Work');
    expect(script).toContain('Errands');
    expect(script).toContain('Home');
  });

  it('escapes special characters in tag names', () => {
    const script = buildGetTasksByTagScript(['tag with "quotes"'], 10);
    expect(script).toContain('\\"quotes\\"');
  });

  it('produces AppleScript list syntax with curly braces', () => {
    const script = buildGetTasksByTagScript(['Tag1', 'Tag2'], 10);
    expect(script).toContain('{');
    expect(script).toContain('}');
  });

  it('queries remaining tasks from each tag', () => {
    const script = buildGetTasksByTagScript(['Work'], 10);
    expect(script).toContain('remaining tasks of tg');
    expect(script).toContain('flattened tag');
  });

  it('contains the APPLESCRIPT_HELPERS', () => {
    const script = buildGetTasksByTagScript(['Work'], 10);
    expect(script).toContain('escapeField');
    expect(script).toContain('taskRecord');
  });
});

describe('parseProjects (review context)', () => {
  it('parses project records', () => {
    const output = 'proj1\tStale Project\tNotes\tactive\t3\t2026-04-01T00:00:00\t604800';
    const projects = parseProjects(output);
    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe('Stale Project');
  });

  it('returns empty array for empty output', () => {
    expect(parseProjects('')).toEqual([]);
  });
});

describe('parsePaginatedTasks (review context)', () => {
  it('parses paginated task records', () => {
    const output = [
      'TOTAL:1',
      'id1\tOverdue task\t\t2026-01-01T00:00:00\t2026-01-01T00:00:00\t2026-04-01T00:00:00\t\ttrue\tfalse\t\tSome Project\tWork',
    ].join('\n');
    const result = parsePaginatedTasks(output);
    expect(result.total).toBe(1);
    expect(result.items[0].name).toBe('Overdue task');
    expect(result.items[0].dueDate).toBe('2026-04-01T00:00:00');
  });
});
