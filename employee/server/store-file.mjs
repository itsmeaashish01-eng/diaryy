/* ================================================
   THE AI EMPLOYEE — server/store-file.mjs
   The business, on disk.

   The browser keeps its own copy in localStorage. This is the one the
   server reads, so Slack and a second device can see the same record.
   It is a single JSON file, written atomically (temp file, then rename)
   so a crash mid-write leaves the old version rather than half of the
   new one.

   Concurrency is optimistic and deliberately dumb: every write bumps a
   version, and a client that writes against a version that has moved is
   refused rather than silently overwriting. A one-person business does
   not need merge resolution; it needs to be told when two devices
   disagree.
   ================================================ */

import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_FILE = join(HERE, "data", "business.json");

export class BusinessStore {
  constructor(file, AE) {
    this.file = file || DEFAULT_FILE;
    this.AE = AE;
  }

  /* Returns { version, updatedAt, data }. A missing file is not an
     error — it is a business nobody has saved yet. */
  read() {
    if (!existsSync(this.file)) {
      return { version: 0, updatedAt: null, data: this.AE.store.defaults() };
    }
    let raw;
    try {
      raw = JSON.parse(readFileSync(this.file, "utf8"));
    } catch (err) {
      /* A corrupt file is worth keeping a copy of rather than clobbering
         on the next write — it is somebody's whole business. */
      const wreck = this.file + ".corrupt";
      try { writeFileSync(wreck, readFileSync(this.file)); } catch (e) { /* best effort */ }
      const err2 = new Error(`business.json is unreadable (${err.message}); a copy is at ${wreck}`);
      err2.code = "CORRUPT";
      throw err2;
    }
    return {
      version: Number(raw.version) || 0,
      updatedAt: raw.updatedAt || null,
      data: this.AE.store.hydrate(raw.data),
    };
  }

  /* Writes and returns the new envelope. `expectedVersion` of null skips
     the check; anything else must match what's on disk. */
  write(data, expectedVersion, now) {
    /* Checked here as well as at the route, because this is the last
       point before a real business is replaced on disk. */
    const problem = this.AE.store.validate(data);
    if (problem) {
      const err = new Error(problem);
      err.code = "INVALID";
      throw err;
    }
    const current = existsSync(this.file) ? this.read() : { version: 0 };
    if (expectedVersion != null && Number(expectedVersion) !== current.version) {
      const err = new Error(
        `version ${expectedVersion} is stale — the server is on ${current.version}`
      );
      err.code = "CONFLICT";
      err.current = current;
      throw err;
    }
    const envelope = {
      version: current.version + 1,
      updatedAt: (now || new Date()).toISOString(),
      data: this.AE.store.hydrate(data),
    };
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(envelope, null, 2));
    renameSync(tmp, this.file);   // atomic on the same filesystem
    return envelope;
  }

  /* For tests and a clean start. */
  clear() {
    if (existsSync(this.file)) unlinkSync(this.file);
  }
}
