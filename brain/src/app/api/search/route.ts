import { z } from "zod";
import { route, searchParams } from "@/server/http";
import { search } from "@/server/search";
import { ITEM_TYPES } from "@/lib/types";

const schema = z.object({
  q: z.string().max(500).default(""),
  type: z.enum([...ITEM_TYPES, "FOLDER", "TAG"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  archived: z.enum(["true"]).optional(),
});

export const GET = route(async (req) => {
  const { q, type, limit, archived } = schema.parse(searchParams(req));
  return search(q, { type, limit, includeArchived: archived === "true" });
});
