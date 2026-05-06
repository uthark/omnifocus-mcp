export interface OFTask {
  id: string;
  name: string;
  note: string;
  creationDate: string;
  modificationDate: string;
  dueDate: string | null;
  deferDate: string | null;
  plannedDate: string | null;
  flagged: boolean;
  completed: boolean;
  completionDate: string | null;
  projectName: string | null;
  tags: string[];
  recurrence: string | null;
  repetitionSchedule: 'regularly' | 'from-completion' | null;
  repetitionBasedOn: 'due' | 'planned' | 'defer' | null;
  catchUpAutomatically: boolean | null;
  estimatedMinutes: number | null;
}

export interface OFProject {
  id: string;
  name: string;
  note: string;
  status: 'active' | 'on hold' | 'done' | 'dropped';
  taskCount: number;
  nextReviewDate: string | null;
  reviewIntervalSteps: number | null;
  reviewIntervalUnit: 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year' | null;
  reviewIntervalFixed: boolean | null;
  estimatedMinutes: number | null;
}

export interface OFTag {
  id: string;
  name: string;
}

export interface StaleTask {
  id: string;
  name: string;
  modificationDate: string | null;
}

export interface OFFolder {
  id: string;
  name: string;
  parentId: string | null;
  path: string;
  projectCount: number;
}

export interface PaginatedResult<T> {
  total: number;
  items: T[];
}
