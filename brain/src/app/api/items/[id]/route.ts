import { deleteItem, getItem, updateItem } from "@/server/items";
import { readJson, route, type IdContext } from "@/server/http";
import { idSchema, updateItemSchema } from "@/lib/validation";

export const GET = route(async (_req, { params }: IdContext) => getItem(idSchema.parse((await params).id)));

export const PATCH = route(async (req, { params }: IdContext) =>
  updateItem(idSchema.parse((await params).id), await readJson(req, updateItemSchema)),
);

export const DELETE = route(async (_req, { params }: IdContext) => {
  await deleteItem(idSchema.parse((await params).id));
  return { ok: true };
});
