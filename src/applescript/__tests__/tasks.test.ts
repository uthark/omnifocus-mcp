import { describe, it, expect } from 'vitest';
import {
  buildCompleteTaskScript,
  buildDeleteTaskScript,
  buildUpdateTaskScript,
  buildCreateSubtasksScript,
} from '../tasks.js';

describe('buildCompleteTaskScript', () => {
  it('marks task as completed by ID', () => {
    const script = buildCompleteTaskScript('task123');
    expect(script).toContain('task123');
    expect(script).toContain('set completed of');
    expect(script).toContain('true');
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

  it('handles tag replacement', () => {
    const script = buildUpdateTaskScript('task123', { tags: ['Work', 'Urgent'] });
    expect(script).toContain('Work');
    expect(script).toContain('Urgent');
  });

  it('escapes special characters', () => {
    const script = buildUpdateTaskScript('task123', { name: 'Task "with" quotes' });
    expect(script).toContain('Task \\"with\\" quotes');
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
