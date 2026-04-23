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
