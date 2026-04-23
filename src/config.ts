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
