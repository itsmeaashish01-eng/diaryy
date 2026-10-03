// Prints an AUTH_PASSWORD_HASH value for .env. The password is read from the
// terminal (not from arguments, which end up in shell history).
import { randomBytes, scryptSync } from "node:crypto";
import { createInterface } from "node:readline";

const N = 2 ** 15, r = 8, p = 1;

function ask(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(question)) rl.output.write(s); };
    rl.question(question, (answer) => { rl.close(); process.stdout.write("\n"); resolve(answer); });
  });
}

const password = process.env.BRAIN_PASSWORD ?? (await ask("New password: "));
if (!password || password.length < 8) {
  console.error("Use at least 8 characters.");
  process.exit(1);
}
const salt = randomBytes(16);
const hash = scryptSync(password, salt, 32, { N, r, p, maxmem: 256 * 1024 * 1024 });
console.log(`\nAUTH_PASSWORD_HASH="scrypt:${N}:${r}:${p}:${salt.toString("base64")}:${hash.toString("base64")}"`);
console.log(`AUTH_SECRET="${randomBytes(32).toString("hex")}"`);
console.log("\nPut both lines in .env and restart the app.");
