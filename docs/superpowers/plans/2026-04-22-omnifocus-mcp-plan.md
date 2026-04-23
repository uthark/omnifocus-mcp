# OmniFocus MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a TypeScript MCP server that bridges Claude Code to OmniFocus via AppleScript for guided GTD weekly reviews.

**Architecture:** Stateless stdio MCP server using `@modelcontextprotocol/sdk`. Each tool shells out to `osascript` via `execFile` to query/mutate OmniFocus. AppleScript returns tab-delimited strings; TypeScript parses them into structured JSON.

**Tech Stack:** TypeScript, Node.js, `@modelcontextprotocol/sdk`, `zod`, Vitest

---

## File Map

```
omnifocus-mcp/
├── src/
│   ├── index.ts                          # MCP server entry, registers all tools
│   ├── config.ts                         # Inbox source mapping, configurable project names
│   ├── types.ts                          # Shared interfaces (OFTask, OFProject, OFTag)
│   ├── applescript/
│   │   ├── executor.ts                   # execFile wrapper for osascript
│   │   ├── parser.ts                     # Shared escape/unescape/split utilities
│   │   ├── tags.ts                       # Tag AppleScript templates + output parsing
│   │   ├── inbox.ts                      # Inbox AppleScript templates + output parsing
│   │   ├── tasks.ts                      # Task management templates + output parsing
│   │   ├── projects.ts                   # Project templates + output parsing
│   │   └── review.ts                     # Review & reporting templates + output parsing
│   │   └── __tests__/
│   │       ├── parser.test.ts
│   │       ├── tags.test.ts
│   │       ├── inbox.test.ts
│   │       ├── tasks.test.ts
│   │       ├── projects.test.ts
│   │       └── review.test.ts
│   └── tools/
│       ├── tags.ts                       # Tag tool handlers
│       ├── inbox.ts                      # Inbox tool handlers
│       ├── tasks.ts                      # Task tool handlers
│       ├── projects.ts                   # Project tool handlers
│       └── review.ts                     # Review & reporting tool handlers
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

## Delimiter Protocol

All AppleScript output uses a consistent format:

- **Field separator:** tab character (`\t`)
- **Record separator:** newline (`\n`)
- **Escape rules in AppleScript:** `\` → `\\`, tab → `\t` (literal backslash-t), newline → `\n` (literal backslash-n) within field values
- **Null/missing values:** empty string
- **Booleans:** `"true"` / `"false"`
- **Dates:** ISO 8601 format (`YYYY-MM-DDTHH:MM:SS`) or empty string
- **Tags in task records:** comma-separated names
- **Pagination:** first line is `TOTAL:N` (total item count), remaining lines are data records

---

### Task 1: Project Scaffold & Build Config

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `src/index.ts` (placeholder)

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "omnifocus-mcp",
  "version": "0.1.0",
  "description": "MCP server for OmniFocus — GTD weekly review assistant",
  "type": "module",
  "main": "dist/index.js",
  "bin": {
    "omnifocus-mcp": "dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.1",
    "zod": "^3.24.4"
  },
  "devDependencies": {
    "@types/node": "^22.15.3",
    "typescript": "^5.8.3",
    "vitest": "^3.1.3"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "declaration": true,
    "sourceMap": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"],
  "exclude": ["src/**/__tests__/**"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/__tests__/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Create placeholder `src/index.ts`**

```typescript
#!/usr/bin/env node
console.log("omnifocus-mcp placeholder");
```

- [ ] **Step 5: Create directory structure**

```bash
mkdir -p src/applescript/__tests__ src/tools
```

- [ ] **Step 6: Install dependencies**

```bash
npm install
```

- [ ] **Step 7: Verify build works**

```bash
npm run build
```

Expected: compiles with no errors, creates `dist/index.js`.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts src/index.ts
git commit -m "scaffold: project setup with TypeScript, MCP SDK, Vitest"
```

---

### Task 2: Types & Shared Infrastructure

**Files:**
- Create: `src/types.ts`
- Create: `src/config.ts`
- Create: `src/applescript/parser.ts` (shared parsing + `parseTaskFields` + `APPLESCRIPT_HELPERS`)
- Create: `src/applescript/__tests__/parser.test.ts`
- Create: `src/applescript/executor.ts`

- [ ] **Step 1: Create `src/types.ts`**

```typescript
export interface OFTask {
  id: string;
  name: string;
  note: string;
  creationDate: string;
  modificationDate: string;
  dueDate: string | null;
  deferDate: string | null;
  flagged: boolean;
  completed: boolean;
  completionDate: string | null;
  projectName: string | null;
  tags: string[];
}

export interface OFProject {
  id: string;
  name: string;
  note: string;
  status: 'active' | 'on hold' | 'done' | 'dropped';
  taskCount: number;
  nextReviewDate: string | null;
  reviewInterval: number;
}

export interface OFTag {
  id: string;
  name: string;
}

export interface PaginatedResult<T> {
  total: number;
  items: T[];
}
```

- [ ] **Step 2: Create `src/config.ts`**

```typescript
export interface InboxSource {
  type: 'system-inbox' | 'project';
  projectName?: string;
}

export const INBOX_SOURCES: Record<string, InboxSource> = {
  inbox: { type: 'system-inbox' },
  private: { type: 'project', projectName: '11.01 Inbox' },
  work: { type: 'project', projectName: '32.01 Work Inbox' },
};

export type InboxSourceKey = keyof typeof INBOX_SOURCES;
```

- [ ] **Step 3: Write failing test for parser utilities**

Create `src/applescript/__tests__/parser.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  unescapeField,
  splitRecords,
  splitFields,
  parsePaginatedOutput,
  parseTaskFields,
} from '../parser.js';

describe('unescapeField', () => {
  it('returns plain text unchanged', () => {
    expect(unescapeField('hello world')).toBe('hello world');
  });

  it('unescapes literal backslash-n to newline', () => {
    expect(unescapeField('line1\\nline2')).toBe('line1\nline2');
  });

  it('unescapes literal backslash-t to tab', () => {
    expect(unescapeField('col1\\tcol2')).toBe('col1\tcol2');
  });

  it('unescapes literal double backslash to single backslash', () => {
    expect(unescapeField('path\\\\file')).toBe('path\\file');
  });

  it('handles multiple escapes in one string', () => {
    expect(unescapeField('a\\nb\\tc\\\\')).toBe('a\nb\tc\\');
  });

  it('returns empty string for empty input', () => {
    expect(unescapeField('')).toBe('');
  });
});

describe('splitFields', () => {
  it('splits on tab character', () => {
    expect(splitFields('a\tb\tc')).toEqual(['a', 'b', 'c']);
  });

  it('handles single field', () => {
    expect(splitFields('only')).toEqual(['only']);
  });

  it('preserves empty fields', () => {
    expect(splitFields('a\t\tc')).toEqual(['a', '', 'c']);
  });
});

describe('splitRecords', () => {
  it('splits on newline', () => {
    expect(splitRecords('a\nb\nc')).toEqual(['a', 'b', 'c']);
  });

  it('filters empty trailing lines', () => {
    expect(splitRecords('a\nb\n')).toEqual(['a', 'b']);
  });

  it('returns empty array for empty input', () => {
    expect(splitRecords('')).toEqual([]);
  });
});

describe('parsePaginatedOutput', () => {
  it('extracts total from TOTAL: prefix line', () => {
    const result = parsePaginatedOutput('TOTAL:42\nrecord1\nrecord2');
    expect(result.total).toBe(42);
    expect(result.lines).toEqual(['record1', 'record2']);
  });

  it('handles zero total with no records', () => {
    const result = parsePaginatedOutput('TOTAL:0');
    expect(result.total).toBe(0);
    expect(result.lines).toEqual([]);
  });
});

describe('parseTaskFields', () => {
  it('parses a full task record', () => {
    const fields = [
      'id1', 'Buy milk', '', '2026-01-15T10:00:00', '2026-01-15T10:00:00',
      '2026-02-01T00:00:00', '', 'true', 'false', '', 'Groceries', 'Errands,Home',
    ];
    const task = parseTaskFields(fields);
    expect(task).toEqual({
      id: 'id1',
      name: 'Buy milk',
      note: '',
      creationDate: '2026-01-15T10:00:00',
      modificationDate: '2026-01-15T10:00:00',
      dueDate: '2026-02-01T00:00:00',
      deferDate: null,
      flagged: true,
      completed: false,
      completionDate: null,
      projectName: 'Groceries',
      tags: ['Errands', 'Home'],
    });
  });

  it('handles missing optional fields', () => {
    const fields = ['id2', 'Task', '', '', '', '', '', 'false', 'false', '', '', ''];
    const task = parseTaskFields(fields);
    expect(task.dueDate).toBeNull();
    expect(task.projectName).toBeNull();
    expect(task.tags).toEqual([]);
  });

  it('unescapes name and note fields', () => {
    const fields = [
      'id3', 'Line1\\nLine2', 'Note\\twith\\ttabs', '', '', '', '', 'false', 'false', '', '', '',
    ];
    const task = parseTaskFields(fields);
    expect(task.name).toBe('Line1\nLine2');
    expect(task.note).toBe('Note\twith\ttabs');
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

```bash
npm test
```

Expected: FAIL — modules not found.

- [ ] **Step 5: Implement `src/applescript/parser.ts`**

This file contains all shared parsing utilities, `parseTaskFields` (used by inbox, projects, and review modules), and `APPLESCRIPT_HELPERS` (the shared AppleScript escape/format handlers appended to scripts that return task or project records).

```typescript
import type { OFTask } from '../types.js';

export function unescapeField(value: string): string {
  if (value === '') return '';
  let result = '';
  let i = 0;
  while (i < value.length) {
    if (value[i] === '\\' && i + 1 < value.length) {
      const next = value[i + 1];
      if (next === 'n') {
        result += '\n';
        i += 2;
        continue;
      }
      if (next === 't') {
        result += '\t';
        i += 2;
        continue;
      }
      if (next === '\\') {
        result += '\\';
        i += 2;
        continue;
      }
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

export function parsePaginatedOutput(output: string): {
  total: number;
  lines: string[];
} {
  const records = splitRecords(output);
  if (records.length === 0) {
    return { total: 0, lines: [] };
  }
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
 * collecting tag names, and building task records. Append this to any
 * script that needs to return task or project records.
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
  set h to hours of theDate
  set min to minutes of theDate
  set s to seconds of theDate
  set pad to "0"
  set mStr to text -2 thru -1 of (pad & m)
  set dStr to text -2 thru -1 of (pad & d)
  set hStr to text -2 thru -1 of (pad & h)
  set minStr to text -2 thru -1 of (pad & min)
  set sStr to text -2 thru -1 of (pad & s)
  return (y as text) & "-" & mStr & "-" & dStr & "T" & hStr & ":" & minStr & ":" & sStr
end formatDate

on getTagNames(t)
  set tagNames to ""
  repeat with tg in tags of t
    if tagNames is not "" then set tagNames to tagNames & ","
    set tagNames to tagNames & name of tg
  end repeat
  return tagNames
end getTagNames

on taskRecord(t)
  set taskId to id of t
  set taskName to my escapeField(name of t)
  set taskNote to my escapeField(note of t)
  set cDate to my formatDate(creation date of t)
  set mDate to my formatDate(modification date of t)
  set duDate to my formatDate(due date of t)
  set defDate to my formatDate(defer date of t)
  set isFlagged to flagged of t
  set isCompleted to completed of t
  set compDate to my formatDate(completion date of t)
  try
    set projName to my escapeField(name of containing project of t)
  on error
    set projName to ""
  end try
  set tagStr to my getTagNames(t)
  return taskId & tab & taskName & tab & taskNote & tab & cDate & tab & mDate & tab & duDate & tab & defDate & tab & isFlagged & tab & isCompleted & tab & compDate & tab & projName & tab & tagStr
end taskRecord`;
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npm test
```

Expected: all parser tests PASS.

- [ ] **Step 7: Create `src/applescript/executor.ts`**

```typescript
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export class AppleScriptError extends Error {
  constructor(
    message: string,
    public readonly stderr: string,
  ) {
    super(message);
    this.name = 'AppleScriptError';
  }
}

export async function runAppleScript(script: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('osascript', ['-e', script]);
    return stdout.trimEnd();
  } catch (error: unknown) {
    const err = error as { stderr?: string; message?: string };
    throw new AppleScriptError(
      `AppleScript execution failed: ${err.message ?? 'unknown error'}`,
      err.stderr ?? '',
    );
  }
}

export function escapeForAppleScript(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
```

- [ ] **Step 8: Verify build compiles**

```bash
npm run build
```

Expected: compiles with no errors.

- [ ] **Step 9: Commit**

```bash
git add src/types.ts src/config.ts src/applescript/parser.ts src/applescript/__tests__/parser.test.ts src/applescript/executor.ts
git commit -m "feat: add types, config, parser utilities, and executor"
```

---

### Task 3: Tags Tools (Proving the End-to-End Pattern)

**Files:**
- Create: `src/applescript/tags.ts`
- Create: `src/applescript/__tests__/tags.test.ts`
- Create: `src/tools/tags.ts`

- [ ] **Step 1: Write failing test for tags templates and parsing**

Create `src/applescript/__tests__/tags.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  buildGetTagsScript,
  buildCreateTagScript,
  parseTagsOutput,
} from '../tags.js';

describe('buildGetTagsScript', () => {
  it('returns valid AppleScript that queries all tags', () => {
    const script = buildGetTagsScript();
    expect(script).toContain('tell application "OmniFocus"');
    expect(script).toContain('flattened tags');
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- src/applescript/__tests__/tags.test.ts
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `src/applescript/tags.ts`**

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- src/applescript/__tests__/tags.test.ts
```

Expected: all tags tests PASS.

- [ ] **Step 5: Create `src/tools/tags.ts`**

```typescript
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { runAppleScript } from '../applescript/executor.js';
import {
  buildGetTagsScript,
  buildCreateTagScript,
  parseTagsOutput,
} from '../applescript/tags.js';

export function registerTagTools(server: McpServer): void {
  server.tool(
    'get_tags',
    'List all tags in OmniFocus',
    {},
    async () => {
      const output = await runAppleScript(buildGetTagsScript());
      const tags = parseTagsOutput(output);
      return {
        content: [{ type: 'text', text: JSON.stringify(tags, null, 2) }],
      };
    },
  );

  server.tool(
    'create_tag',
    'Create a new tag in OmniFocus',
    {
      name: z.string().describe('Tag name'),
      parentTagId: z
        .string()
        .optional()
        .describe('Parent tag ID for nested tags'),
    },
    async ({ name, parentTagId }) => {
      const output = await runAppleScript(
        buildCreateTagScript(name, parentTagId),
      );
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ id: output.trim(), name }),
          },
        ],
      };
    },
  );
}
```

- [ ] **Step 6: Verify build compiles**

```bash
npm run build
```

Expected: compiles with no errors.

- [ ] **Step 7: Commit**

```bash
git add src/applescript/tags.ts src/applescript/__tests__/tags.test.ts src/tools/tags.ts
git commit -m "feat: add tags tools (get_tags, create_tag)"
```

---

### Task 4: Inbox Tools

**Files:**
- Create: `src/applescript/inbox.ts`
- Create: `src/applescript/__tests__/inbox.test.ts`
- Create: `src/tools/inbox.ts`

- [ ] **Step 1: Write failing test for inbox templates and parsing**

Create `src/applescript/__tests__/inbox.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  buildGetInboxTasksScript,
  buildGetProjectInboxTasksScript,
  buildProcessInboxTaskScript,
  buildQuickEntryScript,
  parseInboxTasksOutput,
} from '../inbox.js';

describe('buildGetInboxTasksScript', () => {
  it('generates script for system inbox with defaults', () => {
    const script = buildGetInboxTasksScript(0, 20);
    expect(script).toContain('inbox tasks');
    expect(script).toContain('TOTAL:');
  });

  it('embeds offset and limit', () => {
    const script = buildGetInboxTasksScript(10, 5);
    expect(script).toContain('11'); // offset+1 for 1-indexed AppleScript
    expect(script).toContain('15'); // offset+limit
  });
});

describe('buildGetProjectInboxTasksScript', () => {
  it('references the project by name', () => {
    const script = buildGetProjectInboxTasksScript(
      '32.01 Work Inbox',
      0,
      20,
    );
    expect(script).toContain('32.01 Work Inbox');
    expect(script).toContain('flattened tasks');
  });
});

describe('buildProcessInboxTaskScript', () => {
  it('includes task ID', () => {
    const script = buildProcessInboxTaskScript('task123', {
      projectId: 'proj456',
    });
    expect(script).toContain('task123');
    expect(script).toContain('proj456');
  });

  it('includes tag assignment when tags provided', () => {
    const script = buildProcessInboxTaskScript('task123', {
      tags: ['Work', 'Urgent'],
    });
    expect(script).toContain('Work');
    expect(script).toContain('Urgent');
  });

  it('includes date setting when dates provided', () => {
    const script = buildProcessInboxTaskScript('task123', {
      dueDate: '2026-05-01',
      deferDate: '2026-04-25',
    });
    expect(script).toContain('2026-05-01');
    expect(script).toContain('2026-04-25');
  });

  it('includes flagged setting', () => {
    const script = buildProcessInboxTaskScript('task123', {
      flagged: true,
    });
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
    const script = buildQuickEntryScript('Buy milk', {
      projectId: 'proj789',
    });
    expect(script).toContain('proj789');
  });

  it('escapes special characters in name', () => {
    const script = buildQuickEntryScript('Task "with" quotes', {});
    expect(script).toContain('Task \\"with\\" quotes');
  });
});

describe('parseInboxTasksOutput', () => {
  it('parses paginated task output', () => {
    const output = [
      'TOTAL:50',
      'id1\tBuy milk\t\t2026-01-15T10:00:00\t2026-01-15T10:00:00\t\t\tfalse\tfalse\t\t\t',
      'id2\tCall dentist\tSchedule cleaning\t2026-01-16T09:00:00\t2026-01-16T09:00:00\t2026-02-01T00:00:00\t\ttrue\tfalse\t\t\tHealth',
    ].join('\n');
    const result = parseInboxTasksOutput(output);
    expect(result.total).toBe(50);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toEqual({
      id: 'id1',
      name: 'Buy milk',
      note: '',
      creationDate: '2026-01-15T10:00:00',
      modificationDate: '2026-01-15T10:00:00',
      dueDate: null,
      deferDate: null,
      flagged: false,
      completed: false,
      completionDate: null,
      projectName: null,
      tags: [],
    });
    expect(result.items[1].name).toBe('Call dentist');
    expect(result.items[1].note).toBe('Schedule cleaning');
    expect(result.items[1].dueDate).toBe('2026-02-01T00:00:00');
    expect(result.items[1].flagged).toBe(true);
    expect(result.items[1].tags).toEqual(['Health']);
  });

  it('returns empty result for zero total', () => {
    const result = parseInboxTasksOutput('TOTAL:0');
    expect(result.total).toBe(0);
    expect(result.items).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- src/applescript/__tests__/inbox.test.ts
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `src/applescript/inbox.ts`**

```typescript
import { escapeForAppleScript } from './executor.js';
import {
  splitFields,
  parsePaginatedOutput,
  parseTaskFields,
  APPLESCRIPT_HELPERS,
} from './parser.js';
import type { OFTask, PaginatedResult } from '../types.js';

export function buildGetInboxTasksScript(
  offset: number,
  limit: number,
): string {
  return `
tell application "OmniFocus"
  tell default document
    set allTasks to inbox tasks
    set taskCount to count of allTasks
    set output to "TOTAL:" & taskCount & linefeed
    set startIdx to ${offset + 1}
    set endIdx to ${offset + limit}
    if endIdx > taskCount then set endIdx to taskCount
    if startIdx > taskCount then return output
    repeat with i from startIdx to endIdx
      set t to item i of allTasks
      set output to output & my taskRecord(t) & linefeed
    end repeat
    return output
  end tell
end tell
${APPLESCRIPT_HELPERS}`;
}

export function buildGetProjectInboxTasksScript(
  projectName: string,
  offset: number,
  limit: number,
): string {
  const escaped = escapeForAppleScript(projectName);
  return `
tell application "OmniFocus"
  tell default document
    set proj to first flattened project whose name is "${escaped}"
    set allTasks to flattened tasks of proj whose completed is false
    set taskCount to count of allTasks
    set output to "TOTAL:" & taskCount & linefeed
    set startIdx to ${offset + 1}
    set endIdx to ${offset + limit}
    if endIdx > taskCount then set endIdx to taskCount
    if startIdx > taskCount then return output
    repeat with i from startIdx to endIdx
      set t to item i of allTasks
      set output to output & my taskRecord(t) & linefeed
    end repeat
    return output
  end tell
end tell
${APPLESCRIPT_HELPERS}`;
}

export function buildProcessInboxTaskScript(
  taskId: string,
  options: {
    projectId?: string;
    tags?: string[];
    dueDate?: string;
    deferDate?: string;
    flagged?: boolean;
  },
): string {
  const escapedTaskId = escapeForAppleScript(taskId);
  const lines: string[] = [
    `tell application "OmniFocus"`,
    `  tell default document`,
    `    set t to first flattened task whose id is "${escapedTaskId}"`,
  ];

  if (options.projectId) {
    const escapedProjectId = escapeForAppleScript(options.projectId);
    lines.push(
      `    set proj to first flattened project whose id is "${escapedProjectId}"`,
    );
    lines.push(`    move t to end of tasks of proj`);
  }

  if (options.tags && options.tags.length > 0) {
    for (const tag of options.tags) {
      const escapedTag = escapeForAppleScript(tag);
      lines.push(
        `    set tg to first flattened tag whose name is "${escapedTag}"`,
      );
      lines.push(`    add tg to tags of t`);
    }
  }

  if (options.dueDate) {
    lines.push(
      `    set due date of t to date "${escapeForAppleScript(options.dueDate)}"`,
    );
  }

  if (options.deferDate) {
    lines.push(
      `    set defer date of t to date "${escapeForAppleScript(options.deferDate)}"`,
    );
  }

  if (options.flagged !== undefined) {
    lines.push(`    set flagged of t to ${options.flagged}`);
  }

  lines.push(`    return id of t`);
  lines.push(`  end tell`);
  lines.push(`end tell`);

  return lines.join('\n');
}

export function buildQuickEntryScript(
  name: string,
  options: {
    note?: string;
    projectId?: string;
    tags?: string[];
    dueDate?: string;
    deferDate?: string;
    flagged?: boolean;
  },
): string {
  const escapedName = escapeForAppleScript(name);
  const props: string[] = [`name:"${escapedName}"`];

  if (options.note) {
    props.push(`note:"${escapeForAppleScript(options.note)}"`);
  }
  if (options.flagged !== undefined) {
    props.push(`flagged:${options.flagged}`);
  }

  const lines: string[] = [
    `tell application "OmniFocus"`,
    `  tell default document`,
  ];

  if (options.projectId) {
    const escapedProjectId = escapeForAppleScript(options.projectId);
    lines.push(
      `    set proj to first flattened project whose id is "${escapedProjectId}"`,
    );
    lines.push(
      `    set t to make new task with properties {${props.join(', ')}} at end of tasks of proj`,
    );
  } else {
    lines.push(
      `    set t to make new inbox task with properties {${props.join(', ')}}`,
    );
  }

  if (options.dueDate) {
    lines.push(
      `    set due date of t to date "${escapeForAppleScript(options.dueDate)}"`,
    );
  }
  if (options.deferDate) {
    lines.push(
      `    set defer date of t to date "${escapeForAppleScript(options.deferDate)}"`,
    );
  }

  if (options.tags && options.tags.length > 0) {
    for (const tag of options.tags) {
      const escapedTag = escapeForAppleScript(tag);
      lines.push(
        `    set tg to first flattened tag whose name is "${escapedTag}"`,
      );
      lines.push(`    add tg to tags of t`);
    }
  }

  lines.push(`    return id of t`);
  lines.push(`  end tell`);
  lines.push(`end tell`);

  return lines.join('\n');
}

export function parseInboxTasksOutput(output: string): PaginatedResult<OFTask> {
  const { total, lines } = parsePaginatedOutput(output);
  const items = lines.map((line) => parseTaskFields(splitFields(line)));
  return { total, items };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- src/applescript/__tests__/inbox.test.ts
```

Expected: all inbox tests PASS.

- [ ] **Step 5: Create `src/tools/inbox.ts`**

```typescript
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { runAppleScript } from '../applescript/executor.js';
import {
  buildGetInboxTasksScript,
  buildGetProjectInboxTasksScript,
  buildProcessInboxTaskScript,
  buildQuickEntryScript,
  parseInboxTasksOutput,
} from '../applescript/inbox.js';
import { INBOX_SOURCES } from '../config.js';

export function registerInboxTools(server: McpServer): void {
  server.tool(
    'get_inbox_tasks',
    'List inbox tasks with pagination. Supports system inbox and project-based inboxes (private, work).',
    {
      source: z
        .enum(['inbox', 'private', 'work'])
        .default('inbox')
        .describe('Which inbox to read: "inbox" (system), "private" (11.01 Inbox), "work" (32.01 Work Inbox)'),
      offset: z.number().int().min(0).default(0).describe('Skip first N tasks'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(20)
        .describe('Max tasks to return'),
    },
    async ({ source, offset, limit }) => {
      const inboxConfig = INBOX_SOURCES[source];
      let script: string;
      if (inboxConfig.type === 'project' && inboxConfig.projectName) {
        script = buildGetProjectInboxTasksScript(
          inboxConfig.projectName,
          offset,
          limit,
        );
      } else {
        script = buildGetInboxTasksScript(offset, limit);
      }
      const output = await runAppleScript(script);
      const result = parseInboxTasksOutput(output);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.tool(
    'process_inbox_task',
    'Move an inbox task to a project, assign tags, and set dates. Use this to process items during inbox triage.',
    {
      taskId: z.string().describe('OmniFocus task ID'),
      projectId: z.string().optional().describe('Project ID to move task into'),
      tags: z
        .array(z.string())
        .optional()
        .describe('Tag names to assign'),
      dueDate: z
        .string()
        .optional()
        .describe('Due date (e.g., "April 30, 2026")'),
      deferDate: z
        .string()
        .optional()
        .describe('Defer date (e.g., "April 25, 2026")'),
      flagged: z.boolean().optional().describe('Set flagged status'),
    },
    async ({ taskId, projectId, tags, dueDate, deferDate, flagged }) => {
      const output = await runAppleScript(
        buildProcessInboxTaskScript(taskId, {
          projectId,
          tags,
          dueDate,
          deferDate,
          flagged,
        }),
      );
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ success: true, taskId: output.trim() }),
          },
        ],
      };
    },
  );

  server.tool(
    'quick_entry',
    'Create a new task in the inbox or directly in a project.',
    {
      name: z.string().describe('Task name'),
      note: z.string().optional().describe('Task note'),
      projectId: z
        .string()
        .optional()
        .describe('Project ID to create task in (omit for inbox)'),
      tags: z
        .array(z.string())
        .optional()
        .describe('Tag names to assign'),
      dueDate: z
        .string()
        .optional()
        .describe('Due date (e.g., "April 30, 2026")'),
      deferDate: z
        .string()
        .optional()
        .describe('Defer date (e.g., "April 25, 2026")'),
      flagged: z.boolean().optional().describe('Set flagged status'),
    },
    async ({ name, note, projectId, tags, dueDate, deferDate, flagged }) => {
      const output = await runAppleScript(
        buildQuickEntryScript(name, {
          note,
          projectId,
          tags,
          dueDate,
          deferDate,
          flagged,
        }),
      );
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ success: true, taskId: output.trim() }),
          },
        ],
      };
    },
  );
}
```

- [ ] **Step 6: Run all tests and verify build**

```bash
npm test && npm run build
```

Expected: all tests PASS, build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/applescript/inbox.ts src/applescript/__tests__/inbox.test.ts src/tools/inbox.ts
git commit -m "feat: add inbox tools (get_inbox_tasks, process_inbox_task, quick_entry)"
```

---

### Task 5: Task Management Tools

**Files:**
- Create: `src/applescript/tasks.ts`
- Create: `src/applescript/__tests__/tasks.test.ts`
- Create: `src/tools/tasks.ts`

- [ ] **Step 1: Write failing test for task templates and parsing**

Create `src/applescript/__tests__/tasks.test.ts`:

```typescript
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
      name: 'Updated',
      note: 'Some note',
      flagged: true,
      dueDate: '2026-05-01',
    });
    expect(script).toContain('Updated');
    expect(script).toContain('Some note');
    expect(script).toContain('flagged');
    expect(script).toContain('2026-05-01');
  });

  it('handles tag replacement', () => {
    const script = buildUpdateTaskScript('task123', {
      tags: ['Work', 'Urgent'],
    });
    expect(script).toContain('Work');
    expect(script).toContain('Urgent');
  });

  it('escapes special characters', () => {
    const script = buildUpdateTaskScript('task123', {
      name: 'Task "with" quotes',
    });
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- src/applescript/__tests__/tasks.test.ts
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `src/applescript/tasks.ts`**

```typescript
import { escapeForAppleScript } from './executor.js';

export function buildCompleteTaskScript(taskId: string): string {
  const escaped = escapeForAppleScript(taskId);
  return `
tell application "OmniFocus"
  tell default document
    set t to first flattened task whose id is "${escaped}"
    set completed of t to true
    return id of t
  end tell
end tell`;
}

export function buildDeleteTaskScript(taskId: string): string {
  const escaped = escapeForAppleScript(taskId);
  return `
tell application "OmniFocus"
  tell default document
    set t to first flattened task whose id is "${escaped}"
    delete t
    return "deleted"
  end tell
end tell`;
}

export function buildUpdateTaskScript(
  taskId: string,
  options: {
    name?: string;
    note?: string;
    tags?: string[];
    dueDate?: string;
    deferDate?: string;
    flagged?: boolean;
  },
): string {
  const escapedId = escapeForAppleScript(taskId);
  const lines: string[] = [
    `tell application "OmniFocus"`,
    `  tell default document`,
    `    set t to first flattened task whose id is "${escapedId}"`,
  ];

  if (options.name !== undefined) {
    lines.push(
      `    set name of t to "${escapeForAppleScript(options.name)}"`,
    );
  }
  if (options.note !== undefined) {
    lines.push(
      `    set note of t to "${escapeForAppleScript(options.note)}"`,
    );
  }
  if (options.flagged !== undefined) {
    lines.push(`    set flagged of t to ${options.flagged}`);
  }
  if (options.dueDate !== undefined) {
    lines.push(
      `    set due date of t to date "${escapeForAppleScript(options.dueDate)}"`,
    );
  }
  if (options.deferDate !== undefined) {
    lines.push(
      `    set defer date of t to date "${escapeForAppleScript(options.deferDate)}"`,
    );
  }
  if (options.tags !== undefined) {
    lines.push(`    -- Remove existing tags`);
    lines.push(`    repeat while (count of tags of t) > 0`);
    lines.push(`      remove item 1 of tags of t from tags of t`);
    lines.push(`    end repeat`);
    for (const tag of options.tags) {
      const escapedTag = escapeForAppleScript(tag);
      lines.push(
        `    set tg to first flattened tag whose name is "${escapedTag}"`,
      );
      lines.push(`    add tg to tags of t`);
    }
  }

  lines.push(`    return id of t`);
  lines.push(`  end tell`);
  lines.push(`end tell`);

  return lines.join('\n');
}

export function buildCreateSubtasksScript(
  taskId: string,
  subtasks: Array<{ name: string; note?: string }>,
): string {
  const escapedId = escapeForAppleScript(taskId);
  const lines: string[] = [
    `tell application "OmniFocus"`,
    `  tell default document`,
    `    set parentTask to first flattened task whose id is "${escapedId}"`,
    `    set ids to ""`,
  ];

  for (const subtask of subtasks) {
    const escapedName = escapeForAppleScript(subtask.name);
    const props = [`name:"${escapedName}"`];
    if (subtask.note) {
      props.push(`note:"${escapeForAppleScript(subtask.note)}"`);
    }
    lines.push(
      `    set st to make new task with properties {${props.join(', ')}} at end of tasks of parentTask`,
    );
    lines.push(
      `    if ids is not "" then set ids to ids & ","`,
    );
    lines.push(`    set ids to ids & id of st`);
  }

  lines.push(`    return ids`);
  lines.push(`  end tell`);
  lines.push(`end tell`);

  return lines.join('\n');
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- src/applescript/__tests__/tasks.test.ts
```

Expected: all task tests PASS.

- [ ] **Step 5: Create `src/tools/tasks.ts`**

```typescript
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { runAppleScript } from '../applescript/executor.js';
import {
  buildCompleteTaskScript,
  buildDeleteTaskScript,
  buildUpdateTaskScript,
  buildCreateSubtasksScript,
} from '../applescript/tasks.js';

export function registerTaskTools(server: McpServer): void {
  server.tool(
    'complete_task',
    'Mark a task as completed',
    {
      taskId: z.string().describe('OmniFocus task ID'),
    },
    async ({ taskId }) => {
      const output = await runAppleScript(buildCompleteTaskScript(taskId));
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ success: true, taskId: output.trim() }),
          },
        ],
      };
    },
  );

  server.tool(
    'delete_task',
    'Delete a task from OmniFocus',
    {
      taskId: z.string().describe('OmniFocus task ID'),
    },
    async ({ taskId }) => {
      await runAppleScript(buildDeleteTaskScript(taskId));
      return {
        content: [
          { type: 'text', text: JSON.stringify({ success: true }) },
        ],
      };
    },
  );

  server.tool(
    'update_task',
    'Modify task properties: name, note, tags, dates, flagged status',
    {
      taskId: z.string().describe('OmniFocus task ID'),
      name: z.string().optional().describe('New task name'),
      note: z.string().optional().describe('New task note'),
      tags: z
        .array(z.string())
        .optional()
        .describe('Replace all tags with these tag names'),
      dueDate: z
        .string()
        .optional()
        .describe('Due date (e.g., "April 30, 2026")'),
      deferDate: z
        .string()
        .optional()
        .describe('Defer date (e.g., "April 25, 2026")'),
      flagged: z.boolean().optional().describe('Set flagged status'),
    },
    async ({ taskId, name, note, tags, dueDate, deferDate, flagged }) => {
      const output = await runAppleScript(
        buildUpdateTaskScript(taskId, {
          name,
          note,
          tags,
          dueDate,
          deferDate,
          flagged,
        }),
      );
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ success: true, taskId: output.trim() }),
          },
        ],
      };
    },
  );

  server.tool(
    'create_subtasks',
    'Break a task into subtasks',
    {
      taskId: z.string().describe('Parent task ID'),
      subtasks: z
        .array(
          z.object({
            name: z.string().describe('Subtask name'),
            note: z.string().optional().describe('Subtask note'),
          }),
        )
        .describe('Subtasks to create'),
    },
    async ({ taskId, subtasks }) => {
      const output = await runAppleScript(
        buildCreateSubtasksScript(taskId, subtasks),
      );
      const ids = output
        .trim()
        .split(',')
        .filter((id) => id !== '');
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ success: true, subtaskIds: ids }),
          },
        ],
      };
    },
  );
}
```

- [ ] **Step 6: Run all tests and verify build**

```bash
npm test && npm run build
```

Expected: all tests PASS, build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/applescript/tasks.ts src/applescript/__tests__/tasks.test.ts src/tools/tasks.ts
git commit -m "feat: add task management tools (complete, delete, update, create_subtasks)"
```

---

### Task 6: Project Management Tools

**Files:**
- Create: `src/applescript/projects.ts`
- Create: `src/applescript/__tests__/projects.test.ts`
- Create: `src/tools/projects.ts`

- [ ] **Step 1: Write failing test for project templates and parsing**

Create `src/applescript/__tests__/projects.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  buildGetProjectsScript,
  buildGetProjectTasksScript,
  buildCreateProjectScript,
  buildUpdateProjectScript,
  parseProjectsOutput,
  parseProjectTasksOutput,
} from '../projects.js';

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
});

describe('buildUpdateProjectScript', () => {
  it('updates project status', () => {
    const script = buildUpdateProjectScript('proj123', {
      status: 'on hold',
    });
    expect(script).toContain('proj123');
    expect(script).toContain('on hold');
  });
});

describe('parseProjectsOutput', () => {
  it('parses project records', () => {
    const output =
      'proj1\tMy Project\tSome notes\tactive\t5\t2026-05-01T00:00:00\t604800';
    const projects = parseProjectsOutput(output);
    expect(projects).toEqual([
      {
        id: 'proj1',
        name: 'My Project',
        note: 'Some notes',
        status: 'active',
        taskCount: 5,
        nextReviewDate: '2026-05-01T00:00:00',
        reviewInterval: 604800,
      },
    ]);
  });

  it('returns empty array for empty output', () => {
    expect(parseProjectsOutput('')).toEqual([]);
  });
});

describe('parseProjectTasksOutput', () => {
  it('parses paginated task output', () => {
    const output = [
      'TOTAL:2',
      'id1\tTask 1\t\t2026-01-15T10:00:00\t2026-01-15T10:00:00\t\t\tfalse\tfalse\t\tMy Project\t',
    ].join('\n');
    const result = parseProjectTasksOutput(output);
    expect(result.total).toBe(2);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe('Task 1');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- src/applescript/__tests__/projects.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/applescript/projects.ts`**

```typescript
import { escapeForAppleScript } from './executor.js';
import {
  splitRecords,
  splitFields,
  unescapeField,
  parsePaginatedOutput,
  parseTaskFields,
  APPLESCRIPT_HELPERS,
} from './parser.js';
import type { OFProject, OFTask, PaginatedResult } from '../types.js';

export function buildGetProjectsScript(options: {
  status?: string;
  limit?: number;
}): string {
  const statusFilter = options.status ?? 'active';
  const limit = options.limit ?? 100;
  return `
tell application "OmniFocus"
  tell default document
    set output to ""
    set allProjects to flattened projects whose status is ${statusFilter}
    set projCount to count of allProjects
    set maxCount to ${limit}
    if maxCount > projCount then set maxCount to projCount
    repeat with i from 1 to maxCount
      set p to item i of allProjects
      set projId to id of p
      set projName to my escapeField(name of p)
      set projNote to my escapeField(note of p)
      set projStatus to status of p as text
      set tCount to count of flattened tasks of p whose completed is false
      set revDate to my formatDate(next review date of p)
      set revInterval to review interval of p
      set output to output & projId & tab & projName & tab & projNote & tab & projStatus & tab & tCount & tab & revDate & tab & revInterval & linefeed
    end repeat
    return output
  end tell
end tell
${APPLESCRIPT_HELPERS}`;
}

export function buildGetProjectTasksScript(
  projectId: string,
  offset: number,
  limit: number,
): string {
  const escaped = escapeForAppleScript(projectId);
  return `
tell application "OmniFocus"
  tell default document
    set proj to first flattened project whose id is "${escaped}"
    set allTasks to flattened tasks of proj whose completed is false
    set taskCount to count of allTasks
    set output to "TOTAL:" & taskCount & linefeed
    set startIdx to ${offset + 1}
    set endIdx to ${offset + limit}
    if endIdx > taskCount then set endIdx to taskCount
    if startIdx > taskCount then return output
    repeat with i from startIdx to endIdx
      set t to item i of allTasks
      set output to output & my taskRecord(t) & linefeed
    end repeat
    return output
  end tell
end tell
${APPLESCRIPT_HELPERS}`;
}

export function buildCreateProjectScript(
  name: string,
  options: {
    note?: string;
    tags?: string[];
    reviewInterval?: number;
    tasks?: Array<{ name: string; note?: string }>;
  },
): string {
  const escapedName = escapeForAppleScript(name);
  const props: string[] = [`name:"${escapedName}"`];
  if (options.note) {
    props.push(`note:"${escapeForAppleScript(options.note)}"`);
  }
  if (options.reviewInterval) {
    props.push(`review interval:${options.reviewInterval}`);
  }

  const lines: string[] = [
    `tell application "OmniFocus"`,
    `  tell default document`,
    `    set proj to make new project with properties {${props.join(', ')}}`,
  ];

  if (options.tags && options.tags.length > 0) {
    for (const tag of options.tags) {
      const escapedTag = escapeForAppleScript(tag);
      lines.push(
        `    set tg to first flattened tag whose name is "${escapedTag}"`,
      );
      lines.push(`    add tg to tags of proj`);
    }
  }

  if (options.tasks && options.tasks.length > 0) {
    for (const task of options.tasks) {
      const taskName = escapeForAppleScript(task.name);
      const taskProps = [`name:"${taskName}"`];
      if (task.note) {
        taskProps.push(`note:"${escapeForAppleScript(task.note)}"`);
      }
      lines.push(
        `    make new task with properties {${taskProps.join(', ')}} at end of tasks of proj`,
      );
    }
  }

  lines.push(`    return id of proj`);
  lines.push(`  end tell`);
  lines.push(`end tell`);

  return lines.join('\n');
}

export function buildUpdateProjectScript(
  projectId: string,
  options: {
    status?: string;
    reviewInterval?: number;
    name?: string;
    note?: string;
  },
): string {
  const escapedId = escapeForAppleScript(projectId);
  const lines: string[] = [
    `tell application "OmniFocus"`,
    `  tell default document`,
    `    set proj to first flattened project whose id is "${escapedId}"`,
  ];

  if (options.name !== undefined) {
    lines.push(
      `    set name of proj to "${escapeForAppleScript(options.name)}"`,
    );
  }
  if (options.note !== undefined) {
    lines.push(
      `    set note of proj to "${escapeForAppleScript(options.note)}"`,
    );
  }
  if (options.status !== undefined) {
    const statusMap: Record<string, string> = {
      active: 'active',
      'on hold': 'on hold',
      done: 'done',
      dropped: 'dropped',
    };
    const asStatus = statusMap[options.status] ?? 'active';
    lines.push(`    set status of proj to ${asStatus}`);
  }
  if (options.reviewInterval !== undefined) {
    lines.push(
      `    set review interval of proj to ${options.reviewInterval}`,
    );
  }

  lines.push(`    return id of proj`);
  lines.push(`  end tell`);
  lines.push(`end tell`);

  return lines.join('\n');
}

export function parseProjectsOutput(output: string): OFProject[] {
  const records = splitRecords(output);
  return records.map((line) => {
    const fields = splitFields(line);
    return {
      id: fields[0] ?? '',
      name: unescapeField(fields[1] ?? ''),
      note: unescapeField(fields[2] ?? ''),
      status: (fields[3] ?? 'active') as OFProject['status'],
      taskCount: parseInt(fields[4] ?? '0', 10),
      nextReviewDate: fields[5] || null,
      reviewInterval: parseInt(fields[6] ?? '0', 10),
    };
  });
}

function parseTaskFields(fields: string[]): OFTask {
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

export function parseProjectTasksOutput(
  output: string,
): PaginatedResult<OFTask> {
  const { total, lines } = parsePaginatedOutput(output);
  const items = lines.map((line) => parseTaskFields(splitFields(line)));
  return { total, items };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- src/applescript/__tests__/projects.test.ts
```

Expected: all project tests PASS.

- [ ] **Step 5: Create `src/tools/projects.ts`**

```typescript
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { runAppleScript } from '../applescript/executor.js';
import {
  buildGetProjectsScript,
  buildGetProjectTasksScript,
  buildCreateProjectScript,
  buildUpdateProjectScript,
  parseProjectsOutput,
  parseProjectTasksOutput,
} from '../applescript/projects.js';

export function registerProjectTools(server: McpServer): void {
  server.tool(
    'get_projects',
    'List projects with status, task counts, and review dates',
    {
      status: z
        .enum(['active', 'on hold', 'done', 'dropped'])
        .default('active')
        .describe('Filter by project status'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(500)
        .default(100)
        .describe('Max projects to return'),
    },
    async ({ status, limit }) => {
      const output = await runAppleScript(
        buildGetProjectsScript({ status, limit }),
      );
      const projects = parseProjectsOutput(output);
      return {
        content: [
          { type: 'text', text: JSON.stringify(projects, null, 2) },
        ],
      };
    },
  );

  server.tool(
    'get_project_tasks',
    'List tasks within a specific project',
    {
      projectId: z.string().describe('OmniFocus project ID'),
      offset: z.number().int().min(0).default(0).describe('Skip first N tasks'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(20)
        .describe('Max tasks to return'),
    },
    async ({ projectId, offset, limit }) => {
      const output = await runAppleScript(
        buildGetProjectTasksScript(projectId, offset, limit),
      );
      const result = parseProjectTasksOutput(output);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.tool(
    'create_project',
    'Create a new project in OmniFocus',
    {
      name: z.string().describe('Project name'),
      note: z.string().optional().describe('Project note'),
      tags: z.array(z.string()).optional().describe('Tag names to assign'),
      reviewInterval: z
        .number()
        .optional()
        .describe('Review interval in seconds (604800 = 1 week)'),
      tasks: z
        .array(
          z.object({
            name: z.string().describe('Task name'),
            note: z.string().optional().describe('Task note'),
          }),
        )
        .optional()
        .describe('Initial tasks to create in the project'),
    },
    async ({ name, note, tags, reviewInterval, tasks }) => {
      const output = await runAppleScript(
        buildCreateProjectScript(name, { note, tags, reviewInterval, tasks }),
      );
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              projectId: output.trim(),
            }),
          },
        ],
      };
    },
  );

  server.tool(
    'update_project',
    'Change project properties: status, review interval, name, note',
    {
      projectId: z.string().describe('OmniFocus project ID'),
      status: z
        .enum(['active', 'on hold', 'done', 'dropped'])
        .optional()
        .describe('New project status'),
      reviewInterval: z
        .number()
        .optional()
        .describe('New review interval in seconds'),
      name: z.string().optional().describe('New project name'),
      note: z.string().optional().describe('New project note'),
    },
    async ({ projectId, status, reviewInterval, name, note }) => {
      const output = await runAppleScript(
        buildUpdateProjectScript(projectId, {
          status,
          reviewInterval,
          name,
          note,
        }),
      );
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              projectId: output.trim(),
            }),
          },
        ],
      };
    },
  );
}
```

- [ ] **Step 6: Run all tests and verify build**

```bash
npm test && npm run build
```

Expected: all tests PASS, build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/applescript/projects.ts src/applescript/__tests__/projects.test.ts src/tools/projects.ts
git commit -m "feat: add project management tools (get, create, update, get_project_tasks)"
```

---

### Task 7: Review & Reporting Tools

**Files:**
- Create: `src/applescript/review.ts`
- Create: `src/applescript/__tests__/review.test.ts`
- Create: `src/tools/review.ts`

- [ ] **Step 1: Write failing test for review templates and parsing**

Create `src/applescript/__tests__/review.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  buildGetProjectsDueForReviewScript,
  buildMarkProjectReviewedScript,
  buildGetStaleTasksScript,
  buildGetOverdueTasksScript,
  buildGetForecastScript,
  buildGetCompletedTasksScript,
  parseProjectsForReviewOutput,
  parseTaskListOutput,
} from '../review.js';

describe('buildGetProjectsDueForReviewScript', () => {
  it('queries projects past review date', () => {
    const script = buildGetProjectsDueForReviewScript(10);
    expect(script).toContain('next review date');
    expect(script).toContain('current date');
  });
});

describe('buildMarkProjectReviewedScript', () => {
  it('marks project as reviewed', () => {
    const script = buildMarkProjectReviewedScript('proj123');
    expect(script).toContain('proj123');
    expect(script).toContain('mark reviewed');
  });
});

describe('buildGetStaleTasksScript', () => {
  it('queries tasks not modified in N days', () => {
    const script = buildGetStaleTasksScript(30);
    expect(script).toContain('modification date');
  });
});

describe('buildGetOverdueTasksScript', () => {
  it('queries tasks past due date', () => {
    const script = buildGetOverdueTasksScript(20);
    expect(script).toContain('due date');
    expect(script).toContain('current date');
  });
});

describe('buildGetForecastScript', () => {
  it('queries tasks due in next N days', () => {
    const script = buildGetForecastScript(7);
    expect(script).toContain('due date');
  });
});

describe('buildGetCompletedTasksScript', () => {
  it('queries tasks completed since a date', () => {
    const script = buildGetCompletedTasksScript('2026-04-15');
    expect(script).toContain('2026-04-15');
    expect(script).toContain('completion date');
  });
});

describe('parseProjectsForReviewOutput', () => {
  it('parses project records', () => {
    const output =
      'proj1\tStale Project\tNotes\tactive\t3\t2026-04-01T00:00:00\t604800';
    const projects = parseProjectsForReviewOutput(output);
    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe('Stale Project');
  });

  it('returns empty array for empty output', () => {
    expect(parseProjectsForReviewOutput('')).toEqual([]);
  });
});

describe('parseTaskListOutput', () => {
  it('parses paginated task records', () => {
    const output = [
      'TOTAL:1',
      'id1\tOverdue task\t\t2026-01-01T00:00:00\t2026-01-01T00:00:00\t2026-04-01T00:00:00\t\ttrue\tfalse\t\tSome Project\tWork',
    ].join('\n');
    const result = parseTaskListOutput(output);
    expect(result.total).toBe(1);
    expect(result.items[0].name).toBe('Overdue task');
    expect(result.items[0].dueDate).toBe('2026-04-01T00:00:00');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- src/applescript/__tests__/review.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/applescript/review.ts`**

```typescript
import { escapeForAppleScript } from './executor.js';
import {
  splitRecords,
  splitFields,
  unescapeField,
  parsePaginatedOutput,
} from './parser.js';
import type { OFProject, OFTask, PaginatedResult } from '../types.js';

const ESCAPE_HANDLERS = `
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
  set h to hours of theDate
  set min to minutes of theDate
  set s to seconds of theDate
  set pad to "0"
  set mStr to text -2 thru -1 of (pad & m)
  set dStr to text -2 thru -1 of (pad & d)
  set hStr to text -2 thru -1 of (pad & h)
  set minStr to text -2 thru -1 of (pad & min)
  set sStr to text -2 thru -1 of (pad & s)
  return (y as text) & "-" & mStr & "-" & dStr & "T" & hStr & ":" & minStr & ":" & sStr
end formatDate

on getTagNames(t)
  set tagNames to ""
  repeat with tg in tags of t
    if tagNames is not "" then set tagNames to tagNames & ","
    set tagNames to tagNames & name of tg
  end repeat
  return tagNames
end getTagNames

on taskRecord(t)
  set taskId to id of t
  set taskName to my escapeField(name of t)
  set taskNote to my escapeField(note of t)
  set cDate to my formatDate(creation date of t)
  set mDate to my formatDate(modification date of t)
  set duDate to my formatDate(due date of t)
  set defDate to my formatDate(defer date of t)
  set isFlagged to flagged of t
  set isCompleted to completed of t
  set compDate to my formatDate(completion date of t)
  try
    set projName to my escapeField(name of containing project of t)
  on error
    set projName to ""
  end try
  set tagStr to my getTagNames(t)
  return taskId & tab & taskName & tab & taskNote & tab & cDate & tab & mDate & tab & duDate & tab & defDate & tab & isFlagged & tab & isCompleted & tab & compDate & tab & projName & tab & tagStr
end taskRecord`;

export function buildGetProjectsDueForReviewScript(limit: number): string {
  return `
tell application "OmniFocus"
  tell default document
    set output to ""
    set now to current date
    set allProjects to flattened projects whose status is active
    set count_ to 0
    repeat with p in allProjects
      if next review date of p is not missing value and next review date of p < now then
        set projId to id of p
        set projName to my escapeField(name of p)
        set projNote to my escapeField(note of p)
        set projStatus to status of p as text
        set tCount to count of flattened tasks of p whose completed is false
        set revDate to my formatDate(next review date of p)
        set revInterval to review interval of p
        set output to output & projId & tab & projName & tab & projNote & tab & projStatus & tab & tCount & tab & revDate & tab & revInterval & linefeed
        set count_ to count_ + 1
        if count_ >= ${limit} then exit repeat
      end if
    end repeat
    return output
  end tell
end tell
${APPLESCRIPT_HELPERS}`;
}

export function buildMarkProjectReviewedScript(projectId: string): string {
  const escaped = escapeForAppleScript(projectId);
  return `
tell application "OmniFocus"
  tell default document
    set proj to first flattened project whose id is "${escaped}"
    mark reviewed proj
    return id of proj
  end tell
end tell`;
}

export function buildGetStaleTasksScript(daysSinceModified: number): string {
  return `
tell application "OmniFocus"
  tell default document
    set output to ""
    set cutoffDate to (current date) - (${daysSinceModified} * days)
    set allTasks to flattened tasks whose completed is false
    set taskCount to 0
    set matchCount to 0
    repeat with t in allTasks
      if modification date of t < cutoffDate then
        set output to output & my taskRecord(t) & linefeed
        set matchCount to matchCount + 1
        if matchCount >= 50 then exit repeat
      end if
    end repeat
    set output to "TOTAL:" & matchCount & linefeed & output
    return output
  end tell
end tell
${APPLESCRIPT_HELPERS}`;
}

export function buildGetOverdueTasksScript(limit: number): string {
  return `
tell application "OmniFocus"
  tell default document
    set output to ""
    set now to current date
    set allTasks to flattened tasks whose completed is false
    set matchCount to 0
    repeat with t in allTasks
      if due date of t is not missing value and due date of t < now then
        set output to output & my taskRecord(t) & linefeed
        set matchCount to matchCount + 1
        if matchCount >= ${limit} then exit repeat
      end if
    end repeat
    set output to "TOTAL:" & matchCount & linefeed & output
    return output
  end tell
end tell
${APPLESCRIPT_HELPERS}`;
}

export function buildGetForecastScript(days: number): string {
  return `
tell application "OmniFocus"
  tell default document
    set output to ""
    set now to current date
    set futureDate to now + (${days} * days)
    set allTasks to flattened tasks whose completed is false
    set matchCount to 0
    repeat with t in allTasks
      if due date of t is not missing value and due date of t >= now and due date of t <= futureDate then
        set output to output & my taskRecord(t) & linefeed
        set matchCount to matchCount + 1
      end if
    end repeat
    set output to "TOTAL:" & matchCount & linefeed & output
    return output
  end tell
end tell
${APPLESCRIPT_HELPERS}`;
}

export function buildGetCompletedTasksScript(since: string): string {
  const escaped = escapeForAppleScript(since);
  return `
tell application "OmniFocus"
  tell default document
    set output to ""
    set sinceDate to date "${escaped}"
    set allTasks to flattened tasks whose completed is true
    set matchCount to 0
    repeat with t in allTasks
      if completion date of t >= sinceDate then
        set output to output & my taskRecord(t) & linefeed
        set matchCount to matchCount + 1
      end if
    end repeat
    set output to "TOTAL:" & matchCount & linefeed & output
    return output
  end tell
end tell
${APPLESCRIPT_HELPERS}`;
}

export function parseProjectsForReviewOutput(output: string): OFProject[] {
  const records = splitRecords(output);
  return records.map((line) => {
    const fields = splitFields(line);
    return {
      id: fields[0] ?? '',
      name: unescapeField(fields[1] ?? ''),
      note: unescapeField(fields[2] ?? ''),
      status: (fields[3] ?? 'active') as OFProject['status'],
      taskCount: parseInt(fields[4] ?? '0', 10),
      nextReviewDate: fields[5] || null,
      reviewInterval: parseInt(fields[6] ?? '0', 10),
    };
  });
}

function parseTaskFields(fields: string[]): OFTask {
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

export function parseTaskListOutput(output: string): PaginatedResult<OFTask> {
  const { total, lines } = parsePaginatedOutput(output);
  const items = lines.map((line) => parseTaskFields(splitFields(line)));
  return { total, items };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- src/applescript/__tests__/review.test.ts
```

Expected: all review tests PASS.

- [ ] **Step 5: Create `src/tools/review.ts`**

```typescript
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { runAppleScript } from '../applescript/executor.js';
import {
  buildGetProjectsDueForReviewScript,
  buildMarkProjectReviewedScript,
  buildGetStaleTasksScript,
  buildGetOverdueTasksScript,
  buildGetForecastScript,
  buildGetCompletedTasksScript,
  parseProjectsForReviewOutput,
  parseTaskListOutput,
} from '../applescript/review.js';

export function registerReviewTools(server: McpServer): void {
  server.tool(
    'get_projects_due_for_review',
    'List projects that are past their review date',
    {
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(20)
        .describe('Max projects to return'),
    },
    async ({ limit }) => {
      const output = await runAppleScript(
        buildGetProjectsDueForReviewScript(limit),
      );
      const projects = parseProjectsForReviewOutput(output);
      return {
        content: [
          { type: 'text', text: JSON.stringify(projects, null, 2) },
        ],
      };
    },
  );

  server.tool(
    'mark_project_reviewed',
    'Mark a project as reviewed (resets review timer)',
    {
      projectId: z.string().describe('OmniFocus project ID'),
    },
    async ({ projectId }) => {
      const output = await runAppleScript(
        buildMarkProjectReviewedScript(projectId),
      );
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              projectId: output.trim(),
            }),
          },
        ],
      };
    },
  );

  server.tool(
    'get_stale_tasks',
    'Find tasks not modified for a long time (potential cleanup candidates)',
    {
      daysSinceModified: z
        .number()
        .int()
        .min(1)
        .default(30)
        .describe('Tasks not modified in this many days'),
    },
    async ({ daysSinceModified }) => {
      const output = await runAppleScript(
        buildGetStaleTasksScript(daysSinceModified),
      );
      const result = parseTaskListOutput(output);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.tool(
    'get_overdue_tasks',
    'List tasks that are past their due date',
    {
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(20)
        .describe('Max tasks to return'),
    },
    async ({ limit }) => {
      const output = await runAppleScript(
        buildGetOverdueTasksScript(limit),
      );
      const result = parseTaskListOutput(output);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.tool(
    'get_forecast',
    'Show tasks due today and in the upcoming days',
    {
      days: z
        .number()
        .int()
        .min(1)
        .max(90)
        .default(7)
        .describe('Number of days to look ahead'),
    },
    async ({ days }) => {
      const output = await runAppleScript(buildGetForecastScript(days));
      const result = parseTaskListOutput(output);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.tool(
    'get_completed_tasks',
    'List tasks completed since a given date (for weekly review summaries)',
    {
      since: z
        .string()
        .describe('Date string (e.g., "April 15, 2026")'),
    },
    async ({ since }) => {
      const output = await runAppleScript(
        buildGetCompletedTasksScript(since),
      );
      const result = parseTaskListOutput(output);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
```

- [ ] **Step 6: Run all tests and verify build**

```bash
npm test && npm run build
```

Expected: all tests PASS, build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/applescript/review.ts src/applescript/__tests__/review.test.ts src/tools/review.ts
git commit -m "feat: add review & reporting tools (review, stale, overdue, forecast, completed)"
```

---

### Task 8: Server Entry Point

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Implement `src/index.ts`**

Replace the placeholder with:

```typescript
#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTagTools } from './tools/tags.js';
import { registerInboxTools } from './tools/inbox.js';
import { registerTaskTools } from './tools/tasks.js';
import { registerProjectTools } from './tools/projects.js';
import { registerReviewTools } from './tools/review.js';

const server = new McpServer({
  name: 'omnifocus-mcp',
  version: '0.1.0',
});

registerTagTools(server);
registerInboxTools(server);
registerTaskTools(server);
registerProjectTools(server);
registerReviewTools(server);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('Failed to start OmniFocus MCP server:', error);
  process.exit(1);
});
```

- [ ] **Step 2: Build and verify**

```bash
npm run build
```

Expected: compiles with no errors. `dist/index.js` exists.

- [ ] **Step 3: Run all tests**

```bash
npm test
```

Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: wire all tools into MCP server entry point"
```

---

### Task 9: README & Claude Code Configuration

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create `README.md`**

```markdown
# omnifocus-mcp

MCP server for OmniFocus — a GTD weekly review assistant powered by Claude.

## Prerequisites

- macOS with OmniFocus installed
- Node.js 20+

## Setup

```bash
npm install
npm run build
```

## Claude Code Configuration

Add to your Claude Code MCP settings (`~/.claude/settings.json` or project `.claude/settings.json`):

```json
{
  "mcpServers": {
    "omnifocus": {
      "command": "node",
      "args": ["/path/to/omnifocus-mcp/dist/index.js"]
    }
  }
}
```

Replace `/path/to/omnifocus-mcp` with the actual path.

## Available Tools

### Inbox Processing
- **get_inbox_tasks** — List inbox items (system inbox, private, or work)
- **process_inbox_task** — Move inbox task to project, assign tags, set dates
- **quick_entry** — Create a new task

### Task Management
- **complete_task** — Mark task as completed
- **delete_task** — Delete a task
- **update_task** — Modify task properties
- **create_subtasks** — Break a task into subtasks

### Project Management
- **get_projects** — List projects with status and review info
- **get_project_tasks** — List tasks within a project
- **create_project** — Create a new project
- **update_project** — Change project properties

### Review Support
- **get_projects_due_for_review** — Projects past review date
- **mark_project_reviewed** — Mark project as reviewed
- **get_stale_tasks** — Tasks not modified recently
- **get_overdue_tasks** — Tasks past due date

### Tags
- **get_tags** — List all tags
- **create_tag** — Create a new tag

### Reporting
- **get_forecast** — Tasks due in upcoming days
- **get_completed_tasks** — Tasks completed since a date

## Development

```bash
npm run dev       # Watch mode
npm test          # Run unit tests
npm run test:watch # Watch tests
```
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with setup and tool reference"
```

- [ ] **Step 3: Test manually with Claude Code**

1. Build the project: `npm run build`
2. Add the MCP server to Claude Code settings
3. Start a new Claude Code session
4. Try: "List my OmniFocus tags" — should call `get_tags`
5. Try: "Show me my inbox" — should call `get_inbox_tasks`
6. Try: "What projects are due for review?" — should call `get_projects_due_for_review`
