#!/usr/bin/env node
/* ================================================
   INKWELL iOS — patch-ios.mjs
   The Info.plist entries Capacitor doesn't write.

   Every one of these is a permission string iOS shows verbatim in its
   own dialog. Without the matching key the app is killed the moment it
   asks — not an error, a crash — and App Review rejects it under 5.1.1
   besides. They have to say what the app does with the thing and why,
   in plain language. "This app needs photos" is a rejection.

   Safe to run repeatedly: it only adds what's missing.
   ================================================ */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLIST = join(HERE, "..", "ios", "App", "App", "Info.plist");

const KEYS = {
  NSCameraUsageDescription:
    "Inkwell uses the camera when you take a photo to put on a page — a whiteboard, " +
    "a page of a book, a diagram. Photos go straight into the notebook on this device " +
    "and are not uploaded anywhere.",

  NSMicrophoneUsageDescription:
    "Inkwell records sound only as part of a video you add to a page. Nothing is " +
    "recorded unless you are recording a video, and nothing leaves this device.",

  NSPhotoLibraryUsageDescription:
    "Inkwell reads a photo or video from your library when you choose one to put on a " +
    "page. It only sees what you pick, and the copy it keeps stays on this device.",

  NSPhotoLibraryAddUsageDescription:
    "Inkwell saves a page to your photo library when you export it as an image.",

  // Declared once so App Store Connect stops asking at every upload. The
  // app uses no encryption of its own; HTTPS through the system is exempt.
  ITSAppUsesNonExemptEncryption: false,

  // Files created by an export show up in the Files app, where they can
  // be moved out. Without these the backup is written and then invisible.
  UIFileSharingEnabled: true,
  LSSupportsOpeningDocumentsInPlace: true,
};

if (!existsSync(PLIST)) {
  console.log("No ios/ project yet — run `npx cap add ios` on a Mac first. Nothing to patch.");
  process.exit(0);
}

let plist = readFileSync(PLIST, "utf8");
const added = [];

for (const [key, value] of Object.entries(KEYS)) {
  if (plist.includes(`<key>${key}</key>`)) continue;
  const entry = typeof value === "boolean"
    ? `\t<key>${key}</key>\n\t<${value}/>`
    : `\t<key>${key}</key>\n\t<string>${value}</string>`;
  plist = plist.replace(/(<dict>\n)/, `$1${entry}\n`);
  added.push(key);
}

if (!added.length) {
  console.log("Info.plist already has everything it needs.");
} else {
  writeFileSync(PLIST, plist);
  console.log("Info.plist — added: " + added.join(", "));
}
