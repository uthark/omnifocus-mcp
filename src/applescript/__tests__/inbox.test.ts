import { describe, it, expect } from 'vitest';
import {
  buildGetInboxTasksScript,
  buildGetProjectInboxTasksScript,
  buildProcessInboxTaskScript,
  buildQuickEntryScript,
} from '../inbox.js';
import { parsePaginatedTasks } from '../parser.js';

describe('buildGetInboxTasksScript', () => {
  it('generates script for system inbox with defaults', () => {
    const script = buildGetInboxTasksScript(0, 20);
    expect(script).toContain('inbox tasks');
    expect(script).toContain('TOTAL:');
  });

  it('embeds offset and limit', () => {
    const script = buildGetInboxTasksScript(10, 5);
    expect(script).toContain('11');
    expect(script).toContain('15');
  });

  it('excludes completed tasks by default', () => {
    const script = buildGetInboxTasksScript(0, 20);
    expect(script).toContain('whose completed is false');
  });

  it('includes completed tasks when excludeCompleted is false', () => {
    const script = buildGetInboxTasksScript(0, 20, false);
    expect(script).not.toContain('whose completed is false');
  });
});

describe('buildGetProjectInboxTasksScript', () => {
  it('references the project by name', () => {
    const script = buildGetProjectInboxTasksScript('32.01 Work Inbox', 0, 20);
    expect(script).toContain('32.01 Work Inbox');
    expect(script).toContain('flattened tasks');
  });
});

describe('buildProcessInboxTaskScript', () => {
  it('includes task ID', () => {
    const script = buildProcessInboxTaskScript('task123', { projectId: 'proj456' });
    expect(script).toContain('task123');
    expect(script).toContain('proj456');
  });

  it('includes tag assignment when tags provided', () => {
    const script = buildProcessInboxTaskScript('task123', { tags: ['Work', 'Urgent'] });
    expect(script).toContain('Work');
    expect(script).toContain('Urgent');
  });

  it('includes date setting when dates provided', () => {
    const script = buildProcessInboxTaskScript('task123', { dueDate: '2026-05-01', deferDate: '2026-04-25' });
    expect(script).toContain('2026-05-01');
    expect(script).toContain('2026-04-25');
  });

  it('includes flagged setting', () => {
    const script = buildProcessInboxTaskScript('task123', { flagged: true });
    expect(script).toContain('flagged');
    expect(script).toContain('true');
  });
});

describe('buildQuickEntryScript', () => {
  it('creates a task with name', () => {
    const script = buildQuickEntryScript('Buy milk', {});
    expect(script).toContain('Buy milk');
    expect(script).toContain('make new inbox task');
  });

  it('assigns to project when projectId provided', () => {
    const script = buildQuickEntryScript('Buy milk', { projectId: 'proj789' });
    expect(script).toContain('proj789');
  });

  it('escapes special characters in name', () => {
    const script = buildQuickEntryScript('Task "with" quotes', {});
    expect(script).toContain('Task \\"with\\" quotes');
  });
});

describe('parsePaginatedTasks (inbox context)', () => {
  it('parses paginated task output', () => {
    const output = [
      'TOTAL:50',
      'id1\tBuy milk\t\t2026-01-15T10:00:00\t2026-01-15T10:00:00\t\t\tfalse\tfalse\t\t\t',
      'id2\tCall dentist\tSchedule cleaning\t2026-01-16T09:00:00\t2026-01-16T09:00:00\t2026-02-01T00:00:00\t\ttrue\tfalse\t\t\tHealth',
    ].join('\n');
    const result = parsePaginatedTasks(output);
    expect(result.total).toBe(50);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toEqual({
      id: 'id1', name: 'Buy milk', note: '', creationDate: '2026-01-15T10:00:00',
      modificationDate: '2026-01-15T10:00:00', dueDate: null, deferDate: null,
      flagged: false, completed: false, completionDate: null, projectName: null, tags: [],
    });
    expect(result.items[1].name).toBe('Call dentist');
    expect(result.items[1].note).toBe('Schedule cleaning');
    expect(result.items[1].dueDate).toBe('2026-02-01T00:00:00');
    expect(result.items[1].flagged).toBe(true);
    expect(result.items[1].tags).toEqual(['Health']);
  });

  it('returns empty result for zero total', () => {
    const result = parsePaginatedTasks('TOTAL:0');
    expect(result.total).toBe(0);
    expect(result.items).toEqual([]);
  });
});
