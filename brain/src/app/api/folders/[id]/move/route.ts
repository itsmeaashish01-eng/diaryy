import { moveFolder } from "@/server/folders";
import { readJson, route, type IdContext } from "@/server/http";
import { folderMoveSchema, idSchema } from "@/lib/validation";

export const POST = route(async (req, { params }: IdContext) => {
  const { direction } = await readJson(req, folderMoveSchema);
  await moveFolder(idSchema.parse((await params).id), direction);
  return { ok: true };
});
