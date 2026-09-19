/* ================================================
   INKWELL — pdfout.js
   Writing a PDF, by hand, in about a hundred and fifty lines.

   Exporting notes as PDF is the one thing people ask of a note app that
   it cannot do without either a library or this file. The library that
   would do it is around 400 KB, has to be fetched, and — because Apple
   takes a dim view of apps that download code at runtime — would have
   to be vendored into the iOS build too.

   What we actually need is narrow enough to write out: one JPEG per
   page, at the page's own size, no fonts, no vectors. PDF is a text
   format with a byte-offset table at the end, so the whole job is
   emitting objects in order and remembering where each one started.

   The consequence, stated plainly: an exported PDF is a picture of each
   page. Handwriting was never text to begin with, but typed text boxes
   are flattened too, so the result is not searchable or selectable. An
   annotated PDF exported this way keeps its appearance and loses the
   original's text layer. The .json backup is the lossless format — it
   is the one to keep if you want the notes back as notes.
   ================================================ */

const enc = new TextEncoder();

/* pages: [{ jpeg: Uint8Array, width, height }] — width and height in
   PDF points (72 per inch), which is what decides the printed size. */
export function buildPDF(pages, { title = "Inkwell notes" } = {}) {
  if (!pages.length) throw new Error("a PDF needs at least one page");

  const chunks = [];
  let length = 0;
  const push = (data) => {
    const bytes = typeof data === "string" ? enc.encode(data) : data;
    chunks.push(bytes);
    length += bytes.length;
  };

  // Object 0 is always the free-list head; real objects start at 1.
  const offsets = [0];
  const obj = (body) => {
    const n = offsets.length;
    offsets.push(length);
    push(`${n} 0 obj\n`);
    if (typeof body === "string") push(body);
    else body(push);
    push("\nendobj\n");
    return n;
  };

  push("%PDF-1.4\n");
  // A comment of high bytes: it tells anything that transfers the file
  // that this is binary and must not be newline-translated.
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  const catalogNo = 1, pagesNo = 2;
  offsets.push(0, 0);          // placeholders; both are written last

  const pageNos = [];
  for (const p of pages) {
    const imgNo = obj((w) => {
      w(`<< /Type /XObject /Subtype /Image /Width ${p.pixelWidth} /Height ${p.pixelHeight} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`);
      w(p.jpeg);
      w("\nendstream");
    });

    // The content stream: scale the unit square up to the page box and
    // paint the image into it.
    const content = `q\n${fmt(p.width)} 0 0 ${fmt(p.height)} 0 0 cm\n/Im0 Do\nQ\n`;
    const contentNo = obj(`<< /Length ${enc.encode(content).length} >>\nstream\n${content}endstream`);

    pageNos.push(obj(
      `<< /Type /Page /Parent ${pagesNo} 0 R /MediaBox [0 0 ${fmt(p.width)} ${fmt(p.height)}] ` +
      `/Resources << /XObject << /Im0 ${imgNo} 0 R >> /ProcSet [/PDF /ImageC] >> ` +
      `/Contents ${contentNo} 0 R >>`
    ));
  }

  const infoNo = obj(
    `<< /Title (${pdfString(title)}) /Producer (Inkwell) /CreationDate (${pdfDate(new Date())}) >>`
  );

  // The two objects whose numbers were reserved at the top.
  offsets[pagesNo] = length;
  push(`${pagesNo} 0 obj\n<< /Type /Pages /Kids [${pageNos.map((n) => `${n} 0 R`).join(" ")}] /Count ${pageNos.length} >>\nendobj\n`);

  offsets[catalogNo] = length;
  push(`${catalogNo} 0 obj\n<< /Type /Catalog /Pages ${pagesNo} 0 R >>\nendobj\n`);

  const xrefAt = length;
  const count = offsets.length;
  let xref = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let i = 1; i < count; i++) xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  push(xref);
  push(`trailer\n<< /Size ${count} /Root ${catalogNo} 0 R /Info ${infoNo} 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

const fmt = (n) => (Math.round(n * 100) / 100).toString();

/* Literal strings are parenthesised, so anything that would close the
   string early has to be escaped. A notebook called "Notes (2024)" is
   not an exotic case. */
function pdfString(s) {
  return String(s).replace(/[\\()]/g, (c) => `\\${c}`).replace(/[\r\n]/g, " ");
}

function pdfDate(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `D:${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
         `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/* A page is 1240 × 1754 page units for A4. PDF works in points, and A4
   is 595 × 842 of them, so the ratio is fixed by the page, not chosen
   here — that way a square page or a landscape one comes out right
   without a special case. */
export function pageToPoints(page, dpi = 150) {
  return { width: (page.w / dpi) * 72, height: (page.h / dpi) * 72 };
}
