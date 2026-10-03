import { z } from "zod";
import { exportCsv, exportJson, exportMarkdownZip } from "@/server/backup";
import { route, searchParams } from "@/server/http";

const schema = z.object({
  format: z.enum(["json", "markdown", "csv"]).default("json"),
  type: z.enum(["tasks", "bookmarks", "links", "notes"]).default("tasks"),
});

function download(body: BodyInit, type: string, name: string): Response {
  return new Response(body, {
    headers: {
      "content-type": type,
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "no-store",
    },
  });
}

export const GET = route(async (req) => {
  const { format, type } = schema.parse(searchParams(req));
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === "markdown") {
    const zip = await exportMarkdownZip();
    return download(new Blob([zip.slice().buffer]), "application/zip", `brain-markdown-${stamp}.zip`);
  }
  if (format === "csv") return download(await exportCsv(type), "text/csv; charset=utf-8", `brain-${type}-${stamp}.csv`);
  return download(JSON.stringify(await exportJson(), null, 2), "application/json", `brain-backup-${stamp}.json`);
});
