import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { verifyPassword } from "@/server/password";

describe("password hashing", () => {
  it("verifies hashes made by `npm run hash-password`", async () => {
    const out = execFileSync("node", [path.resolve(import.meta.dirname, "../scripts/hash-password.mjs")], {
      env: { ...process.env, BRAIN_PASSWORD: "correct horse 1" },
      encoding: "utf8",
    });
    const hash = /AUTH_PASSWORD_HASH="([^"]+)"/.exec(out)?.[1];
    expect(hash).toMatch(/^scrypt:\d+:\d+:\d+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
    // No "$": .env loaders would expand it as a variable.
    expect(hash).not.toContain("$");
    expect(await verifyPassword("correct horse 1", hash!)).toBe(true);
    expect(await verifyPassword("wrong", hash!)).toBe(false);
    expect(await verifyPassword("x", "garbage")).toBe(false);
  });
});
