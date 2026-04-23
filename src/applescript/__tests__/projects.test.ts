import { describe, it, expect } from 'vitest';
import {
  buildGetProjectsScript,
  buildGetProjectTasksScript,
  buildCreateProjectScript,
  buildUpdateProjectScript,
  buildGetFoldersScript,
} from '../projects.js';
import { parseProjects, parsePaginatedTasks, parseFolders } from '../parser.js';

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

describe('parseProjects', () => {
  it('parses project records', () => {
    const output = 'proj1\tMy Project\tSome notes\tactive\t5\t2026-05-01T00:00:00\t604800';
    const projects = parseProjects(output);
    expect(projects).toEqual([{
      id: 'proj1', name: 'My Project', note: 'Some notes', status: 'active',
      taskCount: 5, nextReviewDate: '2026-05-01T00:00:00', reviewInterval: 604800,
    }]);
  });

  it('strips " status" suffix from status field', () => {
    const output = 'proj1\tMy Project\t\tactive status\t5\t\t0';
    const projects = parseProjects(output);
    expect(projects[0].status).toBe('active');
  });

  it('returns empty array for empty output', () => {
    expect(parseProjects('')).toEqual([]);
  });
});

describe('parsePaginatedTasks (project context)', () => {
  it('parses paginated task output', () => {
    const output = [
      'TOTAL:2',
      'id1\tTask 1\t\t2026-01-15T10:00:00\t2026-01-15T10:00:00\t\t\tfalse\tfalse\t\tMy Project\t',
    ].join('\n');
    const result = parsePaginatedTasks(output);
    expect(result.total).toBe(2);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe('Task 1');
  });
});

describe('buildGetFoldersScript', () => {
  it('queries folders with their properties', () => {
    const script = buildGetFoldersScript(50);
    expect(script).toContain('folders');
    expect(script).toContain('escapeField');
  });

  it('respects limit', () => {
    const script = buildGetFoldersScript(5);
    expect(script).toContain('5');
  });
});

describe('parseFolders', () => {
  it('parses folder records', () => {
    const output = 'folder1\tPersonal\t3\nfolder2\tWork\t7';
    const folders = parseFolders(output);
    expect(folders).toEqual([
      { id: 'folder1', name: 'Personal', projectCount: 3 },
      { id: 'folder2', name: 'Work', projectCount: 7 },
    ]);
  });

  it('returns empty array for empty output', () => {
    expect(parseFolders('')).toEqual([]);
  });

  it('unescapes folder names', () => {
    const output = 'f1\tName\\nWith\\nNewlines\t2';
    const folders = parseFolders(output);
    expect(folders[0].name).toBe('Name\nWith\nNewlines');
  });
});
