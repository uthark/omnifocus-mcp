import { escapeForAppleScript } from './executor.js';
import { splitRecords, splitFields, unescapeField, APPLESCRIPT_HELPERS } from './parser.js';
import type { OFTag } from '../types.js';

export function buildGetTagsScript(limit: number): string {
  return `
tell application "OmniFocus"
  tell default document
    set output to ""
    set allTags to flattened tags
    set tagCount to count of allTags
    set maxCount to tagCount
    if maxCount > ${limit} then set maxCount to ${limit}
    repeat with i from 1 to maxCount
      set t to item i of allTags
      set tagId to id of t
      set tagName to name of t
      set escapedName to my escapeField(tagName)
      set output to output & tagId & tab & escapedName & linefeed
    end repeat
    return output
  end tell
end tell
${APPLESCRIPT_HELPERS}`;
}

export function buildCreateTagScript(
  name: string,
  parentTagId?: string,
): string {
  const escapedName = escapeForAppleScript(name);
  if (parentTagId) {
    const escapedParentId = escapeForAppleScript(parentTagId);
    return `
tell application "OmniFocus"
  tell default document
    set parentTag to first flattened tag whose id is "${escapedParentId}"
    set newTag to make new tag with properties {name:"${escapedName}"} at end of tags of parentTag
    return id of newTag
  end tell
end tell`;
  }
  return `
tell application "OmniFocus"
  tell default document
    set newTag to make new tag with properties {name:"${escapedName}"}
    return id of newTag
  end tell
end tell`;
}

export function parseTagsOutput(output: string): OFTag[] {
  const records = splitRecords(output);
  return records.map((line) => {
    const fields = splitFields(line);
    return {
      id: fields[0],
      name: unescapeField(fields[1] ?? ''),
    };
  });
}
