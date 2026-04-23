import { describe, it, expect } from 'vitest';
import {
  buildGetProjectsDueForReviewScript,
  buildMarkProjectReviewedScript,
  buildGetStaleTasksScript,
  buildGetOverdueTasksScript,
  buildGetForecastScript,
  buildGetCompletedTasksScript,
  parseProjectsForReviewOutput,
  parseTaskListOutput,
} from '../review.js';

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
  it('queries tasks not modified in N days', () => {
    const script = buildGetStaleTasksScript(30);
    expect(script).toContain('modification date');
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
    const script = buildGetForecastScript(7);
    expect(script).toContain('due date');
  });
});

describe('buildGetCompletedTasksScript', () => {
  it('queries tasks completed since a date', () => {
    const script = buildGetCompletedTasksScript('2026-04-15');
    expect(script).toContain('2026-04-15');
    expect(script).toContain('completion date');
  });
});

describe('parseProjectsForReviewOutput', () => {
  it('parses project records', () => {
    const output = 'proj1\tStale Project\tNotes\tactive\t3\t2026-04-01T00:00:00\t604800';
    const projects = parseProjectsForReviewOutput(output);
    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe('Stale Project');
  });

  it('returns empty array for empty output', () => {
    expect(parseProjectsForReviewOutput('')).toEqual([]);
  });
});

describe('parseTaskListOutput', () => {
  it('parses paginated task records', () => {
    const output = [
      'TOTAL:1',
      'id1\tOverdue task\t\t2026-01-01T00:00:00\t2026-01-01T00:00:00\t2026-04-01T00:00:00\t\ttrue\tfalse\t\tSome Project\tWork',
    ].join('\n');
    const result = parseTaskListOutput(output);
    expect(result.total).toBe(1);
    expect(result.items[0].name).toBe('Overdue task');
    expect(result.items[0].dueDate).toBe('2026-04-01T00:00:00');
  });
});
