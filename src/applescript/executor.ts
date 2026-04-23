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
