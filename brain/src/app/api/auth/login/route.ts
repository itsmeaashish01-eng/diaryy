import { NextResponse } from "next/server";
import { z } from "zod";
import { readJson, route } from "@/server/http";
import { verifyPassword } from "@/server/password";
import { authEnabled, createSessionToken, SESSION_COOKIE, SESSION_DAYS } from "@/lib/session";

const schema = z.object({ password: z.string().min(1).max(1000) });

// Slows down guessing: failures are counted per client and each one waits.
const failures = new Map<string, { count: number; until: number }>();

export const POST = route(async (req) => {
  if (!authEnabled()) return NextResponse.json({ ok: true });
  const client = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const state = failures.get(client);
  if (state && state.until > Date.now()) {
    return NextResponse.json({ error: "Too many attempts. Wait a minute and try again." }, { status: 429 });
  }
  const { password } = await readJson(req, schema);
  if (!(await verifyPassword(password, process.env.AUTH_PASSWORD_HASH!))) {
    const count = (state?.count ?? 0) + 1;
    failures.set(client, { count, until: count >= 5 ? Date.now() + 60_000 : 0 });
    await new Promise((r) => setTimeout(r, 400));
    return NextResponse.json({ error: "Wrong password." }, { status: 401 });
  }
  failures.delete(client);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(process.env.AUTH_SECRET!), {
    httpOnly: true,
    sameSite: "lax",
    secure: new URL(req.url).protocol === "https:",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
  return res;
});
