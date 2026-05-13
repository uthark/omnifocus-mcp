import { describe, it, expect } from 'vitest';
import {
  buildGetProjectsScript,
  buildGetProjectByNameScript,
  buildGetProjectTasksScript,
  buildCreateProjectScript,
  buildUpdateProjectScript,
  buildGetFoldersScript,
  buildCreateFolderScript,
  buildUpdateFolderScript,
  buildMoveProjectScript,
  buildDeleteFolderScript,
  buildConvertTaskToProjectScript,
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

  it('scopes to a folder when folderId given', () => {
    const script = buildGetProjectsScript({ folderId: 'jwii3wAKVG7' });
    expect(script).toContain('jwii3wAKVG7');
    expect(script).toContain('flattened folder');
    expect(script).toContain('flattened projects of targetFolder');
  });

  it('returns the global query when folderId omitted', () => {
    const script = buildGetProjectsScript({});
    expect(script).not.toContain('targetFolder');
    expect(script).toContain('flattened projects whose status is active');
  });

  it('escapes special characters in folderId', () => {
    const script = buildGetProjectsScript({ folderId: 'fid"with"quotes' });
    expect(script).toContain('fid\\"with\\"quotes');
  });

  it('fetches notes by default', () => {
    const script = buildGetProjectsScript({});
    expect(script).toContain('set projNote to my escapeField(note of p)');
  });

  it('omits notes when omitNotes=true', () => {
    const script = buildGetProjectsScript({ omitNotes: true });
    expect(script).not.toContain('set projNote to my escapeField(note of p)');
    expect(script).toContain('set projNote to ""');
  });
});

describe('buildGetProjectByNameScript', () => {
  it('looks up project by exact name by default', () => {
    const script = buildGetProjectByNameScript('32.01 Work Inbox');
    expect(script).toContain('32.01 Work Inbox');
    expect(script).toContain('first flattened project whose name is');
  });

  it('uses contains query when contains=true', () => {
    const script = buildGetProjectByNameScript('Runtime', { contains: true });
    expect(script).toContain('flattened projects whose name contains "Runtime"');
    expect(script).not.toContain('first flattened project whose name is');
  });

  it('respects limit when contains=true', () => {
    const script = buildGetProjectByNameScript('foo', { contains: true, limit: 5 });
    expect(script).toMatch(/set maxCount to 5\b/);
  });

  it('escapes special characters in contains query', () => {
    const script = buildGetProjectByNameScript('foo"bar', { contains: true });
    expect(script).toContain('foo\\"bar');
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

  it('places project inside target folder when folderId given', () => {
    const script = buildCreateProjectScript('Scoped Project', { folderId: 'folderABC' });
    expect(script).toContain('folderABC');
    expect(script).toContain('flattened folder');
    expect(script).toContain('at end of projects of targetFolder');
  });
});

describe('buildUpdateProjectScript', () => {
  it('updates project status', () => {
    const script = buildUpdateProjectScript('proj123', { status: 'on hold' });
    expect(script).toContain('proj123');
    expect(script).toContain('set status of proj to on hold');
  });

  it('uses mark complete verb for done status', () => {
    const script = buildUpdateProjectScript('proj123', { status: 'done' });
    expect(script).toContain('mark complete proj');
    expect(script).not.toContain('set status of proj to done');
  });

  it('uses mark dropped verb for dropped status', () => {
    const script = buildUpdateProjectScript('proj123', { status: 'dropped' });
    expect(script).toContain('mark dropped proj');
    expect(script).not.toContain('set status of proj to dropped');
  });

  it('sets review interval as steps/unit/fixed record', () => {
    const script = buildUpdateProjectScript('proj123', {
      reviewInterval: { steps: 2, unit: 'week', fixed: false },
    });
    expect(script).toContain('set review interval of proj to {unit:week, steps:2, fixed:false}');
  });

  it('sets next review date', () => {
    const script = buildUpdateProjectScript('proj123', { nextReviewDate: 'May 15, 2026' });
    expect(script).toContain('set year of _dv to 2026');
    expect(script).toContain('set month of _dv to 5');
    expect(script).toContain('set day of _dv to 15');
    expect(script).toContain('set next review date of proj to _dv');
  });

  it('resets next review date when empty string', () => {
    const script = buildUpdateProjectScript('proj123', { nextReviewDate: '' });
    expect(script).toContain('set next review date of proj to missing value');
  });

  it('sets estimated minutes', () => {
    const script = buildUpdateProjectScript('proj123', { estimatedMinutes: 120 });
    expect(script).toContain('set estimated minutes of proj to 120');
  });

  it('clears estimated minutes when null', () => {
    const script = buildUpdateProjectScript('proj123', { estimatedMinutes: null });
    expect(script).toContain('set estimated minutes of proj to missing value');
  });
});

describe('parseProjects', () => {
  it('parses project records', () => {
    const output = 'proj1\tMy Project\tSome notes\tactive\t5\t2026-05-01T00:00:00\t1\tweek\ttrue\t30';
    const projects = parseProjects(output);
    expect(projects).toEqual([{
      id: 'proj1', name: 'My Project', note: 'Some notes', status: 'active',
      taskCount: 5, nextReviewDate: '2026-05-01T00:00:00',
      reviewIntervalSteps: 1, reviewIntervalUnit: 'week', reviewIntervalFixed: true,
      estimatedMinutes: 30,
    }]);
  });

  it('returns nulls for missing review interval fields', () => {
    const output = 'proj1\tMy Project\tSome notes\tactive\t5\t\t\t\t\t';
    const projects = parseProjects(output);
    expect(projects[0].reviewIntervalSteps).toBeNull();
    expect(projects[0].reviewIntervalUnit).toBeNull();
    expect(projects[0].reviewIntervalFixed).toBeNull();
  });

  it('strips " status" suffix from status field', () => {
    const output = 'proj1\tMy Project\t\tactive status\t5\t\t\t\t\t';
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

describe('buildCreateFolderScript', () => {
  it('creates a folder at document root when no parent given', () => {
    const script = buildCreateFolderScript('32.91 Someday/Maybe');
    expect(script).toContain('make new folder');
    expect(script).toContain('32.91 Someday/Maybe');
    expect(script).toContain('at end of folders');
  });

  it('creates a folder inside a parent folder when parentFolderId given', () => {
    const script = buildCreateFolderScript('32.91 Someday/Maybe', 'jwii3wAKVG7');
    expect(script).toContain('jwii3wAKVG7');
    expect(script).toContain('flattened folder');
    expect(script).toContain('at end of folders of parentFolder');
  });

  it('escapes special characters in folder name', () => {
    const script = buildCreateFolderScript('Foo "Bar"');
    expect(script).toContain('Foo \\"Bar\\"');
  });

  it('returns id and name of new folder', () => {
    const script = buildCreateFolderScript('Test');
    expect(script).toContain('return id of newFolder');
  });
});

describe('buildUpdateFolderScript', () => {
  it('looks up folder by id and sets new name', () => {
    const script = buildUpdateFolderScript('e6oPE8uR4xx', '32.11 Management & People');
    expect(script).toContain('e6oPE8uR4xx');
    expect(script).toContain('32.11 Management & People');
    expect(script).toContain('set name of');
  });

  it('escapes special characters in name', () => {
    const script = buildUpdateFolderScript('abc', 'Foo "Bar"');
    expect(script).toContain('Foo \\"Bar\\"');
  });

  it('returns id of updated folder', () => {
    const script = buildUpdateFolderScript('fid', 'New Name');
    expect(script).toContain('return id of f');
  });
});

describe('buildMoveProjectScript', () => {
  it('moves a project to the target folder', () => {
    const script = buildMoveProjectScript('oMvCtEDlTRU', 'd_ke2_rVSYj');
    expect(script).toContain('oMvCtEDlTRU');
    expect(script).toContain('d_ke2_rVSYj');
    expect(script).toContain('move proj to end of projects of targetFolder');
  });

  it('returns id of moved project', () => {
    const script = buildMoveProjectScript('pid', 'fid');
    expect(script).toContain('return id of proj');
  });
});

describe('buildDeleteFolderScript', () => {
  it('deletes the folder by id', () => {
    const script = buildDeleteFolderScript('gdOkD5WF9LR');
    expect(script).toContain('gdOkD5WF9LR');
    expect(script).toContain('delete f');
  });

  it('refuses to delete non-empty folders by checking project count', () => {
    const script = buildDeleteFolderScript('gdOkD5WF9LR');
    expect(script).toContain('count of projects of f');
    expect(script).toContain('error:not-empty');
  });
});

describe('buildConvertTaskToProjectScript', () => {
  it('looks up task by id', () => {
    const script = buildConvertTaskToProjectScript('task123', {});
    expect(script).toContain('task123');
    expect(script).toContain('flattened task');
  });

  it('creates a project with the task name', () => {
    const script = buildConvertTaskToProjectScript('task123', {});
    expect(script).toContain('make new project');
    expect(script).toContain('name of t');
  });

  it('places project in target folder when folderId given', () => {
    const script = buildConvertTaskToProjectScript('task123', { folderId: 'folderABC' });
    expect(script).toContain('folderABC');
    expect(script).toContain('at end of projects of targetFolder');
  });

  it('copies tags from task to project', () => {
    const script = buildConvertTaskToProjectScript('task123', {});
    expect(script).toContain('tags of t');
    expect(script).toContain('tags of proj');
  });

  it('completes the original task after creating the project', () => {
    const script = buildConvertTaskToProjectScript('task123', {});
    expect(script).toContain('mark complete');
  });

  it('returns id of new project', () => {
    const script = buildConvertTaskToProjectScript('task123', {});
    expect(script).toContain('return id of proj');
  });
});

describe('parseFolders', () => {
  it('parses folder records with parent id', () => {
    const output = 'folder1\tPersonal\t\t3\nfolder2\tWork\t\t7';
    const folders = parseFolders(output);
    expect(folders).toEqual([
      { id: 'folder1', name: 'Personal', parentId: null, path: 'Personal', projectCount: 3 },
      { id: 'folder2', name: 'Work', parentId: null, path: 'Work', projectCount: 7 },
    ]);
  });

  it('builds breadcrumb path for nested folders', () => {
    const output = [
      'f-root\tWork\t\t0',
      'f-inworld\t32 Inworld\tf-root\t0',
      'f-mgmt\tManagement\tf-inworld\t2',
    ].join('\n');
    const folders = parseFolders(output);
    expect(folders[2]).toEqual({
      id: 'f-mgmt',
      name: 'Management',
      parentId: 'f-inworld',
      path: 'Work / 32 Inworld / Management',
      projectCount: 2,
    });
  });

  it('returns empty array for empty output', () => {
    expect(parseFolders('')).toEqual([]);
  });

  it('unescapes folder names', () => {
    const output = 'f1\tName\\nWith\\nNewlines\t\t2';
    const folders = parseFolders(output);
    expect(folders[0].name).toBe('Name\nWith\nNewlines');
  });
});
