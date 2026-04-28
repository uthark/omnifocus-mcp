import { describe, it, expect } from 'vitest';
import {
  buildCompleteTaskScript,
  buildUncompleteTaskScript,
  buildDeleteTaskScript,
  buildUpdateTaskScript,
  buildCreateSubtasksScript,
  buildSearchTasksScript,
  buildGetTaskScript,
} from '../tasks.js';

describe('buildCompleteTaskScript', () => {
  it('marks task as completed by ID', () => {
    const script = buildCompleteTaskScript('task123');
    expect(script).toContain('task123');
    expect(script).toContain('mark complete');
  });
});

describe('buildGetTaskScript', () => {
  it('fetches a single task by ID via taskRecord helper', () => {
    const script = buildGetTaskScript('task123');
    expect(script).toContain('task123');
    expect(script).toContain('my taskRecord(t)');
    expect(script).toContain('on taskRecord');
  });

  it('escapes special characters in ID', () => {
    const script = buildGetTaskScript('id"with"quotes');
    expect(script).toContain('id\\"with\\"quotes');
  });
});

describe('buildUncompleteTaskScript', () => {
  it('reopens task by ID via mark incomplete', () => {
    const script = buildUncompleteTaskScript('task123');
    expect(script).toContain('task123');
    expect(script).toContain('mark incomplete');
  });
});

describe('buildDeleteTaskScript', () => {
  it('deletes task by ID', () => {
    const script = buildDeleteTaskScript('task123');
    expect(script).toContain('task123');
    expect(script).toContain('delete');
  });
});

describe('buildUpdateTaskScript', () => {
  it('updates name when provided', () => {
    const script = buildUpdateTaskScript('task123', { name: 'New name' });
    expect(script).toContain('task123');
    expect(script).toContain('New name');
    expect(script).toContain('set name of');
  });

  it('updates multiple properties', () => {
    const script = buildUpdateTaskScript('task123', {
      name: 'Updated', note: 'Some note', flagged: true, dueDate: '2026-05-01',
    });
    expect(script).toContain('Updated');
    expect(script).toContain('Some note');
    expect(script).toContain('flagged');
    expect(script).toContain('2026-05-01');
  });

  it('converts PM date times to 24-hour before emitting AppleScript', () => {
    const script = buildUpdateTaskScript('task123', { deferDate: 'April 28, 2026 1:00 PM' });
    expect(script).toContain('date "April 28, 2026 13:00"');
    expect(script).not.toContain('PM');
  });

  it('converts AM date times to 24-hour before emitting AppleScript', () => {
    const script = buildUpdateTaskScript('task123', { dueDate: 'April 28, 2026 9:00 AM' });
    expect(script).toContain('date "April 28, 2026 09:00"');
  });

  it('handles tag replacement', () => {
    const script = buildUpdateTaskScript('task123', { tags: ['Work', 'Urgent'] });
    expect(script).toContain('Work');
    expect(script).toContain('Urgent');
  });

  it('escapes special characters', () => {
    const script = buildUpdateTaskScript('task123', { name: 'Task "with" quotes' });
    expect(script).toContain('Task \\"with\\" quotes');
  });

  it('marks task complete when completed=true', () => {
    const script = buildUpdateTaskScript('task123', { completed: true });
    expect(script).toContain('mark complete');
  });

  it('reopens task when completed=false', () => {
    const script = buildUpdateTaskScript('task123', { completed: false });
    expect(script).toContain('mark incomplete');
  });
});

describe('buildCreateSubtasksScript', () => {
  it('creates subtasks under a parent task', () => {
    const script = buildCreateSubtasksScript('task123', [
      { name: 'Subtask 1' },
      { name: 'Subtask 2', note: 'Details here' },
    ]);
    expect(script).toContain('task123');
    expect(script).toContain('Subtask 1');
    expect(script).toContain('Subtask 2');
    expect(script).toContain('Details here');
  });
});

describe('buildSearchTasksScript', () => {
  it('contains the search query in the output', () => {
    const script = buildSearchTasksScript('groceries', 20);
    expect(script).toContain('groceries');
  });

  it('contains name contains whose clause', () => {
    const script = buildSearchTasksScript('groceries', 20);
    expect(script).toContain('name contains');
  });

  it('contains completed is false filter', () => {
    const script = buildSearchTasksScript('groceries', 20);
    expect(script).toContain('completed is false');
  });

  it('escapes special characters in the query', () => {
    const script = buildSearchTasksScript('task "with" quotes', 10);
    expect(script).toContain('task \\"with\\" quotes');
  });

  it('contains TOTAL: output format marker', () => {
    const script = buildSearchTasksScript('groceries', 20);
    expect(script).toContain('TOTAL:');
  });
});
