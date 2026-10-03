import { deleteTag, renameTag } from "@/server/tags";
import { readJson, route, type IdContext } from "@/server/http";
import { idSchema, tagRenameSchema } from "@/lib/validation";

export const PATCH = route(async (req, { params }: IdContext) => {
  const { name } = await readJson(req, tagRenameSchema);
  await renameTag(idSchema.parse((await params).id), name);
  return { ok: true };
});

export const DELETE = route(async (_req, { params }: IdContext) => {
  await deleteTag(idSchema.parse((await params).id));
  return { ok: true };
});
