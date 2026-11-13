/* ================================================
   EVIDENCE DESK — docx.js
   A note, as a Word document.

   A .docx is a zip of a few XML files, and that is all this writes: no
   library, because this repo has no build step to bundle one. The zip is
   "stored" — not compressed — which keeps the writer to a checksum and
   three kinds of header. A note is a few kilobytes either way.

   Everything from the page goes through esc() on its way into the XML,
   and a link is only written as a link if safeUrl() passed it. A
   reference titled <w:p> has to arrive in Word as those five characters.

   The layout follows the note on screen: summary, the tree as indented
   shaded rows with the word (IF, DO, CAUTION) on each so it survives a
   black-and-white printer, the verdict, the reading list with tick boxes.
   ================================================ */
(function (EV) {
  "use strict";
  const { safeUrl } = EV.util;

  /* ---- zip ---------------------------------------------------------- */

  const CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  /* files: [{ name, text }]. Names are plain ASCII, so no flags needed. */
  function zip(files) {
    const enc = new TextEncoder();
    const parts = [];
    const central = [];
    let offset = 0;
    const header = (sig, len) => {
      const b = new Uint8Array(len);
      const v = new DataView(b.buffer);
      v.setUint32(0, sig, true);
      return { b, v };
    };

    for (const f of files) {
      const name = enc.encode(f.name);
      const data = enc.encode(f.text);
      const sum = crc32(data);

      const local = header(0x04034b50, 30);
      local.v.setUint16(4, 20, true);            // version needed
      local.v.setUint16(12, 0x21, true);         // date: 1980-01-01, a fixed stamp so the same note is the same file
      local.v.setUint32(14, sum, true);
      local.v.setUint32(18, data.length, true);
      local.v.setUint32(22, data.length, true);
      local.v.setUint16(26, name.length, true);
      parts.push(local.b, name, data);

      const cen = header(0x02014b50, 46);
      cen.v.setUint16(4, 20, true);
      cen.v.setUint16(6, 20, true);
      cen.v.setUint16(14, 0x21, true);
      cen.v.setUint32(16, sum, true);
      cen.v.setUint32(20, data.length, true);
      cen.v.setUint32(24, data.length, true);
      cen.v.setUint16(28, name.length, true);
      cen.v.setUint32(42, offset, true);
      central.push(cen.b, name);

      offset += 30 + name.length + data.length;
    }

    const centralSize = central.reduce((n, b) => n + b.length, 0);
    const end = header(0x06054b50, 22);
    end.v.setUint16(8, files.length, true);
    end.v.setUint16(10, files.length, true);
    end.v.setUint32(12, centralSize, true);
    end.v.setUint32(16, offset, true);

    const all = [...parts, ...central, end.b];
    const out = new Uint8Array(all.reduce((n, b) => n + b.length, 0));
    let at = 0;
    for (const b of all) { out.set(b, at); at += b.length; }
    return out;
  }

  /* ---- xml ---------------------------------------------------------- */

  /* Also drops the control characters XML forbids outright — one of
     those in a pasted page and Word refuses to open the file at all. */
  const esc = (s) => String(s == null ? "" : s)
    .replace(/[^\u0009\u000A\u000D -퟿-�\u{10000}-\u{10FFFF}]/gu, "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

  function run(text, o) {
    const p = o || {};
    const props =
      (p.b ? "<w:b/>" : "") + (p.i ? "<w:i/>" : "") +
      (p.color ? `<w:color w:val="${p.color}"/>` : "") +
      (p.size ? `<w:sz w:val="${p.size}"/>` : "") +
      (p.u ? '<w:u w:val="single"/>' : "");
    return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
  }

  function para(runs, o) {
    const p = o || {};
    const props =
      (p.style ? `<w:pStyle w:val="${p.style}"/>` : "") +
      (p.keep ? "<w:keepNext/>" : "") +
      (p.shade ? `<w:shd w:val="clear" w:color="auto" w:fill="${p.shade}"/>` : "") +
      (p.after != null ? `<w:spacing w:after="${p.after}"/>` : "") +
      (p.left || p.hanging ? `<w:ind w:left="${p.left || 0}"${p.hanging ? ` w:hanging="${p.hanging}"` : ""}/>` : "");
    return `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ""}${[].concat(runs).join("")}</w:p>`;
  }

  const STYLES = HEAD + `<w:styles ${W}>` +
    '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>' +
    '<w:sz w:val="22"/><w:lang w:val="en-GB"/></w:rPr></w:rPrDefault>' +
    '<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/>' +
    '<w:pPr><w:spacing w:after="80"/></w:pPr><w:rPr><w:b/><w:sz w:val="40"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>' +
    '<w:pPr><w:keepNext/><w:spacing w:before="320" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr>' +
    '<w:rPr><w:b/><w:color w:val="8A4A28"/><w:sz w:val="28"/></w:rPr></w:style>' +
    "</w:styles>";

  const TYPES = HEAD + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
    "</Types>";

  const REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
  const REL_DOC = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const ROOT_RELS = HEAD + `<Relationships xmlns="${REL_NS}">` +
    `<Relationship Id="rId1" Type="${REL_DOC}/officeDocument" Target="word/document.xml"/></Relationships>`;

  /* ---- the note ----------------------------------------------------- */

  const NODE = {
    question: { word: "QUESTION", fill: "F6ECE4", ink: "8A4A28" },
    if:       { word: "IF",       fill: "F2EDE5", ink: "5F5142" },
    do:       { word: "DO",       fill: "E3F4E3", ink: "006300" },
    caution:  { word: "CAUTION",  fill: "FBE4E4", ink: "A52020" },
    finding:  { word: "EVIDENCE", fill: "E3EDFA", ink: "1F5FAE" },
  };
  const GRADE = { strong: "Strong", moderate: "Moderate", limited: "Limited", weak: "Weak", none: "None" };

  function build(note, when) {
    const a = note.analysis;
    const body = [];
    const links = [];   // external targets, written to the relationships part
    const link = (url, text, size) => {
      const safe = safeUrl(url);
      if (!safe) return run(text, { size });
      links.push(safe);
      return `<w:hyperlink r:id="rId${links.length + 1}" w:history="1">${run(text, { color: "0563C1", u: true, size })}</w:hyperlink>`;
    };
    const heading = (t) => body.push(para(run(t), { style: "Heading1" }));
    const bullets = (items) => items.forEach((s) =>
      body.push(para([run("•  "), run(s)], { left: 360, hanging: 360 })));

    body.push(para(run(a.question), { style: "Title" }));
    body.push(para([
      run((when ? when + "  ·  " : "") + "Source: ", { color: "6B5D4D", size: 18 }),
      note.source && note.source.url
        ? link(note.source.url, note.source.host || note.source.url, 18)
        : run("pasted text", { color: "6B5D4D", size: 18 }),
      run("  ·  " + (a.by === "claude" ? "Written by Claude from the page" : "Sentences picked from the page, not rewritten"),
        { color: "6B5D4D", size: 18 }),
    ]));

    if (a.summary.length) { heading("Summary"); bullets(a.summary); }
    if (a.findings.length) { heading("Key numbers"); bullets(a.findings); }

    if (a.tree.children.length) {
      heading("Decision tree");
      const row = (node, depth) => {
        const k = NODE[node.kind] || NODE.if;
        const cites = node.cites && node.cites.length ? "  [" + node.cites.join(", ") + "]" : "";
        body.push(para([
          run(k.word + "   ", { b: true, color: k.ink, size: 18 }),
          run(node.text, node.kind === "question" ? { b: true } : null),
          cites ? run(cites, { color: "6B5D4D", size: 18 }) : "",
        ], { shade: k.fill, left: depth * 420 + 80, after: 60, keep: Boolean(node.children && node.children.length) }));
        (node.children || []).forEach((c) => row(c, depth + 1));
      };
      row(a.tree, 0);
      body.push(para(run("Built from what the page says. A map of where to look, not a protocol — check each branch against its paper.",
        { i: true, color: "6B5D4D", size: 18 })));
    }

    heading("How far to lean on this");
    a.appraisal.steps.forEach((s, i) =>
      body.push(para([run(`${i + 1}. ${s.q}  `), run(s.yes ? "Yes" : "No", { b: true })], { after: 40 })));
    body.push(para([
      run((GRADE[a.appraisal.grade] || "") + " — " + a.appraisal.label + ". ", { b: true }),
      run(a.appraisal.verdict),
    ], { shade: "F2EDE5", left: 80 }));

    if (a.gaps && a.gaps.length) { heading("What this does not answer"); bullets(a.gaps); }

    if (a.reading.length) {
      heading("Reading list");
      a.reading.forEach((item, i) => {
        const r = a.refs.find((x) => x.n === item.n);
        if (!r) return;
        const done = Boolean(note.read && note.read[r.n]);
        body.push(para([run(`${i + 1}.  ${done ? "☑" : "☐"}  `), link(r.url, r.title)],
          { left: 720, hanging: 720, after: 20, keep: true }));
        body.push(para(run([r.kindLabel, r.year, r.host, "ref " + r.n].filter(Boolean).join("  ·  ") + " — " + item.why,
          { color: "6B5D4D", size: 18 }), { left: 720 }));
      });
    }

    heading("My notes");
    const mine = String(note.mine || "").trim();
    if (mine) mine.split(/\n/).forEach((line) => body.push(para(run(line))));
    else body.push(para(run("")), para(run("")), para(run("")));

    body.push(para(run("A study aid. It organises what a page said; it does not check that the page was right.",
      { i: true, color: "6B5D4D", size: 16 })));

    const doc = HEAD + `<w:document ${W} ${R}><w:body>${body.join("")}` +
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
      '<w:pgMar w:top="1304" w:right="1304" w:bottom="1304" w:left="1304" w:header="708" w:footer="708" w:gutter="0"/>' +
      "</w:sectPr></w:body></w:document>";

    const docRels = HEAD + `<Relationships xmlns="${REL_NS}">` +
      `<Relationship Id="rId1" Type="${REL_DOC}/styles" Target="styles.xml"/>` +
      links.map((u, i) => `<Relationship Id="rId${i + 2}" Type="${REL_DOC}/hyperlink" Target="${esc(u)}" TargetMode="External"/>`).join("") +
      "</Relationships>";

    return zip([
      { name: "[Content_Types].xml", text: TYPES },
      { name: "_rels/.rels", text: ROOT_RELS },
      { name: "word/document.xml", text: doc },
      { name: "word/styles.xml", text: STYLES },
      { name: "word/_rels/document.xml.rels", text: docRels },
    ]);
  }

  /* A name Finder and Windows will both accept, from the question. */
  function fileName(note) {
    const stem = String(note.analysis.question || "note").toLowerCase()
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60).replace(/-$/, "");
    return (stem || "evidence-note") + ".docx";
  }

  const MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  EV.docx = { build, fileName, zip, crc32, esc, MIME };
})(window.EV);
