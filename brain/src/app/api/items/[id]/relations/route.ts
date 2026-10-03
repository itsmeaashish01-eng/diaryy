import { addRelation } from "@/server/items";
import { readJson, route, type IdContext } from "@/server/http";
import { idSchema, relationSchema } from "@/lib/validation";

export const POST = route(async (req, { params }: IdContext) => {
  const { targetId } = await readJson(req, relationSchema);
  await addRelation(idSchema.parse((await params).id), targetId);
  return { ok: true };
});
