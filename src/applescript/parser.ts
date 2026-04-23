import type { OFTask } from '../types.js';

export function unescapeField(value: string): string {
  if (value === '') return '';
  let result = '';
  let i = 0;
  while (i < value.length) {
    if (value[i] === '\\' && i + 1 < value.length) {
      const next = value[i + 1];
      if (next === 'n') { result += '\n'; i += 2; continue; }
      if (next === 't') { result += '\t'; i += 2; continue; }
      if (next === '\\') { result += '\\'; i += 2; continue; }
    }
    result += value[i];
    i++;
  }
  return result;
}

export function splitFields(line: string): string[] {
  return line.split('\t');
}

export function splitRecords(output: string): string[] {
  return output.split('\n').filter((line) => line !== '');
}

export function parsePaginatedOutput(output: string): { total: number; lines: string[] } {
  const records = splitRecords(output);
  if (records.length === 0) return { total: 0, lines: [] };
  const firstLine = records[0];
  if (firstLine.startsWith('TOTAL:')) {
    const total = parseInt(firstLine.slice(6), 10);
    return { total, lines: records.slice(1) };
  }
  return { total: records.length, lines: records };
}

export function parseTaskFields(fields: string[]): OFTask {
  return {
    id: fields[0] ?? '',
    name: unescapeField(fields[1] ?? ''),
    note: unescapeField(fields[2] ?? ''),
    creationDate: fields[3] ?? '',
    modificationDate: fields[4] ?? '',
    dueDate: fields[5] || null,
    deferDate: fields[6] || null,
    flagged: fields[7] === 'true',
    completed: fields[8] === 'true',
    completionDate: fields[9] || null,
    projectName: fields[10] || null,
    tags: fields[11] ? fields[11].split(',').filter((t) => t !== '') : [],
  };
}

/**
 * Shared AppleScript handlers for escaping fields, formatting dates,
 * collecting tag names, and building task records.
 */
export const APPLESCRIPT_HELPERS = `
on escapeField(theText)
  if theText is missing value then return ""
  set theText to theText as text
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
end replaceText

on formatDate(theDate)
  if theDate is missing value then return ""
  set y to year of theDate
  set m to (month of theDate as integer)
  set d to day of theDate
  set t to time of theDate
  set h to t div 3600
  set min to (t mod 3600) div 60
  set s to t mod 60
  set pad to "0"
  set mStr to text -2 thru -1 of (pad & m)
  set dStr to text -2 thru -1 of (pad & d)
  set hStr to text -2 thru -1 of (pad & h)
  set minStr to text -2 thru -1 of (pad & min)
  set sStr to text -2 thru -1 of (pad & s)
  return (y as text) & "-" & mStr & "-" & dStr & "T" & hStr & ":" & minStr & ":" & sStr
end formatDate

on getTagNames(t)
  using terms from application "OmniFocus"
    set tagNames to ""
    repeat with tg in tags of t
      if tagNames is not "" then set tagNames to tagNames & ","
      set tagNames to tagNames & name of tg
    end repeat
    return tagNames
  end using terms from
end getTagNames

on taskRecord(t)
  using terms from application "OmniFocus"
    set taskId to id of t
    set taskName to my escapeField(name of t)
    set taskNote to my escapeField(note of t)
    set cDateVal to creation date of t
    set cDate to my formatDate(cDateVal)
    set mDateVal to modification date of t
    set mDate to my formatDate(mDateVal)
    set duDateVal to due date of t
    set duDate to my formatDate(duDateVal)
    set defDateVal to defer date of t
    set defDate to my formatDate(defDateVal)
    set isFlagged to flagged of t
    set isCompleted to completed of t
    set compDateVal to completion date of t
    set compDate to my formatDate(compDateVal)
    try
      set projName to my escapeField(name of containing project of t)
    on error
      set projName to ""
    end try
    set tagStr to my getTagNames(t)
    return taskId & tab & taskName & tab & taskNote & tab & cDate & tab & mDate & tab & duDate & tab & defDate & tab & isFlagged & tab & isCompleted & tab & compDate & tab & projName & tab & tagStr
  end using terms from
end taskRecord`;
