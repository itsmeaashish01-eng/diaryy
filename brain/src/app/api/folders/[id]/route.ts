import { deleteFolder, updateFolder } from "@/server/folders";
import { readJson, route, type IdContext } from "@/server/http";
import { folderUpdateSchema, idSchema } from "@/lib/validation";

export const PATCH = route(async (req, { params }: IdContext) => {
  await updateFolder(idSchema.parse((await params).id), await readJson(req, folderUpdateSchema));
  return { ok: true };
});

export const DELETE = route(async (_req, { params }: IdContext) => {
  await deleteFolder(idSchema.parse((await params).id));
  return { ok: true };
});
