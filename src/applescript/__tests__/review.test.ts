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
  buildGetReviewDigestScript,
  buildBatchMarkReviewedScript,
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
    expect(script).toContain('set year of _dv to 2026');
    expect(script).toContain('set month of _dv to 4');
    expect(script).toContain('set day of _dv to 15');
    expect(script).toContain('set sinceDate to _dv');
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

  it('filters by defer date when deferBefore is provided', () => {
    const script = buildGetFlaggedTasksScript(20, '2026-04-27');
    expect(script).toContain('set year of _dv to 2026');
    expect(script).toContain('set month of _dv to 4');
    expect(script).toContain('set day of _dv to 27');
    expect(script).toContain('set cutoff to _dv');
    expect(script).toContain('defer date');
  });

  it('includes tasks with missing defer date when deferBefore is provided', () => {
    const script = buildGetFlaggedTasksScript(20, '2026-04-27');
    expect(script).toContain('missing value');
  });

  it('without deferBefore uses simple whose clause without date loop', () => {
    const script = buildGetFlaggedTasksScript(20);
    expect(script).toContain('whose');
    expect(script).not.toContain('set cutoff');
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

describe('buildGetReviewDigestScript', () => {
  const base = { scope: 'due' as const, includeOnHold: false, onlyStalled: false, limit: 200, offset: 0 };

  it('scope=due filters by next review date', () => {
    const script = buildGetReviewDigestScript(base);
    expect(script).toContain('next review date');
    expect(script).toContain('current date');
  });

  it('scope=all-active does not filter by review date in the guard', () => {
    const script = buildGetReviewDigestScript({ ...base, scope: 'all-active' });
    expect(script).not.toContain('next review date of p >=');
  });

  it('defaults to active projects only', () => {
    const script = buildGetReviewDigestScript(base);
    expect(script).toContain('whose status is active');
  });

  it('includeOnHold widens the status clause', () => {
    const script = buildGetReviewDigestScript({ ...base, includeOnHold: true });
    expect(script).toContain('on hold');
  });

  it('onlyStalled adds an availability guard', () => {
    const script = buildGetReviewDigestScript({ ...base, onlyStalled: true });
    expect(script).toContain('if availCount > 0 then set includeP to false');
  });

  it('scopes to a folder when folderId is given', () => {
    const script = buildGetReviewDigestScript({ ...base, folderId: 'fld123' });
    expect(script).toContain('fld123');
    expect(script).toContain('flattened projects of targetFolder');
  });

  it('counts Planned next actions and computes availability', () => {
    const script = buildGetReviewDigestScript(base);
    expect(script).toContain(',Planned,');
    expect(script).toContain('effective defer date');
    expect(script).toContain('blocked of t is false');
  });

  it('emits a TOTAL header and honors limit/offset', () => {
    const script = buildGetReviewDigestScript({ ...base, limit: 50, offset: 10 });
    expect(script).toContain('"TOTAL:"');
    expect(script).toContain('emitted < 50');
    expect(script).toContain('matchCount > 10');
  });

  it('includes the APPLESCRIPT_HELPERS', () => {
    const script = buildGetReviewDigestScript(base);
    expect(script).toContain('escapeField');
    expect(script).toContain('getTagNames');
  });
});

describe('buildBatchMarkReviewedScript', () => {
  it('includes every project id', () => {
    const script = buildBatchMarkReviewedScript(['a1', 'b2', 'c3']);
    expect(script).toContain('a1');
    expect(script).toContain('b2');
    expect(script).toContain('c3');
  });

  it('marks each project reviewed and counts successes', () => {
    const script = buildBatchMarkReviewedScript(['a1']);
    expect(script).toContain('mark reviewed');
    expect(script).toContain('okCount');
  });

  it('escapes quotes in ids', () => {
    const script = buildBatchMarkReviewedScript(['weird"id']);
    expect(script).toContain('weird\\"id');
  });
});
