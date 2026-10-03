import { createFolder, listFolders } from "@/server/folders";
import { readJson, route } from "@/server/http";
import { folderCreateSchema } from "@/lib/validation";

export const GET = route(async () => listFolders());

export const POST = route(async (req) => {
  const { name, parentId } = await readJson(req, folderCreateSchema);
  return createFolder(name, parentId ?? null);
});
