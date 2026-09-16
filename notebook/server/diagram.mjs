/* ================================================
   MARGINALIA — server/diagram.mjs
   Diagrams that can be checked against the page they came from.

   A diagram is the most confident thing a model can produce. Boxes and
   arrows look settled in a way prose does not, and nobody reads a
   flowchart sceptically. That is exactly why every node here has to
   carry a quotation and a page, and why the quotation is checked
   before the diagram is drawn. A node whose evidence isn't in the
   sources still appears — dropping it would hide the disagreement —
   but it appears dashed, with the reason underneath.

   Layout is done here rather than by a drawing library so that the
   same coordinates can be used by the SVG in the browser and by the
   native shapes in the exported PowerPoint. One layout, three
   renderings, no second opinion about where a box goes.
   ================================================ */

import { json } from "./ollama.mjs";
import { systemFor, verifyEvidence } from "./grounding.mjs";

export const KINDS = {
  flowchart: {
    label: "Flowchart",
    ask: "the process the sources describe, step by step, in the order it happens",
    edgeVerb: "leads to",
  },
  concept: {
    label: "Concept map",
    ask: "the concepts and how they relate — what depends on what, what is a kind of what",
    edgeVerb: "relates to",
  },
  architecture: {
    label: "Architecture",
    ask: "the components of the system and what passes between them",
    edgeVerb: "sends to",
  },
  timeline: {
    label: "Timeline",
    ask: "the events in the order they happened, with dates where the sources give them",
    edgeVerb: "then",
  },
  argument: {
    label: "Argument",
    ask: "the claims, the evidence offered for each, and the objections raised",
    edgeVerb: "supports",
  },
  compare: {
    label: "Comparison",
    ask: "the things being compared and the dimensions they are compared on",
    edgeVerb: "differs in",
  },
};

/* A schema, not a request. Ollama constrains sampling to it, so the
   reply is always shaped like this — the only thing left to check is
   whether the contents are true. */
export const SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    nodes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          label: { type: "string" },
          detail: { type: "string" },
          role: { type: "string", enum: ["start", "step", "decision", "end", "concept", "evidence", "objection"] },
          evidence: { type: "string" },
          cite: { type: "string" },
        },
        required: ["id", "label", "evidence", "cite"],
      },
    },
    edges: {
      type: "array",
      items: {
        type: "object",
        properties: {
          from: { type: "string" },
          to: { type: "string" },
          label: { type: "string" },
        },
        required: ["from", "to"],
      },
    },
    missing: { type: "string" },
  },
  required: ["title", "nodes", "edges"],
};

export function prompt({ topic, kind, context }) {
  const spec = KINDS[kind] || KINDS.flowchart;
  return [
    { role: "system", content: systemFor.diagram },
    {
      role: "user",
      content:
`Sources:
${context.manifest}

Passages:
${context.text}

Draw ${spec.ask}${topic ? `, for: ${topic}` : ""}.

Return JSON:
- title: what the diagram shows.
- summary: one sentence a reader sees under the diagram.
- nodes: 4 to 12 of them. id is a short slug ("encoder", "step-3"). label is at most six words. detail is one clarifying sentence or "". role is one of start, step, decision, end, concept, evidence, objection.
- Every node needs evidence: a quotation of 5 to 25 words copied WORD FOR WORD from the passages above, and cite: the exact label of the passage it came from, like [S1:p4].
- edges: from and to are node ids that exist. label says what the arrow means ("${spec.edgeVerb}", "if yes", "produces") or "".
- missing: name anything the sources do not cover that a reader of this diagram would expect. "" if nothing.

If the passages only support four nodes, return four. A short honest diagram is the goal.`,
    },
  ];
}

export async function build({ topic, kind = "flowchart", context, model, signal }) {
  const { value, raw } = await json(prompt({ topic, kind, context }), { model, schema: SCHEMA, signal, context: 8192 });
  if (!value || !Array.isArray(value.nodes) || !value.nodes.length) {
    const e = new Error("the model did not return a diagram — try again, or pick a smaller topic");
    e.status = 502;
    e.detail = String(raw || "").slice(0, 500);
    throw e;
  }
  return normalise(value, { kind, context });
}

/* Clean up what came back: unique ids, edges that point at nodes that
   exist, no self-loops, and every node's evidence checked against the
   passage it cites. */
export function normalise(value, { kind, context }) {
  const seen = new Set();
  let nodes = [];
  for (const n of value.nodes) {
    let id = slug(n.id || n.label);
    if (!id) continue;
    if (seen.has(id)) {
      let k = 2;
      while (seen.has(`${id}-${k}`)) k++;
      id = `${id}-${k}`;
    }
    seen.add(id);
    nodes.push({
      id,
      label: String(n.label || id).trim().slice(0, 70),
      detail: String(n.detail || "").trim().slice(0, 200),
      role: ROLES.has(n.role) ? n.role : "step",
      evidence: String(n.evidence || "").trim(),
      cite: String(n.cite || "").trim(),
    });
  }
  nodes = verifyEvidence(nodes, { blocks: context.blocks });

  const ids = new Set(nodes.map((n) => n.id));
  const edgeSeen = new Set();
  const edges = [];
  for (const e of value.edges || []) {
    const from = slug(e.from);
    const to = slug(e.to);
    if (!ids.has(from) || !ids.has(to) || from === to) continue;
    const key = `${from}>${to}`;
    if (edgeSeen.has(key)) continue;
    edgeSeen.add(key);
    edges.push({ from, to, label: String(e.label || "").trim().slice(0, 40) });
  }

  /* An unconnected node in a flowchart is usually a step the model
     forgot to wire up; chain the orphans to the nearest neighbour in
     document order rather than leaving them floating. */
  if (kind === "flowchart" || kind === "timeline") {
    for (let i = 1; i < nodes.length; i++) {
      const id = nodes[i].id;
      const connected = edges.some((e) => e.to === id || e.from === id);
      if (!connected) edges.push({ from: nodes[i - 1].id, to: id, label: "", inferred: true });
    }
  }

  const graph = {
    kind,
    title: String(value.title || "Diagram").trim().slice(0, 120),
    summary: String(value.summary || "").trim().slice(0, 300),
    missing: String(value.missing || "").trim().slice(0, 300),
    nodes,
    edges,
  };
  graph.check = {
    supported: nodes.filter((n) => n.verdict === "supported").length,
    weak: nodes.filter((n) => n.verdict === "weak").length,
    unsupported: nodes.filter((n) => n.verdict === "unsupported").length,
  };
  return { ...graph, layout: layout(graph) };
}

const ROLES = new Set(["start", "step", "decision", "end", "concept", "evidence", "objection"]);
const slug = (s) => String(s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

/* ---- layout ---------------------------------------------------------- */
/*
   Layered, top to bottom. Depth comes from the longest path to a node,
   which puts every arrow downwards except the ones that genuinely loop
   back; those are drawn as curves to the side. Within a layer, nodes
   are ordered by the average position of their parents, twice, which
   is the cheap half of the standard crossing-reduction and removes
   most of the spaghetti.
*/

const CHAR = 6.6;                                        // average width of the label font at 13px
const PAD_X = 18;
const NODE_MIN = 120;
const NODE_MAX = 230;
const GAP_X = 34;
const GAP_Y = 76;

export function layout(graph, { direction = "down" } = {}) {
  const nodes = graph.nodes.map((n) => ({ ...n }));
  const index = new Map(nodes.map((n, i) => [n.id, i]));
  const edges = graph.edges.filter((e) => index.has(e.from) && index.has(e.to)).map((e) => ({ ...e }));

  /* Depth by longest path, with back edges detected and marked so the
     graph can be laid out as if it were acyclic. */
  const outgoing = new Map(nodes.map((n) => [n.id, []]));
  for (const e of edges) outgoing.get(e.from).push(e);

  const state = new Map();
  const depth = new Map(nodes.map((n) => [n.id, 0]));
  const visit = (id, d) => {
    if (state.get(id) === "open") return;                // a cycle: leave the depth alone
    if ((depth.get(id) || 0) >= d && state.get(id) === "done") return;
    depth.set(id, Math.max(depth.get(id) || 0, d));
    state.set(id, "open");
    for (const e of outgoing.get(id) || []) {
      if (state.get(e.to) === "open") { e.back = true; continue; }
      visit(e.to, d + 1);
    }
    state.set(id, "done");
  };
  const hasParent = new Set(edges.filter((e) => !e.back).map((e) => e.to));
  for (const n of nodes) if (!hasParent.has(n.id)) visit(n.id, 0);
  for (const n of nodes) if (!state.has(n.id)) visit(n.id, 0);

  const layers = [];
  for (const n of nodes) {
    const d = depth.get(n.id) || 0;
    (layers[d] = layers[d] || []).push(n);
  }

  /* Order within each layer by the mean position of the parents. */
  const positionIn = (layer, id) => layer.findIndex((n) => n.id === id);
  for (let pass = 0; pass < 2; pass++) {
    for (let d = 1; d < layers.length; d++) {
      const above = layers[d - 1];
      layers[d].sort((a, b) => bary(a) - bary(b));
      function bary(node) {
        const parents = edges.filter((e) => e.to === node.id && !e.back).map((e) => positionIn(above, e.from)).filter((p) => p >= 0);
        return parents.length ? parents.reduce((x, y) => x + y, 0) / parents.length : layers[d].indexOf(node);
      }
    }
  }

  /* Sizes, then coordinates. Labels wrap to two lines; the detail line
     is not drawn inside the box, it belongs to the tooltip and to the
     speaker notes. */
  for (const n of nodes) {
    const width = Math.min(NODE_MAX, Math.max(NODE_MIN, n.label.length * CHAR + PAD_X * 2));
    const lines = wrap(n.label, Math.floor((width - PAD_X * 2) / CHAR));
    n.w = width;
    n.lines = lines;
    n.h = Math.max(46, 22 + lines.length * 18) + (n.role === "decision" ? 10 : 0);
  }

  const rowWidth = (layer) => layer.reduce((w, n) => w + n.w + GAP_X, -GAP_X);
  const widest = Math.max(...layers.map(rowWidth), 200);
  let y = 20;
  for (const layer of layers) {
    const rowHeight = Math.max(...layer.map((n) => n.h));
    let x = 20 + (widest - rowWidth(layer)) / 2;
    for (const n of layer) {
      n.x = x;
      n.y = y + (rowHeight - n.h) / 2;
      x += n.w + GAP_X;
    }
    y += rowHeight + GAP_Y;
  }

  const width = widest + 40;
  const height = y - GAP_Y + 40;

  /* Sideways flow suits timelines: swap the axes rather than laying
     out twice. */
  if (direction === "right") {
    for (const n of nodes) { const { x, y: ny } = n; n.x = ny; n.y = x; }
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const routed = edges.map((e) => {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    return { ...e, points: route(a, b, e.back), labelAt: midpoint(a, b) };
  });

  return {
    width: direction === "right" ? height : width,
    height: direction === "right" ? width : height,
    nodes,
    edges: routed,
  };
}

function wrap(text, perLine) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    if (line && (line + " " + w).length > perLine) { lines.push(line); line = w; }
    else line = line ? `${line} ${w}` : w;
    if (lines.length === 2) break;
  }
  if (line && lines.length < 3) lines.push(line);
  return lines.length ? lines : [text];
}

/* Edges leave the bottom of a box and arrive at the top of the next,
   with a bend when the two are not aligned. A back edge goes round the
   side, which is the only way to see a loop at a glance. */
function route(a, b, back) {
  const ax = a.x + a.w / 2;
  const bx = b.x + b.w / 2;
  if (back) {
    const side = Math.max(a.x + a.w, b.x + b.w) + 30;
    return [
      { x: a.x + a.w, y: a.y + a.h / 2 },
      { x: side, y: a.y + a.h / 2 },
      { x: side, y: b.y + b.h / 2 },
      { x: b.x + b.w, y: b.y + b.h / 2 },
    ];
  }
  const downward = b.y >= a.y + a.h - 1;
  if (!downward) {
    return [
      { x: ax < bx ? a.x + a.w : a.x, y: a.y + a.h / 2 },
      { x: ax < bx ? b.x : b.x + b.w, y: b.y + b.h / 2 },
    ];
  }
  const start = { x: ax, y: a.y + a.h };
  const end = { x: bx, y: b.y };
  if (Math.abs(ax - bx) < 4) return [start, end];
  const midY = (start.y + end.y) / 2;
  return [start, { x: ax, y: midY }, { x: bx, y: midY }, end];
}

const midpoint = (a, b) => ({ x: (a.x + a.w / 2 + b.x + b.w / 2) / 2, y: (a.y + a.h + b.y) / 2 });

/* ---- exports --------------------------------------------------------- */

export function toMermaid(graph) {
  const dir = graph.kind === "timeline" ? "LR" : "TD";
  const lines = [`flowchart ${dir}`];
  for (const n of graph.nodes) {
    const label = n.label.replace(/"/g, "'");
    const shape =
      n.role === "decision" ? `{"${label}"}` :
      n.role === "start" || n.role === "end" ? `(["${label}"])` :
      `["${label}"]`;
    lines.push(`  ${n.id}${shape}`);
  }
  for (const e of graph.edges) {
    const label = e.label ? `|"${e.label.replace(/"/g, "'")}"|` : "";
    lines.push(`  ${e.from} -->${label} ${e.to}`);
  }
  return lines.join("\n");
}

/* The SVG the browser shows and the file the export button saves are
   the same string, so what you look at is what you get. */
export function toSVG(graph, { theme = "light" } = {}) {
  const l = graph.layout || layout(graph);
  const ink = theme === "dark" ? "#e8e6e1" : "#1c1a17";
  const faint = theme === "dark" ? "#6b6862" : "#a8a49c";
  const paper = theme === "dark" ? "#17161a" : "#fbfaf7";
  const fills = {
    start: theme === "dark" ? "#1f3a2e" : "#e6f2ea",
    end: theme === "dark" ? "#3a2420" : "#f6e7e3",
    decision: theme === "dark" ? "#3a3420" : "#f8f0d8",
    concept: theme === "dark" ? "#21283a" : "#e9eef8",
    evidence: theme === "dark" ? "#1e2c30" : "#e4f0f2",
    objection: theme === "dark" ? "#3a2030" : "#f7e4ee",
    step: theme === "dark" ? "#23222a" : "#ffffff",
  };
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${l.width} ${l.height}" width="${l.width}" height="${l.height}" font-family="Georgia, 'Iowan Old Style', serif">`,
    `<rect width="${l.width}" height="${l.height}" fill="${paper}"/>`,
    `<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">` +
    `<path d="M 0 0 L 10 5 L 0 10 z" fill="${faint}"/></marker></defs>`,
  ];

  for (const e of l.edges) {
    const d = e.points.map((p, i) => `${i ? "L" : "M"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    parts.push(
      `<path d="${d}" fill="none" stroke="${faint}" stroke-width="1.4" ` +
      `${e.inferred ? 'stroke-dasharray="4 4" ' : ""}marker-end="url(#arrow)"/>`
    );
    if (e.label) {
      parts.push(
        `<text x="${e.labelAt.x}" y="${e.labelAt.y - 4}" text-anchor="middle" font-size="11" fill="${faint}">${esc(e.label)}</text>`
      );
    }
  }

  for (const n of l.nodes) {
    const dashed = n.verdict === "unsupported" || n.verdict === "uncited";
    const stroke = dashed ? "#c2512f" : n.verdict === "weak" ? "#b08328" : faint;
    parts.push(
      `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="${n.role === "decision" ? 14 : 8}" ` +
      `fill="${fills[n.role] || fills.step}" stroke="${stroke}" stroke-width="${dashed ? 1.8 : 1.2}" ` +
      `${dashed ? 'stroke-dasharray="5 4" ' : ""}/>`
    );
    const startY = n.y + n.h / 2 - ((n.lines.length - 1) * 9) + 4;
    n.lines.forEach((line, i) => {
      parts.push(
        `<text x="${n.x + n.w / 2}" y="${startY + i * 18}" text-anchor="middle" font-size="13" fill="${ink}">${esc(line)}</text>`
      );
    });
    if (n.cite) {
      parts.push(
        `<text x="${n.x + n.w - 6}" y="${n.y + n.h - 6}" text-anchor="end" font-size="9" fill="${faint}">${esc(n.cite)}</text>`
      );
    }
  }
  parts.push("</svg>");
  return parts.join("\n");
}
