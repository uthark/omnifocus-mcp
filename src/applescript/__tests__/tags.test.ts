import { describe, it, expect } from 'vitest';
import {
  buildGetTagsScript,
  buildCreateTagScript,
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
