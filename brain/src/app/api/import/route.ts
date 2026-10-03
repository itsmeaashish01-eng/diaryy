import { z } from "zod";
import { importJson } from "@/server/backup";
import { readJson, route } from "@/server/http";

const schema = z.object({ mode: z.enum(["merge", "replace"]), data: z.unknown() });

export const POST = route(async (req) => {
  const { mode, data } = await readJson(req, schema);
  return importJson(data, mode);
});
