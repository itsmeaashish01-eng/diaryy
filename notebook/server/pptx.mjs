/* ================================================
   MARGINALIA — server/pptx.mjs
   Writing PowerPoint by hand.

   A .pptx is a zip of XML parts that reference each other through
   relationship files. Written out directly there is no dependency, no
   template to keep in sync, and — the part that matters here — the
   diagram arrives as real shapes with real text rather than a
   screenshot. A reader can select the words in a box, recolour it, or
   drag it somewhere better, which is what people do with slides.

   Every shape is positioned absolutely on a blank layout. That avoids
   the whole placeholder-inheritance machinery, which is where hand-
   written decks usually go wrong and refuse to open.

   Units are EMU: 914400 to the inch, 12700 to the point. The slide is
   13.333 by 7.5 inches, which is 16:9.
   ================================================ */

import { zip, escapeXML as esc } from "./zip.mjs";

const EMU = 914400;
const PT = 12700;
const W = Math.round(13.333 * EMU);
const H = Math.round(7.5 * EMU);

/* One restrained palette, used by the slides and by the diagram so a
   deck looks like one thing. */
const INK = "1C1A17";
const MUTED = "6B6862";
const RULE = "D9D4C9";
const ACCENT = "7A4B2A";
const PAPER = "FBFAF7";

const ROLE_FILL = {
  start: "E6F2EA", end: "F6E7E3", decision: "F8F0D8",
  concept: "E9EEF8", evidence: "E4F0F2", objection: "F7E4EE", step: "FFFFFF",
};

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';

let shapeId = 1;
const nextId = () => ++shapeId;

/* ---- pieces of a slide ---------------------------------------------- */

function run(text, { size = 18, bold = false, italic = false, color = INK, face = "Georgia" } = {}) {
  return (
    `<a:r><a:rPr lang="en-US" sz="${Math.round(size * 100)}" b="${bold ? 1 : 0}" i="${italic ? 1 : 0}" dirty="0">` +
    `<a:solidFill><a:srgbClr val="${color}"/></a:solidFill>` +
    `<a:latin typeface="${face}"/><a:cs typeface="${face}"/></a:rPr>` +
    `<a:t>${esc(text)}</a:t></a:r>`
  );
}

function para(runs, { bullet = false, align = "l", space = 600, indent = 0 } = {}) {
  const bulletXML = bullet
    ? `<a:buFont typeface="Arial"/><a:buChar char="•"/>`
    : `<a:buNone/>`;
  return (
    `<a:p><a:pPr algn="${align}" marL="${indent}" indent="${bullet ? -228600 : 0}">` +
    `<a:lnSpc><a:spcPct val="100000"/></a:lnSpc><a:spcBef><a:spcPts val="${space}"/></a:spcBef>${bulletXML}</a:pPr>` +
    `${runs.join("")}</a:p>`
  );
}

function textBox({ x, y, w, h, paragraphs, name = "Text", anchor = "t", wrap = true }) {
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${nextId()}" name="${esc(name)}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="${Math.round(x)}" y="${Math.round(y)}"/><a:ext cx="${Math.round(w)}" cy="${Math.round(h)}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>` +
    `<p:txBody><a:bodyPr wrap="${wrap ? "square" : "none"}" anchor="${anchor}" lIns="0" tIns="0" rIns="0" bIns="0">` +
    `<a:normAutofit/></a:bodyPr><a:lstStyle/>${paragraphs.join("")}</p:txBody></p:sp>`
  );
}

function shape({ x, y, w, h, fill, line = RULE, dash = false, radius = false, paragraphs = [], width = 1 }) {
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${nextId()}" name="Box"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="${Math.round(x)}" y="${Math.round(y)}"/><a:ext cx="${Math.round(w)}" cy="${Math.round(h)}"/></a:xfrm>` +
    `<a:prstGeom prst="${radius ? "roundRect" : "rect"}"><a:avLst/></a:prstGeom>` +
    `<a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>` +
    `<a:ln w="${Math.round(width * PT)}"><a:solidFill><a:srgbClr val="${line}"/></a:solidFill>` +
    `${dash ? '<a:prstDash val="dash"/>' : ""}</a:ln></p:spPr>` +
    `<p:txBody><a:bodyPr wrap="square" anchor="ctr" lIns="45720" tIns="27432" rIns="45720" bIns="27432"><a:normAutofit/></a:bodyPr>` +
    `<a:lstStyle/>${paragraphs.length ? paragraphs.join("") : "<a:p/>"}</p:txBody></p:sp>`
  );
}

/* A straight segment. Multi-point edges become several of these; the
   last one carries the arrowhead. */
function line({ x1, y1, x2, y2, arrow = false, dash = false, color = MUTED }) {
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  const cx = Math.max(Math.abs(x2 - x1), 1);
  const cy = Math.max(Math.abs(y2 - y1), 1);
  const flipH = x2 < x1 ? ' flipH="1"' : "";
  const flipV = y2 < y1 ? ' flipV="1"' : "";
  return (
    `<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="${nextId()}" name="Connector"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr>` +
    `<p:spPr><a:xfrm${flipH}${flipV}><a:off x="${Math.round(x)}" y="${Math.round(y)}"/><a:ext cx="${Math.round(cx)}" cy="${Math.round(cy)}"/></a:xfrm>` +
    `<a:prstGeom prst="line"><a:avLst/></a:prstGeom>` +
    `<a:ln w="${Math.round(1.25 * PT)}"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill>` +
    `${dash ? '<a:prstDash val="dash"/>' : ""}${arrow ? '<a:tailEnd type="triangle" w="med" len="med"/>' : ""}</a:ln>` +
    `</p:spPr></p:cxnSp>`
  );
}

const slideXML = (shapes) =>
  XML +
  `<p:sld ${NS}><p:cSld><p:spTree>` +
  `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
  `<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>` +
  shapes.join("") +
  `</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;

/* ---- the slides themselves ------------------------------------------ */

const MARGIN = Math.round(0.9 * EMU);
const CONTENT_W = W - MARGIN * 2;

function titleSlide(deck) {
  const shapes = [
    shape({ x: MARGIN, y: Math.round(2.6 * EMU), w: Math.round(1.1 * EMU), h: 3 * PT, fill: ACCENT, line: ACCENT }),
    textBox({
      x: MARGIN, y: Math.round(2.9 * EMU), w: CONTENT_W, h: Math.round(1.6 * EMU),
      name: "Title",
      paragraphs: [para([run(deck.title, { size: 40, bold: true })], { space: 0 })],
    }),
    textBox({
      x: MARGIN, y: Math.round(4.5 * EMU), w: CONTENT_W, h: Math.round(1.2 * EMU),
      name: "Subtitle",
      paragraphs: [
        para([run(deck.subtitle || "", { size: 18, color: MUTED, italic: true })], { space: 0 }),
        para([run(deck.sourceLine || "", { size: 12, color: MUTED })], { space: 400 }),
      ],
    }),
  ];
  return slideXML(shapes);
}

function contentSlide(slide, index, total) {
  const shapes = [];
  shapes.push(
    textBox({
      x: MARGIN, y: Math.round(0.62 * EMU), w: CONTENT_W, h: Math.round(0.9 * EMU),
      name: "Heading",
      paragraphs: [para([run(slide.title, { size: 26, bold: true })], { space: 0 })],
    }),
    shape({ x: MARGIN, y: Math.round(1.45 * EMU), w: CONTENT_W, h: 1 * PT, fill: RULE, line: RULE })
  );

  if (slide.diagram) {
    shapes.push(...diagramShapes(slide.diagram, {
      x: MARGIN, y: Math.round(1.75 * EMU), w: CONTENT_W, h: Math.round(4.7 * EMU),
    }));
  } else {
    const paragraphs = [];
    for (const bullet of slide.bullets || []) {
      const text = typeof bullet === "string" ? bullet : bullet.text;
      const cite = typeof bullet === "string" ? "" : bullet.cite || "";
      paragraphs.push(
        para(
          [run(text, { size: 17 }), ...(cite ? [run(`  ${cite}`, { size: 11, color: MUTED })] : [])],
          { bullet: true, indent: 228600, space: 900 }
        )
      );
    }
    if (slide.quote) {
      paragraphs.push(para([run(`“${slide.quote}”`, { size: 15, italic: true, color: MUTED })], { space: 1200, indent: 228600 }));
    }
    shapes.push(
      textBox({
        x: MARGIN, y: Math.round(1.85 * EMU), w: CONTENT_W, h: Math.round(4.4 * EMU),
        name: "Body", paragraphs,
      })
    );
  }

  shapes.push(
    textBox({
      x: MARGIN, y: Math.round(6.75 * EMU), w: CONTENT_W, h: Math.round(0.35 * EMU),
      name: "Footer",
      paragraphs: [para([run(`${index} / ${total}`, { size: 10, color: MUTED })], { space: 0, align: "r" })],
    })
  );
  return slideXML(shapes);
}

/* The diagram, scaled from the layout's pixels into the space left on
   the slide, as shapes and connectors rather than a picture. */
function diagramShapes(diagram, box) {
  const l = diagram.layout;
  if (!l || !l.nodes.length) return [];
  const scale = Math.min(box.w / (l.width || 1), box.h / (l.height || 1));
  const offX = box.x + (box.w - l.width * scale) / 2;
  const offY = box.y + (box.h - l.height * scale) / 2;
  const px = (v) => v * scale;
  const shapes = [];

  for (const e of l.edges) {
    for (let i = 1; i < e.points.length; i++) {
      shapes.push(line({
        x1: offX + px(e.points[i - 1].x), y1: offY + px(e.points[i - 1].y),
        x2: offX + px(e.points[i].x), y2: offY + px(e.points[i].y),
        arrow: i === e.points.length - 1,
        dash: Boolean(e.inferred),
      }));
    }
    if (e.label) {
      shapes.push(textBox({
        x: offX + px(e.labelAt.x) - px(60), y: offY + px(e.labelAt.y) - px(16),
        w: px(120), h: px(16),
        name: "Edge label",
        paragraphs: [para([run(e.label, { size: 9, color: MUTED })], { space: 0, align: "ctr" })],
      }));
    }
  }

  for (const n of l.nodes) {
    const dashed = n.verdict === "unsupported" || n.verdict === "uncited";
    shapes.push(shape({
      x: offX + px(n.x), y: offY + px(n.y), w: px(n.w), h: px(n.h),
      fill: ROLE_FILL[n.role] || ROLE_FILL.step,
      line: dashed ? "C2512F" : n.verdict === "weak" ? "B08328" : RULE,
      dash: dashed,
      radius: true,
      width: dashed ? 1.5 : 1,
      paragraphs: [para([run(n.label, { size: Math.max(9, Math.min(13, 13 * scale * 1.2)) })], { space: 0, align: "ctr" })],
    }));
  }
  return shapes;
}

/* Speaker notes. This is where the citations live in full, so the
   person talking can answer "where does that come from?". */
function notesXML(text) {
  return (
    XML +
    `<p:notes ${NS}><p:cSld><p:spTree>` +
    `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
    `<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>` +
    `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Notes Placeholder"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>` +
    `<p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/>` +
    `<p:txBody><a:bodyPr/><a:lstStyle/>` +
    String(text || "")
      .split(/\n+/)
      .map((t) => `<a:p><a:r><a:rPr lang="en-US" dirty="0"/><a:t>${esc(t)}</a:t></a:r></a:p>`)
      .join("") +
    `</p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`
  );
}

/* ---- the fixed parts ------------------------------------------------- */

const THEME = XML +
  `<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Marginalia">` +
  `<a:themeElements><a:clrScheme name="Marginalia">` +
  `<a:dk1><a:srgbClr val="${INK}"/></a:dk1><a:lt1><a:srgbClr val="${PAPER}"/></a:lt1>` +
  `<a:dk2><a:srgbClr val="3A3630"/></a:dk2><a:lt2><a:srgbClr val="EFEBE2"/></a:lt2>` +
  `<a:accent1><a:srgbClr val="${ACCENT}"/></a:accent1><a:accent2><a:srgbClr val="4A6B7C"/></a:accent2>` +
  `<a:accent3><a:srgbClr val="6B7A4A"/></a:accent3><a:accent4><a:srgbClr val="8A6B3A"/></a:accent4>` +
  `<a:accent5><a:srgbClr val="7C4A6B"/></a:accent5><a:accent6><a:srgbClr val="4A7C6B"/></a:accent6>` +
  `<a:hlink><a:srgbClr val="2A5B8A"/></a:hlink><a:folHlink><a:srgbClr val="6B5A8A"/></a:folHlink></a:clrScheme>` +
  `<a:fontScheme name="Marginalia"><a:majorFont><a:latin typeface="Georgia"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>` +
  `<a:minorFont><a:latin typeface="Georgia"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>` +
  `<a:fmtScheme name="Marginalia">` +
  `<a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>` +
  `<a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="15875"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="25400"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>` +
  `<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>` +
  `<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>` +
  `</a:fmtScheme></a:themeElements></a:theme>`;

const SLIDE_MASTER = XML +
  `<p:sldMaster ${NS}><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="${PAPER}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>` +
  `<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
  `<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>` +
  `</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>` +
  `<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>`;

const SLIDE_LAYOUT = XML +
  `<p:sldLayout ${NS} type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>` +
  `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
  `<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>` +
  `</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;

const NOTES_MASTER = XML +
  `<p:notesMaster ${NS}><p:cSld><p:spTree>` +
  `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
  `<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>` +
  `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Notes Placeholder"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>` +
  `<p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>` +
  `<p:spPr><a:xfrm><a:off x="685800" y="2360930"/><a:ext cx="5486400" cy="4180840"/></a:xfrm>` +
  `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>` +
  `<p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody></p:sp>` +
  `</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:notesMaster>`;

const rels = (items) =>
  XML +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  items.map((r) => `<Relationship Id="${r.id}" Type="${r.type}" Target="${r.target}"/>`).join("") +
  `</Relationships>`;

const REL = {
  slide: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide",
  slideMaster: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster",
  slideLayout: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout",
  notesMaster: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster",
  notesSlide: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide",
  theme: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme",
  officeDocument: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument",
  coreProps: "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties",
  extendedProps: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties",
};

/* ---- assembly -------------------------------------------------------- */

export function buildDeck(deck) {
  shapeId = 1;
  const slides = [titleSlide(deck), ...deck.slides.map((s, i) => contentSlide(s, i + 2, deck.slides.length + 1))];
  const notes = ["", ...deck.slides.map((s) => s.notes || "")];
  const count = slides.length;

  const parts = [];
  const overrides = [];
  const add = (name, data, contentType) => {
    parts.push({ name, data });
    if (contentType) overrides.push(`<Override PartName="/${name}" ContentType="${contentType}"/>`);
  };

  /* Slides and their notes, each with the relationship file that ties
     it to the layout (and to its notes page). */
  const presentationRels = [{ id: "rId1", type: REL.slideMaster, target: "slideMasters/slideMaster1.xml" }];
  const slideIds = [];
  slides.forEach((xml, i) => {
    const n = i + 1;
    add(`ppt/slides/slide${n}.xml`, xml, "application/vnd.openxmlformats-officedocument.presentationml.slide+xml");
    const slideRels = [{ id: "rId1", type: REL.slideLayout, target: "../slideLayouts/slideLayout1.xml" }];
    if (notes[i]) {
      slideRels.push({ id: "rId2", type: REL.notesSlide, target: `../notesSlides/notesSlide${n}.xml` });
      add(`ppt/notesSlides/notesSlide${n}.xml`, notesXML(notes[i]), "application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml");
      add(`ppt/notesSlides/_rels/notesSlide${n}.xml.rels`, rels([
        { id: "rId1", type: REL.notesMaster, target: "../notesMasters/notesMaster1.xml" },
        { id: "rId2", type: REL.slide, target: `../slides/slide${n}.xml` },
      ]));
    }
    add(`ppt/slides/_rels/slide${n}.xml.rels`, rels(slideRels));
    const rId = `rId${presentationRels.length + 1}`;
    presentationRels.push({ id: rId, type: REL.slide, target: `slides/slide${n}.xml` });
    slideIds.push(`<p:sldId id="${255 + n}" r:id="${rId}"/>`);
  });

  presentationRels.push(
    { id: `rId${presentationRels.length + 1}`, type: REL.notesMaster, target: "notesMasters/notesMaster1.xml" },
    { id: `rId${presentationRels.length + 2}`, type: REL.theme, target: "theme/theme1.xml" }
  );

  const presentation = XML +
    `<p:presentation ${NS} saveSubsetFonts="1">` +
    `<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>` +
    `<p:notesMasterIdLst><p:notesMasterId r:id="rId${count + 2}"/></p:notesMasterIdLst>` +
    `<p:sldIdLst>${slideIds.join("")}</p:sldIdLst>` +
    `<p:sldSz cx="${W}" cy="${H}"/><p:notesSz cx="${H}" cy="${W}"/></p:presentation>`;

  add("ppt/presentation.xml", presentation, "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml");
  add("ppt/_rels/presentation.xml.rels", rels(presentationRels));
  add("ppt/slideMasters/slideMaster1.xml", SLIDE_MASTER, "application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml");
  add("ppt/slideMasters/_rels/slideMaster1.xml.rels", rels([
    { id: "rId1", type: REL.slideLayout, target: "../slideLayouts/slideLayout1.xml" },
    { id: "rId2", type: REL.theme, target: "../theme/theme1.xml" },
  ]));
  add("ppt/slideLayouts/slideLayout1.xml", SLIDE_LAYOUT, "application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml");
  add("ppt/slideLayouts/_rels/slideLayout1.xml.rels", rels([
    { id: "rId1", type: REL.slideMaster, target: "../slideMasters/slideMaster1.xml" },
  ]));
  add("ppt/notesMasters/notesMaster1.xml", NOTES_MASTER, "application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml");
  add("ppt/notesMasters/_rels/notesMaster1.xml.rels", rels([{ id: "rId1", type: REL.theme, target: "../theme/theme1.xml" }]));
  add("ppt/theme/theme1.xml", THEME, "application/vnd.openxmlformats-officedocument.theme+xml");

  const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  add("docProps/core.xml",
    XML +
    `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ` +
    `xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ` +
    `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
    `<dc:title>${esc(deck.title)}</dc:title><dc:creator>Marginalia</dc:creator>` +
    `<cp:lastModifiedBy>Marginalia</cp:lastModifiedBy>` +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>` +
    `<dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`,
    "application/vnd.openxmlformats-package.core-properties+xml");
  add("docProps/app.xml",
    XML +
    `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" ` +
    `xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">` +
    `<Application>Marginalia</Application><Slides>${count}</Slides><Company></Company></Properties>`,
    "application/vnd.openxmlformats-officedocument.extended-properties+xml");
  add("_rels/.rels", rels([
    { id: "rId1", type: REL.officeDocument, target: "ppt/presentation.xml" },
    { id: "rId2", type: REL.coreProps, target: "docProps/core.xml" },
    { id: "rId3", type: REL.extendedProps, target: "docProps/app.xml" },
  ]));

  const contentTypes = XML +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    overrides.join("") +
    `</Types>`;

  /* [Content_Types].xml has to be the first entry in the archive. */
  return zip([{ name: "[Content_Types].xml", data: contentTypes }, ...parts]);
}

export const slideSize = { width: W, height: H };
