// Allowed values for the string columns in the schema. The database stores
// plain strings (portable across SQLite and PostgreSQL); these lists are the
// single source of truth for what those strings may be.

export const ITEM_TYPES = ["TASK", "NOTE", "BOOKMARK", "LINK"] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export const TASK_STATUSES = ["INBOX", "TODO", "IN_PROGRESS", "WAITING", "DONE"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const RECURRENCES = ["NONE", "DAILY", "WEEKDAYS", "WEEKLY", "MONTHLY", "YEARLY"] as const;
export type Recurrence = (typeof RECURRENCES)[number];

export const TYPE_LABEL: Record<ItemType, string> = {
  TASK: "Task",
  NOTE: "Note",
  BOOKMARK: "Bookmark",
  LINK: "Link",
};

export const STATUS_LABEL: Record<TaskStatus, string> = {
  INBOX: "Inbox",
  TODO: "To Do",
  IN_PROGRESS: "In Progress",
  WAITING: "Waiting",
  DONE: "Done",
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  LOW: "Low",
  NORMAL: "Normal",
  HIGH: "High",
  URGENT: "Urgent",
};

export const PRIORITY_RANK: Record<Priority, number> = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };

export const RECURRENCE_LABEL: Record<Recurrence, string> = {
  NONE: "Does not repeat",
  DAILY: "Every day",
  WEEKDAYS: "Every weekday",
  WEEKLY: "Every week",
  MONTHLY: "Every month",
  YEARLY: "Every year",
};

// ---- Shapes the API returns ----------------------------------------------

export interface TagDTO {
  id: string;
  name: string;
}

export interface FolderRef {
  id: string;
  name: string;
  /** "Professional / Licensing" */
  path: string;
}

export interface TaskDTO {
  description: string;
  status: TaskStatus;
  priority: Priority;
  dueDate: string | null;
  dueTime: string | null;
  url: string | null;
  recurrence: Recurrence;
  parentId: string | null;
  completedAt: string | null;
  lastCompletedAt: string | null;
  subtaskCount: number;
  subtaskDoneCount: number;
}

export interface NoteDTO {
  content: string;
  contentText: string;
}

export interface BookmarkDTO {
  url: string;
  domain: string;
  faviconUrl: string | null;
  siteTitle: string | null;
  description: string;
  notes: string;
  credentialUrl: string | null;
}

export interface ReminderDTO {
  id: string;
  remindAt: string;
  firedAt: string | null;
}

/** An item as it appears in lists. */
export interface ItemSummary {
  id: string;
  type: ItemType;
  title: string;
  pinned: boolean;
  favorite: boolean;
  inbox: boolean;
  folder: FolderRef | null;
  tags: TagDTO[];
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  task: TaskDTO | null;
  bookmark: BookmarkDTO | null;
  /** Short plain-text preview (note text, task description, bookmark description). */
  preview: string;
}

export interface RelatedItem {
  id: string;
  type: ItemType;
  title: string;
  /** How the relation was made, from this item's point of view. */
  origin: "MANUAL" | "WIKILINK";
  direction: "outgoing" | "incoming";
  done: boolean;
}

/** An item with everything the detail page needs. */
export interface ItemDetail extends ItemSummary {
  note: NoteDTO | null;
  subtasks: ItemSummary[];
  parent: { id: string; title: string } | null;
  related: RelatedItem[];
  reminders: ReminderDTO[];
}

export interface FolderDTO {
  id: string;
  name: string;
  parentId: string | null;
  position: number;
  pinned: boolean;
  favorite: boolean;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TagWithCount extends TagDTO {
  count: number;
}

export type SearchHitKind = ItemType | "FOLDER" | "TAG";

export interface SearchHit {
  kind: SearchHitKind;
  id: string;
  title: string;
  subtitle: string;
  href: string;
  score: number;
  done?: boolean;
}

export interface DashboardData {
  overdue: ItemSummary[];
  today: ItemSummary[];
  upcoming: ItemSummary[];
  recentNotes: ItemSummary[];
  recentBookmarks: ItemSummary[];
  pinnedItems: ItemSummary[];
  pinnedFolders: FolderDTO[];
  inboxCount: number;
  reminders: { id: string; remindAt: string; item: { id: string; title: string; type: ItemType } }[];
}

export interface Counts {
  inbox: number;
  today: number;
  overdue: number;
}
