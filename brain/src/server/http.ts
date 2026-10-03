import "server-only";
import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { BadRequestError, NotFoundError } from "./errors";

type Handler<C> = (req: Request, ctx: C) => Promise<Response | unknown>;

/**
 * Wraps a route handler: JSON-encodes plain return values and turns known
 * errors into 4xx responses, so handlers can just throw.
 */
export function route<C>(handler: Handler<C>) {
  return async (req: Request, ctx: C): Promise<Response> => {
    try {
      const result = await handler(req, ctx);
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true });
    } catch (error) {
      if (error instanceof ZodError) {
        const issue = error.issues[0];
        const field = issue?.path.join(".");
        return NextResponse.json(
          { error: issue ? `${field ? `${field}: ` : ""}${issue.message}` : "Invalid input." },
          { status: 400 },
        );
      }
      if (error instanceof NotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
      if (error instanceof BadRequestError) return NextResponse.json({ error: error.message }, { status: 400 });
      console.error(error);
      return NextResponse.json({ error: "Something went wrong. Your data was not changed." }, { status: 500 });
    }
  };
}

export async function readJson<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new BadRequestError("Request body must be JSON.");
  }
  return schema.parse(body);
}

export function searchParams(req: Request): Record<string, string> {
  return Object.fromEntries(new URL(req.url).searchParams.entries());
}

export type IdContext = { params: Promise<{ id: string }> };
