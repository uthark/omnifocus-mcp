import { describe, it, expect } from 'vitest';
import {
  buildGetTagsScript,
  buildCreateTagScript,
  buildUpdateTagScript,
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

  it('omits the contains filter clause when contains is not provided', () => {
    const script = buildGetTagsScript(50);
    expect(script).not.toContain('whose name contains');
  });

  it('includes a whose name contains clause when contains is provided', () => {
    const script = buildGetTagsScript(50, 'Michael');
    expect(script).toContain('flattened tags whose name contains "Michael"');
  });

  it('escapes special characters in the contains substring', () => {
    const script = buildGetTagsScript(50, 'foo "bar"');
    expect(script).toContain('whose name contains "foo \\"bar\\""');
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

describe('buildUpdateTagScript', () => {
  it('looks up tag by id', () => {
    const script = buildUpdateTagScript('kqVn2buRATj', { name: 'New Name' });
    expect(script).toContain('kqVn2buRATj');
    expect(script).toContain('first flattened tag whose id is');
  });

  it('renames the tag when name is provided', () => {
    const script = buildUpdateTagScript('tag1', { name: 'Renamed' });
    expect(script).toContain('set name of t to "Renamed"');
  });

  it('escapes special characters in name', () => {
    const script = buildUpdateTagScript('tag1', { name: 'Foo "Bar"' });
    expect(script).toContain('Foo \\"Bar\\"');
  });

  it('moves the tag under a parent when parentTagId is non-empty', () => {
    const script = buildUpdateTagScript('tag1', { parentTagId: 'parent123' });
    expect(script).toContain('first flattened tag whose id is "parent123"');
    expect(script).toContain('move t to end of tags of parentTag');
  });

  it('moves the tag to root when parentTagId is empty string', () => {
    const script = buildUpdateTagScript('tag1', { parentTagId: '' });
    expect(script).toContain('move t to end of tags');
    expect(script).not.toContain('move t to end of tags of parentTag');
  });

  it('handles both rename and reparent in one call', () => {
    const script = buildUpdateTagScript('tag1', {
      name: 'Renamed',
      parentTagId: 'parent123',
    });
    expect(script).toContain('set name of t to "Renamed"');
    expect(script).toContain('move t to end of tags of parentTag');
  });

  it('returns id and name of the updated tag', () => {
    const script = buildUpdateTagScript('tag1', { name: 'X' });
    expect(script).toContain('return id of t & tab & name of t');
  });

  it('escapes special characters in tag id', () => {
    const script = buildUpdateTagScript('id"with"quotes', { name: 'X' });
    expect(script).toContain('id\\"with\\"quotes');
  });

  it('escapes special characters in parentTagId', () => {
    const script = buildUpdateTagScript('tag1', { parentTagId: 'pid"x"' });
    expect(script).toContain('pid\\"x\\"');
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
