import { captureItem } from "@/server/items";
import { readJson, route } from "@/server/http";
import { captureSchema } from "@/lib/validation";

export const POST = route(async (req) => {
  const { text, mode } = await readJson(req, captureSchema);
  return captureItem(text, mode);
});
