import { escapeForAppleScript } from './executor.js';
import { splitRecords, splitFields, unescapeField } from './parser.js';
import type { OFTag } from '../types.js';

export function buildGetTagsScript(): string {
  return `
tell application "OmniFocus"
  tell default document
    set output to ""
    set allTags to flattened tags
    repeat with t in allTags
      set tagId to id of t
      set tagName to name of t
      set escapedName to my escapeField(tagName)
      set output to output & tagId & tab & escapedName & linefeed
    end repeat
    return output
  end tell
end tell

on escapeField(theText)
  set theText to my replaceText(theText, "\\\\", "\\\\\\\\")
  set theText to my replaceText(theText, tab, "\\\\t")
  set theText to my replaceText(theText, linefeed, "\\\\n")
  set theText to my replaceText(theText, return, "\\\\n")
  return theText
end escapeField

on replaceText(theText, searchFor, replaceWith)
  set oldDelims to AppleScript's text item delimiters
  set AppleScript's text item delimiters to searchFor
  set textItems to text items of theText
  set AppleScript's text item delimiters to replaceWith
  set theText to textItems as text
  set AppleScript's text item delimiters to oldDelims
  return theText
end replaceText`;
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
