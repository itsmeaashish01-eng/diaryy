/* ================================================
   INKWELL — office.js
   Reading .docx and .pptx without a library.

   Be clear about what this does and doesn't do, because the difference
   matters and the marketing on other apps tends to blur it.

   DOES: pull the words out of a Word document or a PowerPoint deck and
   put them on a page as editable text boxes, so you can annotate them,
   highlight them and write around them. The original file is kept in
   the notebook as an attachment, untouched.

   DOES NOT: round-trip. What comes out is text and paragraph breaks.
   Styles, tables, columns, embedded charts, master slides, speaker
   notes, track changes — none of that survives, and there is no way to
   save your edits back into a .docx. A faithful Word renderer is a
   years-long project; anyone claiming otherwise in a note app is
   showing you a screenshot of a PDF.

   Both formats are ZIP archives full of XML, and the browser has had a
   deflate decoder built in since DecompressionStream shipped (Safari
   16.4, so every iOS this app targets). That is the whole dependency.
   ================================================ */

const dec = new TextDecoder("utf-8");

/* ---------- ZIP ---------- */

/* Read the central directory rather than scanning for local headers:
   a streamed ZIP can have sizes of zero in the local header with the
   real ones in a trailing descriptor, and Word writes exactly that. */
export async function unzip(buffer) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  const eocd = findEOCD(view, bytes.length);
  if (eocd < 0) throw new Error("Not a ZIP archive — this file isn't a .docx or .pptx.");

  const count = view.getUint16(eocd + 10, true);
  let at = view.getUint32(eocd + 16, true);

  const files = new Map();
  for (let i = 0; i < count; i++) {
    if (view.getUint32(at, true) !== 0x02014b50) break;
    const method = view.getUint16(at + 10, true);
    const compressedSize = view.getUint32(at + 20, true);
    const nameLen = view.getUint16(at + 28, true);
    const extraLen = view.getUint16(at + 30, true);
    const commentLen = view.getUint16(at + 32, true);
    const localAt = view.getUint32(at + 42, true);
    const name = dec.decode(bytes.subarray(at + 46, at + 46 + nameLen));

    // The local header's own name and extra lengths are what locate the
    // data; the central directory's can differ.
    const lNameLen = view.getUint16(localAt + 26, true);
    const lExtraLen = view.getUint16(localAt + 28, true);
    const dataAt = localAt + 30 + lNameLen + lExtraLen;

    files.set(name, { method, dataAt, compressedSize });
    at += 46 + nameLen + extraLen + commentLen;
  }

  return {
    names: () => [...files.keys()],
    has: (name) => files.has(name),
    async text(name) {
      const raw = await this.bytes(name);
      return raw ? dec.decode(raw) : null;
    },
    async bytes(name) {
      const f = files.get(name);
      if (!f) return null;
      const slice = bytes.subarray(f.dataAt, f.dataAt + f.compressedSize);
      if (f.method === 0) return slice;
      if (f.method !== 8) throw new Error(`Unsupported compression in ${name}`);
      return inflateRaw(slice);
    },
  };
}

function findEOCD(view, size) {
  // The comment field can be up to 64 KB, so the signature is not at a
  // fixed offset from the end.
  const min = Math.max(0, size - 0xffff - 22);
  for (let i = size - 22; i >= min; i--) {
    if (view.getUint32(i, true) === 0x06054b50) return i;
  }
  return -1;
}

async function inflateRaw(slice) {
  // A subarray shares its parent's buffer; Response would send the whole
  // archive to the decoder without this copy.
  const copy = slice.slice();
  const stream = new Blob([copy]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/* ---------- XML, as far as we need it ---------- */

/* Deliberately regex rather than DOMParser: the same code then runs in
   node for the tests, and what we want out of these files — the text of
   each paragraph, in order — does not need a tree. */
function textOfParagraph(xml, textTag) {
  const re = new RegExp(`<${textTag}(?:\\s[^>]*)?>([\\s\\S]*?)</${textTag}>`, "g");
  let out = "", m;
  while ((m = re.exec(xml))) out += unescapeXml(m[1]);
  return out.replace(/\s+$/g, "");
}

function unescapeXml(s) {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");     // last, or the others double-decode
}

export function paragraphsFrom(xml, { para, text }) {
  const re = new RegExp(`<${para}(?:\\s[^>]*)?>([\\s\\S]*?)</${para}>`, "g");
  const out = [];
  let m;
  while ((m = re.exec(xml))) {
    // A soft break is a line break inside the paragraph, and it sits
    // between runs rather than inside a text node — so it has to be
    // turned into one before the text nodes are pulled out, or it is
    // simply lost along with everything else that isn't <w:t>.
    const body = m[1].replace(/<(w|a):br(?:\s[^>]*)?\s*\/?>/g, `<${text}>\n</${text}>`);
    out.push(textOfParagraph(body, text));
  }
  return out;
}

/* ---------- the two formats ---------- */

export async function readDocx(buffer) {
  const zip = await unzip(buffer);
  const xml = await zip.text("word/document.xml");
  if (!xml) throw new Error("This doesn't look like a Word document — word/document.xml is missing.");
  const paras = paragraphsFrom(xml, { para: "w:p", text: "w:t" });
  return { kind: "docx", sections: [{ title: "", paragraphs: trimEdges(paras) }] };
}

export async function readPptx(buffer) {
  const zip = await unzip(buffer);
  const slides = zip.names()
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => slideNo(a) - slideNo(b));
  if (!slides.length) throw new Error("This doesn't look like a PowerPoint file — no slides inside.");

  const sections = [];
  for (const name of slides) {
    const xml = await zip.text(name);
    const paras = trimEdges(paragraphsFrom(xml, { para: "a:p", text: "a:t" }));
    sections.push({ title: `Slide ${slideNo(name)}`, paragraphs: paras });
  }
  return { kind: "pptx", sections };
}

const slideNo = (n) => Number(/slide(\d+)\.xml$/.exec(n)?.[1] || 0);

/* Word emits a trailing empty paragraph on almost every document, and
   PowerPoint emits empty ones for every unfilled placeholder. Leading
   and trailing blanks go; blanks in the middle are the author's. */
function trimEdges(paras) {
  let a = 0, b = paras.length;
  while (a < b && !paras[a].trim()) a++;
  while (b > a && !paras[b - 1].trim()) b--;
  return paras.slice(a, b);
}

export async function readOffice(file) {
  const buffer = await file.arrayBuffer();
  const name = (file.name || "").toLowerCase();
  if (name.endsWith(".pptx")) return readPptx(buffer);
  if (name.endsWith(".docx")) return readDocx(buffer);
  // .doc and .ppt are the old binary formats — a different problem
  // entirely, and not one worth solving here.
  throw new Error("Only .docx and .pptx can be read. Older .doc and .ppt files can still be attached to a page.");
}
