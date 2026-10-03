import { z } from "zod";
import { counts } from "@/server/dashboard";
import { route, searchParams } from "@/server/http";
import { isIsoDate } from "@/lib/dates";

const schema = z.object({ today: z.string().refine(isIsoDate).optional() });

export const GET = route(async (req) => counts(schema.parse(searchParams(req)).today));
