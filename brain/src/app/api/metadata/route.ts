import { z } from "zod";
import { BadRequestError } from "@/server/errors";
import { route, searchParams } from "@/server/http";
import { fetchMetadata } from "@/server/metadata";

const schema = z.object({ url: z.string().min(1).max(4096) });

export const GET = route(async (req) => {
  const { url } = schema.parse(searchParams(req));
  try {
    return await fetchMetadata(url);
  } catch {
    throw new BadRequestError("That does not look like a web address.");
  }
});
