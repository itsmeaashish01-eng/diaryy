import { removeRelation } from "@/server/items";
import { route } from "@/server/http";
import { idSchema } from "@/lib/validation";

export const DELETE = route(async (_req, { params }: { params: Promise<{ id: string; targetId: string }> }) => {
  const { id, targetId } = await params;
  await removeRelation(idSchema.parse(id), idSchema.parse(targetId));
  return { ok: true };
});
