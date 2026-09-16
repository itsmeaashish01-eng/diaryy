#!/usr/bin/env node
/* ================================================
   ROAMGUIDE iOS — patch-ios.mjs
   The Info.plist entries Capacitor doesn't write for us.

   Without NSLocationWhenInUseUsageDescription, iOS kills the app the
   moment it asks for a position, and App Review rejects it besides. The
   string is shown verbatim in the permission dialog, so it has to say
   what the app does with the location — not "this app needs location".

   Safe to run repeatedly: it only adds what's missing.
   ================================================ */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLIST = join(HERE, "..", "ios", "App", "App", "Info.plist");

const KEYS = {
  NSLocationWhenInUseUsageDescription:
    "RoamGuide uses your location to show what's around you — nearby landmarks, " +
    "how far each one is and which way. Your position stays on this device.",
  ITSAppUsesNonExemptEncryption: false,
};

if (!existsSync(PLIST)) {
  console.log("No ios/ project yet — run `npx cap add ios` on a Mac first. Nothing to patch.");
  process.exit(0);
}

let plist = readFileSync(PLIST, "utf8");
let added = [];

for (const [key, value] of Object.entries(KEYS)) {
  if (plist.includes(`<key>${key}</key>`)) continue;
  const entry = typeof value === "boolean"
    ? `\t<key>${key}</key>\n\t<${value}/>`
    : `\t<key>${key}</key>\n\t<string>${value}</string>`;
  // Insert just inside the top-level <dict>.
  plist = plist.replace(/(<dict>\n)/, `$1${entry}\n`);
  added.push(key);
}

if (!added.length) {
  console.log("Info.plist already has everything it needs.");
} else {
  writeFileSync(PLIST, plist);
  console.log("Info.plist — added: " + added.join(", "));
}
