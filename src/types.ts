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
