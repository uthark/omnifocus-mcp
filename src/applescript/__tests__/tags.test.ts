import { describe, it, expect } from 'vitest';
import {
  buildGetTagsScript,
  buildCreateTagScript,
  buildDeleteTagScript,
  parseTagsOutput,
} from '../tags.js';

describe('buildGetTagsScript', () => {
  it('returns valid AppleScript that queries tags with limit', () => {
    const script = buildGetTagsScript(50);
    expect(script).toContain('tell application "OmniFocus"');
    expect(script).toContain('flattened tags');
    expect(script).toContain('50');
  });
});

describe('buildCreateTagScript', () => {
  it('embeds the tag name in the script', () => {
    const script = buildCreateTagScript('errands');
    expect(script).toContain('errands');
    expect(script).toContain('make new tag');
  });

  it('escapes special characters in tag name', () => {
    const script = buildCreateTagScript('tag "with" quotes');
    expect(script).toContain('tag \\"with\\" quotes');
  });

  it('includes parent tag lookup when parentTagId is provided', () => {
    const script = buildCreateTagScript('subtag', 'parent123');
    expect(script).toContain('parent123');
  });
});

describe('buildDeleteTagScript', () => {
  it('looks up tag by id and deletes it', () => {
    const script = buildDeleteTagScript('axSrbG7uMip');
    expect(script).toContain('axSrbG7uMip');
    expect(script).toContain('first flattened tag whose id is');
    expect(script).toContain('delete t');
  });

  it('refuses to delete a tag with child tags', () => {
    const script = buildDeleteTagScript('parent123');
    expect(script).toContain('count of tags of t');
    expect(script).toContain('error:has-children');
  });

  it('reports how many tasks were untagged on success', () => {
    const script = buildDeleteTagScript('tag123');
    expect(script).toContain('count of tasks of t');
    expect(script).toContain('"deleted:" & taskCount');
  });

  it('escapes special characters in tag id', () => {
    const script = buildDeleteTagScript('id"with"quotes');
    expect(script).toContain('id\\"with\\"quotes');
  });
});

describe('parseTagsOutput', () => {
  it('parses tab-delimited tag records', () => {
    const output = 'tag1id\tGroceries\ntag2id\tWork';
    const tags = parseTagsOutput(output);
    expect(tags).toEqual([
      { id: 'tag1id', name: 'Groceries' },
      { id: 'tag2id', name: 'Work' },
    ]);
  });

  it('returns empty array for empty output', () => {
    expect(parseTagsOutput('')).toEqual([]);
  });

  it('handles tags with escaped characters in names', () => {
    const output = 'tag1\tName\\twith\\ttabs';
    const tags = parseTagsOutput(output);
    expect(tags).toEqual([{ id: 'tag1', name: 'Name\twith\ttabs' }]);
  });
});
