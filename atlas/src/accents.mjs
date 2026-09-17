// The landmarks drawn inside each plate.
//
// Without them a plate in the model is a blank silhouette, and the whole point
// of a numbered marker is that you can see what it sits next to: the olive,
// the aqueduct, the basis pontis, the limbs of the capsule. These are the same
// shapes the 2D maps draw, in the same plate coordinates, so a plate in the
// model and the same plate on the flat map read as one drawing.
//
// Two of them do more than orient you. The medullary decussation arcs and the
// internal arcuate fibers are where the crossing happens, and in the model
// they sit directly under the dashed midline link that marks it.

const EDGE = '#8caeba';
const DEEP = '#092a3b';

// An ellipse as a path, so everything here can go through one path sampler.
function ellipse(cx, cy, rx, ry) {
  return `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${rx * 2} 0a${rx} ${ry} 0 1 0 ${-rx * 2} 0`;
}

// Paths the maps draw once per side, mirrored about the midline.
function mirrored(build) {
  return [-1, 1].map((s) => build(s)).join(' ');
}

const CENTRAL_CANAL = { d: ellipse(300, 163, 7, 7), stroke: EDGE, width: 1, fill: DEEP };
const AQUEDUCT = { d: ellipse(300, 84, 10, 13), stroke: EDGE, width: 1, fill: DEEP };
const BASIS_PONTIS = { d: 'M73 264 Q300 225 527 264', stroke: EDGE, width: 1.5, dash: [5, 6] };

const OLIVES = {
  d: mirrored((s) =>
    `M${300 + s * 110} 233 q${s * 70} 0 ${s * 50} 47 q${s * -8} 37 ${s * -58} 19 ` +
    `q${s * 38} -10 ${s * 18} -26 q${s * -35} -7 ${s * -10} -40`),
  stroke: EDGE,
  width: 4,
};

const CAPSULE_LIMBS = {
  d: mirrored((s) => `M${300 + s * 100} 71 L${300 + s * 72} 174 L${300 + s * 140} 294`),
  stroke: EDGE,
  width: 18,
  opacity: 0.3,
};

const THALAMIC_LAMINA = {
  d: mirrored((s) =>
    `M${300 + s * 150} 80 L${300 + s * 100} 174 L${300 + s * 140} 275 ` +
    `M${300 + s * 100} 174 L${300 + s * 30} 138`),
  stroke: EDGE,
  width: 1.2,
};

const FOLIA = [123, 155, 190, 222, 256, 287].map((y) => ({
  d: `M80 ${y} Q170 ${y - 30} 263 ${y} M337 ${y} Q430 ${y - 30} 520 ${y}`,
  stroke: EDGE,
  width: 1,
  opacity: 0.35,
}));

export const PLATE_ACCENTS = {
  m1: [
    CENTRAL_CANAL,
    // Motor fibers turning across the midline.
    { d: 'M250 299 Q280 360 339 348 M350 299 Q320 360 261 348', stroke: '#dba564', width: 3 },
  ],
  m2: [
    CENTRAL_CANAL,
    // Internal arcuate fibers sweeping across to form the medial lemniscus.
    { d: 'M188 122 Q245 235 335 224 M412 122 Q355 235 265 224', stroke: '#61bec2', width: 3 },
  ],
  m3: [OLIVES],
  p1: [BASIS_PONTIS],
  p2: [BASIS_PONTIS],
  p3: [BASIS_PONTIS],
  b1: [
    AQUEDUCT,
    // Superior cerebellar peduncle decussation.
    { d: 'M250 196 Q270 254 346 246 M350 196 Q330 254 254 246', stroke: '#b6cd81', width: 3 },
  ],
  b2: [AQUEDUCT],
  b3: [AQUEDUCT],
  t1: [THALAMIC_LAMINA],
  t2: [THALAMIC_LAMINA],
  d1: [CAPSULE_LIMBS],
  c1: [
    // Central sulcus and lateral fissure.
    { d: 'M284 42 Q274 110 300 152 L287 202', stroke: EDGE, width: 4 },
    { d: 'M123 233 Q230 246 321 204 L446 216', stroke: EDGE, width: 4 },
  ],
  c2: [
    { d: 'M150 194 Q143 123 245 122 Q351 117 370 174 L347 189 Q332 151 240 158 Q195 161 186 197Z', stroke: null, width: 0, fill: EDGE, opacity: 0.25 },
    { d: 'M390 184 L523 172 M422 171 L451 68', stroke: EDGE, width: 3 },
  ],
  cb: FOLIA,
};

export function accentsFor(levelId) {
  return PLATE_ACCENTS[levelId] || [];
}
