import { createItem, listItems } from "@/server/items";
import { readJson, route, searchParams } from "@/server/http";
import { createItemSchema, listQuerySchema } from "@/lib/validation";

export const GET = route(async (req) => listItems(listQuerySchema.parse(searchParams(req))));

export const POST = route(async (req) => createItem(await readJson(req, createItemSchema)));
