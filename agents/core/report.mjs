/* ================================================
   AGENTS — core/report.mjs
   The run page, for when you want to know whether it's working.

   A log is fine when something breaks and useless for "did anything
   happen overnight?". This writes the same run as a table.
   ================================================ */

import { appendFileSync } from "node:fs";

const ICON = { ok: "✓", quiet: "·", notable: "🔔", urgent: "🚨", failed: "✕", skipped: "–" };

export function writeSummary(path, rows, totals, warnings) {
  const lines = [
    `## Agents — ${new Date().toUTCString()}`,
    "",
    `Ran **${totals.ran}**, skipped ${totals.skipped}, failed ${totals.failed}, ` +
      `notified **${totals.notified}**.`,
    "",
  ];

  for (const w of warnings || []) {
    lines.push("> [!WARNING]", `> ${w}`, "");
  }

  if (rows.length) {
    lines.push("| | Agent | Type | What it found |", "|---|---|---|---|");
    for (const r of rows) {
      const cell = String(r.line || "").replace(/\|/g, "\\|").replace(/\n/g, " ");
      lines.push(`| ${ICON[r.status] || "·"} | ${r.label} | ${r.type} | ${cell} |`);
    }
  } else {
    lines.push("_Nothing was due this run._");
  }

  try {
    appendFileSync(path, lines.join("\n") + "\n");
  } catch (e) {
    console.log(`could not write summary: ${e.message}`);
  }
}
