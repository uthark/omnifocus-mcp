import { describe, it, expect } from 'vitest';
import {
  buildGetProjectsScript,
  buildGetProjectTasksScript,
  buildCreateProjectScript,
  buildUpdateProjectScript,
  parseProjectsOutput,
  parseProjectTasksOutput,
} from '../projects.js';

describe('buildGetProjectsScript', () => {
  it('queries all active projects by default', () => {
    const script = buildGetProjectsScript({});
    expect(script).toContain('flattened projects');
    expect(script).toContain('active');
  });

  it('filters by status when provided', () => {
    const script = buildGetProjectsScript({ status: 'on hold' });
    expect(script).toContain('on hold');
  });

  it('respects limit', () => {
    const script = buildGetProjectsScript({ limit: 10 });
    expect(script).toContain('10');
  });
});

describe('buildGetProjectTasksScript', () => {
  it('queries tasks for a specific project', () => {
    const script = buildGetProjectTasksScript('proj123', 0, 20);
    expect(script).toContain('proj123');
    expect(script).toContain('TOTAL:');
  });
});

describe('buildCreateProjectScript', () => {
  it('creates a project with name', () => {
    const script = buildCreateProjectScript('New Project', {});
    expect(script).toContain('New Project');
    expect(script).toContain('make new project');
  });

  it('includes initial tasks when provided', () => {
    const script = buildCreateProjectScript('New Project', {
      tasks: [{ name: 'First task' }, { name: 'Second task' }],
    });
    expect(script).toContain('First task');
    expect(script).toContain('Second task');
  });
});

describe('buildUpdateProjectScript', () => {
  it('updates project status', () => {
    const script = buildUpdateProjectScript('proj123', { status: 'on hold' });
    expect(script).toContain('proj123');
    expect(script).toContain('on hold');
  });
});

describe('parseProjectsOutput', () => {
  it('parses project records', () => {
    const output = 'proj1\tMy Project\tSome notes\tactive\t5\t2026-05-01T00:00:00\t604800';
    const projects = parseProjectsOutput(output);
    expect(projects).toEqual([{
      id: 'proj1', name: 'My Project', note: 'Some notes', status: 'active',
      taskCount: 5, nextReviewDate: '2026-05-01T00:00:00', reviewInterval: 604800,
    }]);
  });

  it('returns empty array for empty output', () => {
    expect(parseProjectsOutput('')).toEqual([]);
  });
});

describe('parseProjectTasksOutput', () => {
  it('parses paginated task output', () => {
    const output = [
      'TOTAL:2',
      'id1\tTask 1\t\t2026-01-15T10:00:00\t2026-01-15T10:00:00\t\t\tfalse\tfalse\t\tMy Project\t',
    ].join('\n');
    const result = parseProjectTasksOutput(output);
    expect(result.total).toBe(2);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe('Task 1');
  });
});
