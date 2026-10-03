import { setTaskDone } from "@/server/items";
import { readJson, route, type IdContext } from "@/server/http";
import { completeSchema, idSchema } from "@/lib/validation";

export const POST = route(async (req, { params }: IdContext) => {
  const { done, today } = await readJson(req, completeSchema);
  return setTaskDone(idSchema.parse((await params).id), done, today ?? undefined);
});
