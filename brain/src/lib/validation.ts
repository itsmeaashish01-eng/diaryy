// Request validation. Every API input passes through one of these schemas;
// nothing reaches the database without being checked and normalised here.

import { z } from "zod";
import { isIsoDate } from "./dates";
import { ITEM_TYPES, PRIORITIES, RECURRENCES, TASK_STATUSES } from "./types";
import { normalizeUrl, type UrlKind } from "./url";

export const idSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "Invalid id");

const urlSchema = (kind: UrlKind, message: string) =>
  z
    .string()
    .max(4096)
    .nullable()
    .transform((value, ctx) => {
      if (value === null || value.trim() === "") return null;
      const url = normalizeUrl(value, kind);
      if (!url) {
        ctx.addIssue({ code: "custom", message });
        return z.NEVER;
      }
      return url;
    });

const webUrl = urlSchema("web", "Enter a valid web address (http or https).");
const credentialUrl = urlSchema(
  "any",
  "Use a web link or a password-manager link (for example onepassword:// or bitwarden://).",
);

const dueDate = z
  .string()
  .nullable()
  .refine((v) => v === null || v === "" || isIsoDate(v), "Use a date like 2026-10-03.")
  .transform((v) => (v ? v : null));

const dueTime = z
  .string()
  .nullable()
  .refine((v) => v === null || v === "" || /^([01]\d|2[0-3]):[0-5]\d$/.test(v), "Use a time like 09:30.")
  .transform((v) => (v ? v : null));

const remindAt = z
  .string()
  .nullable()
  .refine((v) => v === null || v === "" || !Number.isNaN(Date.parse(v)), "Invalid reminder time.")
  .transform((v) => (v ? new Date(v).toISOString() : null));

const itemFields = {
  title: z.string().trim().max(500),
  folderId: idSchema.nullable(),
  tags: z.array(z.string().max(64)).max(50),
  pinned: z.boolean(),
  favorite: z.boolean(),
  inbox: z.boolean(),
  // Task
  description: z.string().max(200_000),
  status: z.enum(TASK_STATUSES),
  priority: z.enum(PRIORITIES),
  dueDate,
  dueTime,
  recurrence: z.enum(RECURRENCES),
  parentId: idSchema.nullable(),
  // Task (related URL) and Bookmark/Link (the URL)
  url: webUrl,
  // Note: TipTap JSON (as text) or plain text to start from
  content: z.string().max(5_000_000),
  text: z.string().max(200_000),
  // Bookmark / Link
  notes: z.string().max(200_000),
  credentialUrl,
  faviconUrl: z.string().max(200_000).nullable(),
  siteTitle: z.string().max(500).nullable(),
  // Any item
  remindAt,
};

export const createItemSchema = z.object(itemFields).partial().extend({ type: z.enum(ITEM_TYPES) });

export const updateItemSchema = z
  .object({ ...itemFields, archived: z.boolean(), type: z.enum(ITEM_TYPES) })
  .partial();

export type CreateItemInput = z.infer<typeof createItemSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;

export const completeSchema = z.object({ done: z.boolean(), today: dueDate.optional() });

export const relationSchema = z.object({ targetId: idSchema });

export const folderCreateSchema = z.object({
  name: z.string().trim().min(1, "Name the folder.").max(120),
  parentId: idSchema.nullable().optional(),
});

export const folderUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    parentId: idSchema.nullable(),
    pinned: z.boolean(),
    favorite: z.boolean(),
  })
  .partial();

export const folderMoveSchema = z.object({ direction: z.enum(["up", "down"]) });

export const tagRenameSchema = z.object({ name: z.string().trim().min(1).max(64) });

export const captureSchema = z.object({
  text: z.string().trim().min(1, "Nothing to capture.").max(200_000),
  mode: z.enum(["AUTO", ...ITEM_TYPES]).default("AUTO"),
});

export const listQuerySchema = z.object({
  type: z.enum(ITEM_TYPES).optional(),
  view: z.enum(["all", "today", "upcoming", "overdue", "completed", "open"]).optional(),
  folderId: idSchema.optional(),
  tag: z.string().max(64).optional(),
  favorite: z.enum(["true"]).optional(),
  pinned: z.enum(["true"]).optional(),
  inbox: z.enum(["true"]).optional(),
  archived: z.enum(["true"]).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  sort: z.enum(["updated", "created", "title", "due", "priority"]).optional(),
  today: dueDate.optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
});

export type ListQuery = z.infer<typeof listQuerySchema>;
