/* ================================================
   MARGINALIA — server/pdf.mjs
   Getting the words out of a PDF, with no dependencies.

   A PDF is not a document. It is a bag of numbered objects, some of
   them compressed, describing where to put ink. There is no paragraph
   in there, no reading order, often not even a space character — a gap
   between two words is frequently just a number telling the typesetter
   to move right a bit. Everything below is the work of turning that
   back into prose:

     1. index every `N 0 obj` in the file,
     2. inflate the ones that are compressed, including the object
        streams that modern writers hide half the file in,
     3. walk the page tree,
     4. run the content stream like a tiny machine that only cares
        about text operators,
     5. map each byte back to a character through the font's ToUnicode
        table, and
     6. put the spaces and line breaks back using the positions.

   It handles the PDFs people actually have: LaTeX output, Word
   exports, "print to PDF" from a browser. It does not handle encrypted
   files, and it cannot invent text that was never there — a scan with
   no OCR layer comes back empty and says so, which is the honest
   answer and the one the rest of the app needs to hear.
   ================================================ */

import zlib from "node:zlib";

/* ---- tiny lexer over the raw bytes -------------------------------- */
/*
   Everything is done over a latin1 view of the file. That keeps byte
   offsets and string indices identical, which matters because a PDF
   refers to its own insides by byte offset, and it means binary stream
   data survives a round trip unchanged.
*/

const WS = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);
const DELIM = new Set([0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25]);
const isWS = (c) => WS.has(c);
const isDelim = (c) => DELIM.has(c);
const isRegular = (c) => !isWS(c) && !isDelim(c);

class Lexer {
  constructor(str, pos = 0) {
    this.s = str;
    this.i = pos;
  }
  get eof() {
    return this.i >= this.s.length;
  }
  skipWS() {
    while (this.i < this.s.length) {
      const c = this.s.charCodeAt(this.i);
      if (isWS(c)) { this.i++; continue; }
      if (c === 0x25) {                                  // % comment to end of line
        while (this.i < this.s.length && this.s.charCodeAt(this.i) !== 0x0a && this.s.charCodeAt(this.i) !== 0x0d) this.i++;
        continue;
      }
      break;
    }
  }
  /* One token: a delimiter, or the run of regular characters that
     makes up a name, number or keyword. */
  token() {
    this.skipWS();
    if (this.eof) return null;
    const c = this.s.charCodeAt(this.i);
    if (c === 0x3c && this.s.charCodeAt(this.i + 1) === 0x3c) { this.i += 2; return "<<"; }
    if (c === 0x3e && this.s.charCodeAt(this.i + 1) === 0x3e) { this.i += 2; return ">>"; }
    if (c === 0x5b || c === 0x5d || c === 0x7b || c === 0x7d) { this.i++; return this.s[this.i - 1]; }
    if (c === 0x28) return this.string();
    if (c === 0x3c) return this.hexString();
    if (c === 0x2f) return this.name();
    const start = this.i;
    while (this.i < this.s.length && isRegular(this.s.charCodeAt(this.i))) this.i++;
    if (this.i === start) { this.i++; return this.s[start]; }   // lone delimiter
    return this.s.slice(start, this.i);
  }
  name() {
    this.i++;                                            // the slash
    let out = "";
    while (this.i < this.s.length && isRegular(this.s.charCodeAt(this.i))) {
      let ch = this.s[this.i];
      if (ch === "#" && /^[0-9a-fA-F]{2}$/.test(this.s.slice(this.i + 1, this.i + 3))) {
        ch = String.fromCharCode(parseInt(this.s.slice(this.i + 1, this.i + 3), 16));
        this.i += 2;
      }
      out += ch;
      this.i++;
    }
    return { name: out };
  }
  /* Literal string. Balanced parens, backslash escapes, and the
     line-continuation form where a backslash eats the newline. */
  string() {
    this.i++;
    let depth = 1;
    let out = "";
    while (this.i < this.s.length) {
      const ch = this.s[this.i];
      if (ch === "\\") {
        const n = this.s[this.i + 1];
        this.i += 2;
        if (n === "n") out += "\n";
        else if (n === "r") out += "\r";
        else if (n === "t") out += "\t";
        else if (n === "b") out += "\b";
        else if (n === "f") out += "\f";
        else if (n === "\n") { /* line continuation */ }
        else if (n === "\r") { if (this.s[this.i] === "\n") this.i++; }
        else if (n >= "0" && n <= "7") {
          let oct = n;
          while (oct.length < 3 && this.s[this.i] >= "0" && this.s[this.i] <= "7") oct += this.s[this.i++];
          out += String.fromCharCode(parseInt(oct, 8) & 0xff);
        } else out += n;
        continue;
      }
      if (ch === "(") depth++;
      if (ch === ")") { depth--; if (depth === 0) { this.i++; break; } }
      out += ch;
      this.i++;
    }
    return { str: out };
  }
  hexString() {
    this.i++;
    let hex = "";
    while (this.i < this.s.length && this.s[this.i] !== ">") {
      const ch = this.s[this.i++];
      if (/[0-9a-fA-F]/.test(ch)) hex += ch;
    }
    this.i++;
    if (hex.length % 2) hex += "0";
    let out = "";
    for (let k = 0; k < hex.length; k += 2) out += String.fromCharCode(parseInt(hex.slice(k, k + 2), 16));
    return { str: out };
  }
}

/* ---- objects ------------------------------------------------------ */

export class Ref {
  constructor(num, gen) { this.num = num; this.gen = gen; }
}

/* Parse one object at the lexer's position. An `R` reference looks
   like two numbers followed by a keyword, so a number is held back one
   token to see what comes after it. */
function parseObject(lex) {
  return parseFromToken(lex.token(), lex);
}

function parseFromToken(t, lex) {
  if (t === null) return null;
  if (typeof t === "object") return t.name !== undefined ? t : t.str;   // names stay boxed, strings unwrap
  if (t === "<<") {
    const dict = Object.create(null);
    for (;;) {
      const k = lex.token();
      if (k === null || k === ">>") break;
      if (typeof k !== "object" || k.name === undefined) continue;      // junk key, skip it
      dict[k.name] = parseObject(lex);
    }
    /* A dictionary may be followed by a stream. Note where the bytes
       would start; decoding happens on demand. */
    const save = lex.i;
    const nxt = lex.token();
    if (nxt === "stream") {
      let p = lex.i;
      if (lex.s[p] === "\r") p++;
      if (lex.s[p] === "\n") p++;
      dict.__streamStart = p;
    } else lex.i = save;
    return dict;
  }
  if (t === "[") {
    const arr = [];
    for (;;) {
      const nt = lex.token();
      if (nt === null || nt === "]") break;
      arr.push(parseFromToken(nt, lex));
    }
    return arr;
  }
  if (t === "true") return true;
  if (t === "false") return false;
  if (t === "null") return null;
  if (/^[+-]?[\d.]+$/.test(t)) {
    const save = lex.i;
    const t2 = lex.token();
    if (typeof t2 === "string" && /^\d+$/.test(t2)) {
      const t3 = lex.token();
      if (t3 === "R") return new Ref(parseInt(t, 10), parseInt(t2, 10));
    }
    lex.i = save;
    return parseFloat(t);
  }
  return { keyword: t };
}

/* ---- filters ------------------------------------------------------ */

function inflate(buf) {
  try { return zlib.inflateSync(buf); }
  catch {
    try { return zlib.inflateRawSync(buf); }
    catch {
      /* Truncated streams are common in the wild. Take whatever
         inflates before the error rather than losing the whole page. */
      try { return zlib.inflateSync(buf, { finishFlush: zlib.constants.Z_SYNC_FLUSH }); }
      catch { return Buffer.alloc(0); }
    }
  }
}

function ascii85(buf) {
  const s = buf.toString("latin1").replace(/\s/g, "").replace(/^<~/, "");
  const end = s.indexOf("~>");
  const body = end >= 0 ? s.slice(0, end) : s;
  const out = [];
  let group = [];
  for (const ch of body) {
    if (ch === "z" && group.length === 0) { out.push(0, 0, 0, 0); continue; }
    group.push(ch.charCodeAt(0) - 33);
    if (group.length === 5) {
      let n = 0;
      for (const g of group) n = n * 85 + g;
      out.push((n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
      group = [];
    }
  }
  if (group.length) {
    const n0 = group.length;
    while (group.length < 5) group.push(84);
    let n = 0;
    for (const g of group) n = n * 85 + g;
    const bytes = [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
    out.push(...bytes.slice(0, n0 - 1));
  }
  return Buffer.from(out);
}

function asciiHex(buf) {
  const s = buf.toString("latin1").split(">")[0].replace(/[^0-9a-fA-F]/g, "");
  return Buffer.from(s.length % 2 ? s + "0" : s, "hex");
}

function runLength(buf) {
  const out = [];
  let i = 0;
  while (i < buf.length) {
    const n = buf[i++];
    if (n === 128) break;
    if (n < 128) { for (let k = 0; k <= n; k++) out.push(buf[i++]); }
    else { const b = buf[i++]; for (let k = 0; k < 257 - n; k++) out.push(b); }
  }
  return Buffer.from(out);
}

/* PNG predictors. Cross-reference streams and object streams almost
   always use predictor 12, so this is not an exotic branch: without it
   half the files on a modern disk are unreadable. */
function unpredict(data, parms, resolve) {
  const pred = num(resolve(parms.Predictor), 1);
  if (pred < 2) return data;
  const colors = num(resolve(parms.Colors), 1);
  const bpc = num(resolve(parms.BitsPerComponent), 8);
  const columns = num(resolve(parms.Columns), 1);
  const bpp = Math.ceil((colors * bpc) / 8);
  const rowLen = Math.ceil((colors * bpc * columns) / 8);
  if (pred === 2) {
    if (bpc !== 8) return data;                          // sub-byte TIFF prediction: rare, skip
    for (let r = 0; r + rowLen <= data.length; r += rowLen)
      for (let i = bpp; i < rowLen; i++) data[r + i] = (data[r + i] + data[r + i - bpp]) & 0xff;
    return data;
  }
  const rows = Math.floor(data.length / (rowLen + 1));
  const out = Buffer.alloc(rows * rowLen);
  let prev = Buffer.alloc(rowLen);
  for (let r = 0; r < rows; r++) {
    const ft = data[r * (rowLen + 1)];
    const row = Buffer.from(data.subarray(r * (rowLen + 1) + 1, (r + 1) * (rowLen + 1)));
    for (let i = 0; i < rowLen; i++) {
      const a = i >= bpp ? row[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v = row[i];
      if (ft === 1) v += a;
      else if (ft === 2) v += b;
      else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      row[i] = v & 0xff;
    }
    row.copy(out, r * rowLen);
    prev = row;
  }
  return out;
}

const num = (v, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const nameOf = (v) => (v && typeof v === "object" && v.name !== undefined ? v.name : null);

/* ---- the document ------------------------------------------------- */

export class PdfDocument {
  constructor(buffer) {
    this.buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    this.raw = this.buf.toString("latin1");
    this.objects = new Map();          // number -> where its body starts
    this.cache = new Map();            // number -> parsed value
    this.streams = new Map();          // number -> decoded bytes
    this.warnings = [];
    this.encrypted = false;
    this.index();
  }

  /* Rather than trusting the cross-reference table — which is stale or
     wrong in any file that has been edited, appended to, or produced
     by a hurried library — scan for object headers directly. One pass
     over the file, and it is always right. */
  index() {
    const re = /(?:^|[\s>\]])(\d{1,10})\s+(\d{1,5})\s+obj\b/g;
    let m;
    while ((m = re.exec(this.raw))) {
      const n = parseInt(m[1], 10);
      /* Later definitions win: that is what an incremental update
         means. */
      this.objects.set(n, { bodyAt: re.lastIndex });
    }
    const trailerIdx = this.raw.lastIndexOf("trailer");
    if (trailerIdx >= 0) {
      const t = parseObject(new Lexer(this.raw, trailerIdx + 7));
      if (t && typeof t === "object") this.trailer = t;
    }
    if (!this.trailer) this.trailer = Object.create(null);
    if (!this.trailer.Root) {
      /* Files with a cross-reference stream have no `trailer` keyword.
         Their catalog is found by looking for it. */
      for (const [n] of this.objects) {
        const o = this.get(n);
        if (o && typeof o === "object" && nameOf(o.Type) === "XRef" && o.Root) {
          this.trailer = Object.assign(Object.create(null), o, this.trailer);
          break;
        }
      }
    }
    if (this.trailer.Encrypt) {
      this.encrypted = true;
      this.warnings.push("this PDF is encrypted — extraction will be incomplete");
    }
    this.loadObjectStreams();
  }

  /* Most of a modern PDF's dictionaries live compressed inside object
     streams. Unpack them all up front so page and font lookups stay
     plain map reads. */
  loadObjectStreams() {
    for (const [n] of [...this.objects]) {
      let obj;
      try { obj = this.get(n); } catch { continue; }
      if (!obj || typeof obj !== "object" || nameOf(obj.Type) !== "ObjStm") continue;
      let data;
      try { data = this.streamData(n); } catch { continue; }
      if (!data || !data.length) continue;
      const count = num(this.resolve(obj.N));
      const first = num(this.resolve(obj.First));
      const nums = data.toString("latin1", 0, first).trim().split(/\s+/).map(Number);
      const body = data.toString("latin1");
      for (let k = 0; k < count; k++) {
        const objNum = nums[k * 2];
        const off = nums[k * 2 + 1];
        if (!Number.isFinite(objNum) || !Number.isFinite(off)) continue;
        if (this.objects.has(objNum)) continue;          // a top-level definition wins
        try { this.cache.set(objNum, parseObject(new Lexer(body, first + off))); }
        catch { /* one bad entry shouldn't sink the stream */ }
      }
    }
  }

  get(n) {
    if (this.cache.has(n)) return this.cache.get(n);
    const rec = this.objects.get(n);
    if (!rec) return null;
    let val = null;
    try { val = parseObject(new Lexer(this.raw, rec.bodyAt)); }
    catch { val = null; }
    this.cache.set(n, val);
    return val;
  }

  resolve(v, depth = 0) {
    if (v instanceof Ref) {
      if (depth > 32) return null;
      return this.resolve(this.get(v.num), depth + 1);
    }
    return v;
  }

  /* Decode the stream belonging to object `n`, applying whatever chain
     of filters its dictionary declares. */
  streamData(n) {
    if (this.streams.has(n)) return this.streams.get(n);
    const dict = this.get(n);
    let out = Buffer.alloc(0);
    if (dict && typeof dict === "object" && dict.__streamStart != null) {
      const start = dict.__streamStart;
      let len = num(this.resolve(dict.Length), -1);
      const endIdx = this.raw.indexOf("endstream", start);
      if (len < 0 || start + len > this.raw.length || (endIdx >= 0 && start + len > endIdx + 2)) {
        len = endIdx >= 0 ? endIdx - start : this.raw.length - start;
        /* Trim the end-of-line the writer put before `endstream`. */
        while (len > 0 && (this.raw.charCodeAt(start + len - 1) === 0x0a || this.raw.charCodeAt(start + len - 1) === 0x0d)) len--;
      }
      let data = this.buf.subarray(start, start + Math.max(0, len));
      const filters = [].concat(this.resolve(dict.Filter) || []).map(nameOf).filter(Boolean);
      const parmsRaw = this.resolve(dict.DecodeParms) || this.resolve(dict.DP);
      const parmsArr = Array.isArray(parmsRaw) ? parmsRaw : [parmsRaw];
      filters.forEach((f, idx) => {
        const parms = this.resolve(parmsArr[idx]) || (filters.length === 1 ? this.resolve(parmsArr[0]) : null);
        if (f === "FlateDecode" || f === "Fl") data = inflate(data);
        else if (f === "ASCII85Decode" || f === "A85") data = ascii85(data);
        else if (f === "ASCIIHexDecode" || f === "AHx") data = asciiHex(data);
        else if (f === "RunLengthDecode" || f === "RL") data = runLength(data);
        else if (f === "LZWDecode") { data = Buffer.alloc(0); this.warnings.push("an LZW-compressed stream was skipped"); }
        else if (f === "DCTDecode" || f === "JPXDecode" || f === "CCITTFaxDecode" || f === "JBIG2Decode") data = Buffer.alloc(0);
        if (parms && typeof parms === "object" && (f === "FlateDecode" || f === "Fl"))
          data = unpredict(Buffer.from(data), parms, (x) => this.resolve(x));
      });
      out = Buffer.from(data);
    }
    this.streams.set(n, out);
    return out;
  }

  streamOf(value) {
    return value instanceof Ref ? this.streamData(value.num) : Buffer.alloc(0);
  }

  /* ---- the page tree ---------------------------------------------- */

  pages() {
    const found = [];
    const seen = new Set();
    const walk = (node, inherited, depth) => {
      const d = this.resolve(node);
      if (!d || typeof d !== "object" || depth > 64) return;
      const inh = {
        Resources: d.Resources !== undefined ? d.Resources : inherited.Resources,
        MediaBox: d.MediaBox !== undefined ? d.MediaBox : inherited.MediaBox,
      };
      const type = nameOf(d.Type);
      if (type === "Page" || (!d.Kids && d.Contents !== undefined)) {
        found.push({ dict: d, inherited: inh });
        return;
      }
      const kids = this.resolve(d.Kids);
      if (Array.isArray(kids)) {
        for (const k of kids) {
          if (k instanceof Ref) {
            if (seen.has(k.num)) continue;
            seen.add(k.num);
          }
          walk(k, inh, depth + 1);
        }
      }
    };

    const root = this.resolve(this.trailer && this.trailer.Root);
    if (root && typeof root === "object" && root.Pages) walk(root.Pages, {}, 0);

    if (!found.length) {
      for (const [n] of this.objects) {
        const o = this.get(n);
        if (o && typeof o === "object" && nameOf(o.Type) === "Catalog" && o.Pages) { walk(o.Pages, {}, 0); break; }
      }
    }
    if (!found.length) {
      /* Last resort: every /Type /Page there is, in object order. */
      const nums = [...new Set([...this.objects.keys(), ...this.cache.keys()])].sort((a, b) => a - b);
      for (const n of nums) {
        const o = this.cache.has(n) ? this.cache.get(n) : this.get(n);
        if (o && typeof o === "object" && nameOf(o.Type) === "Page") found.push({ dict: o, inherited: {} });
      }
    }
    return found;
  }

  info() {
    const inf = this.resolve(this.trailer && this.trailer.Info) || {};
    const pick = (k) => {
      const v = this.resolve(inf[k]);
      return typeof v === "string" ? decodeTextString(v) : "";
    };
    return { title: pick("Title"), author: pick("Author"), producer: pick("Producer"), subject: pick("Subject") };
  }
}

/* PDF text strings are either UTF-16BE behind a byte-order mark, or a
   Latin-ish single-byte encoding. */
function decodeTextString(s) {
  if (s.charCodeAt(0) === 0xfe && s.charCodeAt(1) === 0xff) {
    let out = "";
    for (let i = 2; i + 1 < s.length; i += 2) out += String.fromCharCode((s.charCodeAt(i) << 8) | s.charCodeAt(i + 1));
    return out;
  }
  return s;
}

/* ---- fonts -------------------------------------------------------- */
/*
   All that is wanted from a font is a function from code to character,
   plus whether codes are one or two bytes wide. Three sources, in
   order of trust: the ToUnicode CMap, the /Differences array, and
   finally the standard single-byte encodings.
*/

const STD_ENCODING_DIFFS = {
  /* The WinAnsi positions that differ from Latin-1 and that turn up
     constantly in real documents: quotes, dashes, ellipsis. */
  128: "€", 130: "‚", 131: "ƒ", 132: "„", 133: "…", 134: "†",
  135: "‡", 136: "ˆ", 137: "‰", 138: "Š", 139: "‹", 140: "Œ",
  142: "Ž", 145: "‘", 146: "’", 147: "“", 148: "”", 149: "•",
  150: "–", 151: "—", 152: "˜", 153: "™", 154: "š", 155: "›",
  156: "œ", 158: "ž", 159: "Ÿ",
};

/* Computer Modern and its relatives put ligatures and accents in the
   low positions. Without this, TeX output arrives with control
   characters in the middle of words. */
const TEX_TEXT_DIFFS = {
  11: "ff", 12: "fi", 13: "fl", 14: "ffi", 15: "ffl",
  16: "ı", 17: "ȷ", 25: "ß", 26: "æ", 27: "œ", 28: "ø",
  29: "Æ", 30: "Œ", 31: "Ø",
};

function parseCMap(text) {
  const map = new Map();
  let widthHint = 0;

  /* The codespace range says how wide a code is. Two bytes is the
     common case for embedded subsets. */
  const csRe = /begincodespacerange([\s\S]*?)endcodespacerange/g;
  let m;
  while ((m = csRe.exec(text))) {
    for (const h of m[1].match(/<([0-9a-fA-F]+)>/g) || []) widthHint = Math.max(widthHint, (h.length - 2) / 2);
  }

  const utf16 = (h) => {
    let out = "";
    for (let i = 0; i + 4 <= h.length; i += 4) {
      const unit = parseInt(h.slice(i, i + 4), 16);
      if (Number.isFinite(unit)) out += String.fromCharCode(unit);
    }
    if (!out && h.length) out = String.fromCharCode(parseInt(h, 16));
    return out;
  };

  const charRe = /beginbfchar([\s\S]*?)endbfchar/g;
  while ((m = charRe.exec(text))) {
    const pairs = m[1].match(/<[0-9a-fA-F]+>\s*(?:<[0-9a-fA-F]+>|\/[^\s/<]+)/g) || [];
    for (const p of pairs) {
      const parts = /<([0-9a-fA-F]+)>\s*(?:<([0-9a-fA-F]+)>|\/([^\s/<]+))/.exec(p);
      if (!parts) continue;
      const code = parseInt(parts[1], 16);
      if (!widthHint) widthHint = parts[1].length / 2;
      map.set(code, parts[2] ? utf16(parts[2]) : glyphName(parts[3]));
    }
  }

  const rangeRe = /beginbfrange([\s\S]*?)endbfrange/g;
  while ((m = rangeRe.exec(text))) {
    const lex = new Lexer(m[1], 0);
    const items = [];
    for (;;) {
      const t = lex.token();
      if (t === null) break;
      items.push(parseFromToken(t, lex));
    }
    for (let i = 0; i + 2 < items.length + 1; ) {
      const lo = items[i], hi = items[i + 1], dst = items[i + 2];
      if (typeof lo !== "string" || typeof hi !== "string") { i++; continue; }
      const loN = strToCode(lo), hiN = strToCode(hi);
      if (!widthHint) widthHint = lo.length;
      if (Array.isArray(dst)) {
        for (let k = 0; k <= hiN - loN && k < dst.length; k++)
          if (typeof dst[k] === "string") map.set(loN + k, decodeUTF16BE(dst[k]));
        i += 3;
      } else if (typeof dst === "string") {
        const base = decodeUTF16BE(dst);
        const baseCode = base.charCodeAt(base.length - 1) || 0;
        const prefix = base.slice(0, -1);
        for (let k = 0; k <= Math.min(hiN - loN, 65535); k++)
          map.set(loN + k, prefix + String.fromCharCode(baseCode + k));
        i += 3;
      } else i += 1;
    }
  }
  return { map, width: widthHint || 0 };
}

const strToCode = (s) => {
  let n = 0;
  for (let i = 0; i < s.length; i++) n = (n << 8) | s.charCodeAt(i);
  return n >>> 0;
};

const decodeUTF16BE = (s) => {
  let out = "";
  for (let i = 0; i + 1 < s.length; i += 2) out += String.fromCharCode((s.charCodeAt(i) << 8) | s.charCodeAt(i + 1));
  if (!out && s.length === 1) out = s;
  return out;
};

/* Enough of the Adobe glyph list to cover what /Differences actually
   names in scientific and office documents. */
const GLYPHS = {
  space: " ", exclam: "!", quotedbl: '"', numbersign: "#", dollar: "$", percent: "%", ampersand: "&",
  quotesingle: "'", quoteright: "’", quoteleft: "‘", parenleft: "(", parenright: ")",
  asterisk: "*", plus: "+", comma: ",", hyphen: "-", period: ".", slash: "/", zero: "0", one: "1",
  two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9",
  colon: ":", semicolon: ";", less: "<", equal: "=", greater: ">", question: "?", at: "@",
  bracketleft: "[", backslash: "\\", bracketright: "]", asciicircum: "^", underscore: "_",
  grave: "`", braceleft: "{", bar: "|", braceright: "}", asciitilde: "~",
  quotedblleft: "“", quotedblright: "”", quotedblbase: "„", endash: "–",
  emdash: "—", bullet: "•", ellipsis: "…", dagger: "†", daggerdbl: "‡",
  fi: "fi", fl: "fl", ff: "ff", ffi: "ffi", ffl: "ffl", degree: "°", minus: "−",
  multiply: "×", divide: "÷", plusminus: "±", lessequal: "≤", greaterequal: "≥",
  approxequal: "≈", notequal: "≠", infinity: "∞", partialdiff: "∂",
  summation: "∑", product: "∏", radical: "√", integral: "∫", element: "∈",
  arrowright: "→", arrowleft: "←", arrowboth: "↔", arrowdblright: "⇒",
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", zeta: "ζ",
  eta: "η", theta: "θ", iota: "ι", kappa: "κ", lambda: "λ", mu: "μ",
  nu: "ν", xi: "ξ", pi: "π", rho: "ρ", sigma: "σ", tau: "τ",
  upsilon: "υ", phi: "φ", chi: "χ", psi: "ψ", omega: "ω",
  Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π",
  Sigma: "Σ", Upsilon: "Υ", Phi: "Φ", Psi: "Ψ", Omega: "Ω",
  florin: "ƒ", trademark: "™", copyright: "©", registered: "®",
  paragraph: "¶", section: "§", sterling: "£", euro: "€", yen: "¥",
  cent: "¢", nbspace: " ",
};

function glyphName(n) {
  if (!n) return "";
  if (GLYPHS[n]) return GLYPHS[n];
  let m = /^uni([0-9a-fA-F]{4,6})$/.exec(n);
  if (m) return String.fromCodePoint(parseInt(m[1], 16));
  m = /^u([0-9a-fA-F]{4,6})$/.exec(n);
  if (m) return String.fromCodePoint(parseInt(m[1], 16));
  if (/^(?:g|cid|c|index|glyph)\d+$/i.test(n)) return "";   // a subset index tells us nothing
  if (n.length === 1) return n;
  return "";
}

/* Advance widths, in thousandths of an em. Getting these right is what
   makes the difference between "two columns" and "two columns spliced
   into each other": the layout decides where a column ends by asking
   where a run of text ends, and a guessed width puts that in the wrong
   place. A font that declares no widths at all (the base fourteen,
   which a PDF is allowed to assume the reader knows) falls back to the
   Helvetica metrics below. */
const HELVETICA_WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

function fallbackWidth(font, ch) {
  if (!ch) return font.twoByte ? 1000 : 500;
  const code = ch.charCodeAt(0);
  const base = code >= 32 && code <= 126 ? HELVETICA_WIDTHS[code - 32] : code > 0x2e80 ? 1000 : 500;
  return font.serif ? base * 0.92 : base;
}

function readWidths(doc, d, font) {
  if (font.type === "Type0") {
    const desc = doc.resolve(d.DescendantFonts);
    const dd = Array.isArray(desc) ? doc.resolve(desc[0]) : null;
    font.defaultWidth = num(doc.resolve(dd && dd.DW), 1000);
    const W = doc.resolve(dd && dd.W);
    if (Array.isArray(W)) {
      /* Two forms, interleaved: `c [w w w]` and `cFirst cLast w`. */
      for (let i = 0; i < W.length; ) {
        const first = num(doc.resolve(W[i]), -1);
        const second = doc.resolve(W[i + 1]);
        if (Array.isArray(second)) {
          second.forEach((w, k) => font.widths.set(first + k, num(doc.resolve(w), font.defaultWidth)));
          i += 2;
        } else {
          const last = num(second, -1);
          const w = num(doc.resolve(W[i + 2]), font.defaultWidth);
          for (let c = first; c >= 0 && c <= last && c - first < 65536; c++) font.widths.set(c, w);
          i += 3;
        }
      }
    }
    return;
  }
  const first = num(doc.resolve(d.FirstChar), 0);
  const widths = doc.resolve(d.Widths);
  if (Array.isArray(widths)) {
    widths.forEach((w, k) => {
      const v = num(doc.resolve(w), -1);
      if (v >= 0) font.widths.set(first + k, v);
    });
  }
  const fd = doc.resolve(d.FontDescriptor);
  const missing = fd && typeof fd === "object" ? num(doc.resolve(fd.MissingWidth), 0) : 0;
  if (missing > 0) font.defaultWidth = missing;
}

function buildFont(doc, fontDict) {
  const d = doc.resolve(fontDict);
  const font = {
    twoByte: false, map: new Map(), diffs: new Map(), widths: new Map(),
    defaultWidth: null, tex: false, serif: false, name: "", type: "",
  };
  if (!d || typeof d !== "object") return font;
  font.type = nameOf(d.Subtype) || "";
  font.name = nameOf(d.BaseFont) || "";
  font.serif = /Times|Serif|Roman|Georgia|Garamond|Minion|CMR|Book/i.test(font.name);

  if (font.type === "Type0") font.twoByte = true;          // Identity-H and friends
  readWidths(doc, d, font);
  if (/CM[BRMSTI]|CMR|CMMI|CMSY|CMEX|LM(Roman|Sans|Mono)|TeX/i.test(font.name)) font.tex = true;

  if (d.ToUnicode) {
    try {
      const data = doc.streamOf(d.ToUnicode);
      if (data && data.length) {
        const { map, width } = parseCMap(data.toString("latin1"));
        font.map = map;
        if (width >= 2) font.twoByte = true;
        else if (width === 1 && font.type !== "Type0") font.twoByte = false;
      }
    } catch { /* a broken CMap falls through to the encoding */ }
  }

  const enc = doc.resolve(d.Encoding);
  if (enc && typeof enc === "object" && enc.Differences) {
    const diffs = doc.resolve(enc.Differences);
    if (Array.isArray(diffs)) {
      let code = 0;
      for (const item of diffs) {
        if (typeof item === "number") code = item;
        else if (item && item.name !== undefined) font.diffs.set(code++, glyphName(item.name));
      }
    }
  }
  return font;
}

/* Decode to glyphs rather than to a string: the layout needs each
   code's own advance, and a code can map to more than one character
   (the `ffi` ligature is one glyph and three letters). */
function decodeWithFont(font, bytes) {
  const glyphs = [];
  const step = font.twoByte ? 2 : 1;
  for (let i = 0; i < bytes.length; i += step) {
    const code = step === 2 ? ((bytes.charCodeAt(i) << 8) | (bytes.charCodeAt(i + 1) || 0)) : bytes.charCodeAt(i);
    let ch;
    if (font.map.has(code)) ch = font.map.get(code);
    else if (font.diffs.has(code)) ch = font.diffs.get(code);
    else if (step === 2) ch = "";                          // no map, no hope: drop the character
    else if (font.tex && TEX_TEXT_DIFFS[code]) ch = TEX_TEXT_DIFFS[code];
    else if (STD_ENCODING_DIFFS[code]) ch = STD_ENCODING_DIFFS[code];
    else ch = code >= 32 ? String.fromCharCode(code) : "";
    glyphs.push({ code, ch });
  }
  return glyphs;
}

function advanceOf(font, glyphs, size, charSp, wordSp, hscale) {
  let w = 0;
  for (const g of glyphs) {
    let width = font.widths.get(g.code);
    if (width == null) width = font.defaultWidth != null ? font.defaultWidth : fallbackWidth(font, g.ch);
    w += (width / 1000) * size + charSp + (g.code === 32 && !font.twoByte ? wordSp : 0);
  }
  return w * hscale;
}

/* ---- the content stream ------------------------------------------- */
/*
   A miniature interpreter. It ignores paths, images, colour and
   clipping, and tracks only what is needed to know where a run of text
   landed: the text matrix, the line matrix, the font and the size.
   Each show operator emits one positioned run; the runs become lines
   afterwards.
*/

const mul = (a, b) => [
  a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3],
  a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
  a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5],
];

function runsFromContent(doc, content, resources, fontCache, shared = { depth: 0, seen: new Set() }) {
  const runs = [];
  const lex = new Lexer(content, 0);
  const stack = [];
  let gs = [1, 0, 0, 1, 0, 0];
  const gsStack = [];
  let tm = null, tlm = null;
  let font = null, size = 0, leading = 0, charSp = 0, wordSp = 0, hscale = 1;

  const fonts = doc.resolve(resources && resources.Font) || {};

  const getFont = (key) => {
    if (fontCache.has(key)) return fontCache.get(key);
    const f = buildFont(doc, fonts[key]);
    fontCache.set(key, f);
    return f;
  };

  const show = (raw, kernBefore = 0) => {
    if (!tm || !font) return;
    const glyphs = decodeWithFont(font, raw);
    const text = glyphs.map((g) => g.ch).join("");
    const adv = advanceOf(font, glyphs, size, charSp, wordSp, hscale);
    const m = mul(tm, gs);
    /* The scale sitting in the matrices is part of the on-page size —
       a form drawn at half scale has half-size text. */
    const scale = Math.hypot(m[0], m[1]) || 1;
    if (text) runs.push({ text, x: m[4], y: m[5], size: Math.abs(size) * scale || 10, width: adv * scale, kern: kernBefore });
    tm = mul([1, 0, 0, 1, adv, 0], tm);
  };

  for (;;) {
    const t = lex.token();
    if (t === null) break;
    if (typeof t === "object" || t === "[" || t === "<<" || /^[+-]?[\d.]/.test(t)) {
      if (typeof t === "object") stack.push(t.name !== undefined ? t : t.str);
      else if (t === "[" || t === "<<") stack.push(parseFromToken(t, lex));
      else stack.push(parseFloat(t));
      if (stack.length > 64) stack.shift();
      continue;
    }
    const a = stack;
    switch (t) {
      case "q": gsStack.push(gs.slice()); break;
      case "Q": gs = gsStack.pop() || [1, 0, 0, 1, 0, 0]; break;
      case "cm": if (a.length >= 6) gs = mul(a.slice(-6), gs); break;
      case "BT": tm = [1, 0, 0, 1, 0, 0]; tlm = tm.slice(); break;
      case "ET": tm = null; tlm = null; break;
      case "Tf": {
        const sz = a[a.length - 1];
        const key = a[a.length - 2];
        if (typeof sz === "number") size = sz;
        if (key && key.name !== undefined) font = getFont(key.name);
        break;
      }
      case "Td":
        if (a.length >= 2) { tlm = mul([1, 0, 0, 1, a[a.length - 2], a[a.length - 1]], tlm || [1, 0, 0, 1, 0, 0]); tm = tlm.slice(); }
        break;
      case "TD":
        if (a.length >= 2) {
          leading = -a[a.length - 1];
          tlm = mul([1, 0, 0, 1, a[a.length - 2], a[a.length - 1]], tlm || [1, 0, 0, 1, 0, 0]);
          tm = tlm.slice();
        }
        break;
      case "Tm": if (a.length >= 6) { tlm = a.slice(-6); tm = tlm.slice(); } break;
      case "T*": tlm = mul([1, 0, 0, 1, 0, -leading], tlm || [1, 0, 0, 1, 0, 0]); tm = tlm.slice(); break;
      case "TL": leading = a[a.length - 1] || 0; break;
      case "Tc": charSp = a[a.length - 1] || 0; break;
      case "Tw": wordSp = a[a.length - 1] || 0; break;
      case "Tz": hscale = (a[a.length - 1] || 100) / 100; break;
      case "Tj": if (typeof a[a.length - 1] === "string") show(a[a.length - 1]); break;
      case "'":
        tlm = mul([1, 0, 0, 1, 0, -leading], tlm || [1, 0, 0, 1, 0, 0]); tm = tlm.slice();
        if (typeof a[a.length - 1] === "string") show(a[a.length - 1]);
        break;
      case '"':
        wordSp = a[a.length - 3] || wordSp; charSp = a[a.length - 2] || charSp;
        tlm = mul([1, 0, 0, 1, 0, -leading], tlm || [1, 0, 0, 1, 0, 0]); tm = tlm.slice();
        if (typeof a[a.length - 1] === "string") show(a[a.length - 1]);
        break;
      case "TJ": {
        const arr = a[a.length - 1];
        if (Array.isArray(arr)) {
          let pending = 0;
          for (const item of arr) {
            if (typeof item === "number") {
              pending += item;
              tm = mul([1, 0, 0, 1, (-item / 1000) * size * hscale, 0], tm || [1, 0, 0, 1, 0, 0]);
            } else if (typeof item === "string") {
              show(item, pending);
              pending = 0;
            }
          }
        }
        break;
      }
      case "Do": {
        /* Form XObjects hold text too: headers, figure captions, and
           anything a template stamped onto the page. */
        const key = a[a.length - 1];
        const xobjs = doc.resolve(resources && resources.XObject) || {};
        const ref = key && key.name !== undefined ? xobjs[key.name] : null;
        const xo = doc.resolve(ref);
        if (ref instanceof Ref && xo && typeof xo === "object" && nameOf(xo.Subtype) === "Form"
            && shared.depth < 6 && !shared.seen.has(ref.num)) {
          shared.seen.add(ref.num);
          shared.depth++;
          try {
            const data = doc.streamData(ref.num).toString("latin1");
            const res = doc.resolve(xo.Resources) || resources;
            const mtx = Array.isArray(doc.resolve(xo.Matrix)) ? doc.resolve(xo.Matrix) : [1, 0, 0, 1, 0, 0];
            const outer = mul(mtx, gs);
            const scale = Math.hypot(outer[0], outer[1]) || 1;
            for (const r of runsFromContent(doc, data, res, new Map(), shared)) {
              const p = mul([1, 0, 0, 1, r.x, r.y], outer);
              runs.push({ ...r, x: p[4], y: p[5], width: r.width * scale, size: r.size * scale });
            }
          } catch { /* a bad form is not worth losing the page over */ }
          shared.depth--;
        }
        break;
      }
      default: break;
    }
    stack.length = 0;
  }
  return runs;
}

/* ---- runs to prose ------------------------------------------------ */
/*
   Runs arrive in painting order, which is usually reading order but is
   not promised. Group them into lines by baseline, sort each line left
   to right, then decide where the spaces go.

   The one structural thing that has to be got right is columns. Half
   the papers anyone reads are set in two, and a reader that walks them
   by baseline produces sentences spliced from both columns — which
   then get embedded, retrieved and quoted, so the damage travels all
   the way to the answer. So before anything else: look for a vertical
   band of white space that almost no line crosses, and if there is
   one, read each side to the bottom before starting the other.
*/

const widthOf = (r) => (r.width != null ? r.width : r.text.length * r.size * 0.5);

function groupLines(runs) {
  const lines = [];
  const sorted = runs.slice().sort((a, b) => (b.y - a.y) || (a.x - b.x));
  for (const r of sorted) {
    const line = lines.find((l) => Math.abs(l.y - r.y) <= Math.max(2.2, r.size * 0.3));
    if (line) line.items.push(r);
    else lines.push({ y: r.y, items: [r] });
  }
  return lines.sort((a, b) => b.y - a.y);
}

/* Find the x of a gutter: a vertical strip at least `minGap` wide,
   inside the middle half of the text block, that fewer than a sixth of
   the lines cross. Returns null when the page is a single column,
   which is the answer most of the time. */
function findGutter(lines, minGap = 12) {
  if (lines.length < 6) return null;
  const left = Math.min(...lines.map((l) => l.items[0].x));
  const right = Math.max(...lines.map((l) => Math.max(...l.items.map((r) => r.x + widthOf(r)))));
  const span = right - left;
  if (span < 200) return null;

  /* Occupancy in one-point bins, counted per line so a single wide
     figure caption doesn't outvote fifty lines of body text. */
  const bins = Math.ceil(span);
  const cover = new Int32Array(bins + 1);
  for (const line of lines) {
    const hit = new Uint8Array(bins + 1);
    for (const r of line.items) {
      const a = Math.max(0, Math.floor(r.x - left));
      const b = Math.min(bins, Math.ceil(r.x + widthOf(r) - left));
      for (let i = a; i <= b; i++) hit[i] = 1;
    }
    for (let i = 0; i <= bins; i++) cover[i] += hit[i];
  }

  const lo = Math.floor(bins * 0.25);
  const hi = Math.ceil(bins * 0.75);
  /* A real gutter is not perfectly empty: the title, the odd wide
     figure and a table rule cross it. Allow a few, not many. */
  const threshold = Math.max(3, Math.ceil(lines.length * 0.15));
  let best = null;
  let start = null;
  for (let i = lo; i <= hi; i++) {
    const quiet = cover[i] < threshold;
    if (quiet && start === null) start = i;
    if ((!quiet || i === hi) && start !== null) {
      const width = i - start;
      if (width >= minGap && (!best || width > best.width)) best = { width, x: left + start + width / 2 };
      start = null;
    }
  }
  if (!best) return null;

  /* Both sides have to carry real text, or this is a wide margin
     rather than a gutter. Counted in characters over runs, not lines:
     in a two-column layout the two columns usually share baselines,
     so there is no such thing as a left-hand line. */
  const all = lines.flatMap((l) => l.items);
  const chars = (rs) => rs.reduce((n, r) => n + r.text.length, 0);
  const total = chars(all);
  if (!total) return null;
  const leftChars = chars(all.filter((r) => r.x + widthOf(r) <= best.x + 2));
  const rightChars = chars(all.filter((r) => r.x >= best.x - 2));
  return Math.min(leftChars, rightChars) / total >= 0.2 ? best.x : null;
}

function layout(runs, depth = 0) {
  const lines = groupLines(runs);
  if (!lines.length) return "";
  const gutter = depth < 2 ? findGutter(lines) : null;
  if (gutter != null) {
    const leftRuns = [];
    const rightRuns = [];
    const spanning = [];
    for (const line of lines) {
      for (const r of line.items) {
        if (r.x < gutter && r.x + widthOf(r) > gutter + 2) spanning.push(r);
        else if (r.x < gutter) leftRuns.push(r);
        else rightRuns.push(r);
      }
    }
    /* Something that crosses the gutter is a title, a full-width
       figure or a table rule. Anything above both columns is a heading
       and belongs first; the rest rides with the left column, which is
       where a reader meets it. */
    const topOf = (rs) => (rs.length ? Math.max(...rs.map((r) => r.y)) : -Infinity);
    const columnTop = Math.max(topOf(leftRuns), topOf(rightRuns));
    const head = [];
    for (const r of spanning) (r.y > columnTop ? head : leftRuns).push(r);
    const parts = [layoutLines(groupLines(head)), layout(leftRuns, depth + 1), layout(rightRuns, depth + 1)];
    return parts.filter(Boolean).join("\n\n");
  }
  return layoutLines(lines);
}

function layoutLines(lines, { columnGap = 60 } = {}) {
  const out = [];
  for (const line of lines) {
    line.items.sort((a, b) => a.x - b.x);
    let text = "";
    let prev = null;
    for (const it of line.items) {
      if (prev) {
        const realGap = it.x - prev.x - widthOf(prev);
        if (realGap > columnGap) text += "\t";                        // column or wide tab stop
        else if (realGap > prev.size * 0.18 || it.kern < -170) {
          if (!/\s$/.test(text) && !/^\s/.test(it.text)) text += " ";
        }
      }
      text += it.text;
      prev = it;
    }
    out.push({ y: line.y, text: text.replace(/[ \t]+$/, "") });
  }

  /* Paragraph breaks come from vertical rhythm: a gap noticeably
     bigger than the usual line spacing ends a paragraph. */
  const gaps = [];
  for (let i = 1; i < out.length; i++) gaps.push(Math.abs(out[i - 1].y - out[i].y));
  const typical = median(gaps.filter((g) => g > 0.5)) || 12;

  let text = "";
  for (let i = 0; i < out.length; i++) {
    if (i > 0) text += Math.abs(out[i - 1].y - out[i].y) > typical * 1.6 ? "\n\n" : "\n";
    text += out[i].text;
  }
  return text;
}

const median = (arr) => {
  if (!arr.length) return 0;
  const s = arr.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/* De-hyphenate across line breaks and tidy the whitespace. */
function tidy(text) {
  return text
    .replace(/ /g, "")
    .replace(/([A-Za-zÀ-ɏ])-\n([a-zÀ-ɏ])/g, "$1$2")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/ {2,}/g, " ")
    .replace(/ﬀ/g, "ff").replace(/ﬁ/g, "fi").replace(/ﬂ/g, "fl")
    .replace(/ﬃ/g, "ffi").replace(/ﬄ/g, "ffl")
    .trim();
}

/* Drop the running head and footer that otherwise appear on every page
   and pollute every summary and every retrieved chunk. */
function stripRunningHeads(pages) {
  if (pages.length < 4) return pages;
  const seen = new Map();
  for (const p of pages) {
    for (const line of [p.lines[0], p.lines[p.lines.length - 1]]) {
      if (!line || line.length > 90) continue;
      const key = line.replace(/\d+/g, "#");
      seen.set(key, (seen.get(key) || 0) + 1);
    }
  }
  const drop = new Set([...seen].filter(([, n]) => n >= Math.max(3, pages.length * 0.6)).map(([l]) => l));
  if (!drop.size) return pages;
  return pages.map((p) => ({
    ...p,
    lines: p.lines.filter((l, i) => !((i === 0 || i === p.lines.length - 1) && drop.has(l.replace(/\d+/g, "#")))),
  }));
}

/* ---- the entry point ---------------------------------------------- */

export function extractPdf(buffer, { maxPages = 2000 } = {}) {
  const doc = new PdfDocument(buffer);
  const pageObjs = doc.pages();
  const warnings = [...doc.warnings];
  const out = [];

  const limit = Math.min(pageObjs.length, maxPages);
  for (let i = 0; i < limit; i++) {
    const { dict, inherited } = pageObjs[i];
    let content = "";
    const contents = doc.resolve(dict.Contents);
    const parts = Array.isArray(contents) ? contents : [dict.Contents];
    for (const part of parts) {
      if (part instanceof Ref) {
        try { content += doc.streamData(part.num).toString("latin1") + "\n"; }
        catch { /* skip this piece */ }
      }
    }
    const resources = doc.resolve(dict.Resources !== undefined ? dict.Resources : inherited.Resources) || {};
    let runs = [];
    if (content) {
      try { runs = runsFromContent(doc, content, resources, new Map()); }
      catch (e) { warnings.push(`page ${i + 1}: ${e.message}`); }
    }
    const text = tidy(layout(runs));
    out.push({ number: i + 1, lines: text ? text.split("\n") : [] });
  }

  const pages = stripRunningHeads(out).map((p) => ({ number: p.number, text: tidy(p.lines.join("\n")) }));

  const chars = pages.reduce((n, p) => n + p.text.length, 0);
  const empty = pages.filter((p) => p.text.length < 20).length;
  if (!pages.length) warnings.push("no pages found — is this really a PDF?");
  else if (chars < pages.length * 40)
    warnings.push(
      "almost no text came out, which is what a scan looks like: the pages are pictures of words. " +
      "Run it through OCR first (ocrmypdf in.pdf out.pdf) and add the result instead."
    );
  else if (empty > pages.length * 0.4)
    warnings.push(`${empty} of ${pages.length} pages have no text layer — probably scanned plates or figures`);

  return { pages, info: doc.info(), warnings, encrypted: doc.encrypted };
}

export default extractPdf;
