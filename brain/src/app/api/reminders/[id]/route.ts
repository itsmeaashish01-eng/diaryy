import { dismissReminder } from "@/server/dashboard";
import { route, type IdContext } from "@/server/http";
import { idSchema } from "@/lib/validation";

/** Marks a reminder as shown. */
export const POST = route(async (_req, { params }: IdContext) => {
  await dismissReminder(idSchema.parse((await params).id));
  return { ok: true };
});
