// Geometry for the 3D neuraxis view.
//
// The atlas draws every plate on the same 600x458 canvas, whatever the real
// size of the structure. Placing those plates in space is therefore a
// schematic montage: the arrangement follows anatomical relationships
// (rostrocaudal order, plane orientation, dorsal/ventral and medial/lateral
// direction), not MRI coordinates. Everything here is pure so the self-test
// can check it without a browser.
//
// World axes, patient-centred:
//   +x  patient LEFT        (the atlas draws patient left on the right)
//   +y  ANTERIOR
//   +z  SUPERIOR
//
// Plate coordinates are the 2D map's own: x across the plate, y down it,
// with the midline at x = 300 for every plate except the cortical surfaces,
// which are single-hemisphere projections drawn in absolute coordinates.

export const MAP_MID_X = 300;
export const MAP_MID_Y = 210;

// kind: how the plate sits in space.
//   axial     a transverse section, horizontal, stacked by height
//   sagittal  a hemisphere surface seen from the side
//   coronal   a dorsal projection standing behind the brainstem
// at: the plate's position on the axis it does not span.
// lift/push: in-plane offsets, used to nudge a plate into a sensible place.
export const PLACEMENT = {
  m1: { kind: 'axial', at: 0, scale: 0.62 },
  m2: { kind: 'axial', at: 78, scale: 0.62 },
  m3: { kind: 'axial', at: 156, scale: 0.66 },
  p1: { kind: 'axial', at: 268, scale: 0.78 },
  p2: { kind: 'axial', at: 346, scale: 0.8 },
  p3: { kind: 'axial', at: 424, scale: 0.78 },
  b1: { kind: 'axial', at: 536, scale: 0.72 },
  b2: { kind: 'axial', at: 614, scale: 0.72 },
  b3: { kind: 'axial', at: 692, scale: 0.7 },
  t1: { kind: 'axial', at: 812, scale: 0.86 },
  t2: { kind: 'axial', at: 890, scale: 0.86 },
  d1: { kind: 'axial', at: 968, scale: 0.95 },
  c1: { kind: 'sagittal', at: 150, scale: 0.95, lift: 1190, push: -30 },
  c2: { kind: 'sagittal', at: 10, scale: 0.95, lift: 1190, push: -30 },
  cb: { kind: 'coronal', at: -430, scale: 0.72, lift: 300 },
};

// Rostrocaudal reading order, caudal first. Used for level stepping and for
// threading a structure's plate positions into a 3D course.
export const AXIAL_ORDER = ['m1', 'm2', 'm3', 'p1', 'p2', 'p3', 'b1', 'b2', 'b3', 't1', 't2', 'd1'];
export const LEVEL_ORDER = [...AXIAL_ORDER, 'cb', 'c2', 'c1'];

// Plates whose 2D map is drawn with anterior at the top rather than dorsal.
const ANTERIOR_UP = new Set(['t1', 't2', 'd1']);

// Single-hemisphere surface projections: marker x is absolute, not mirrored.
export const SURFACE_LEVELS = new Set(['c1', 'c2']);

export function placementFor(levelId) {
  return PLACEMENT[levelId] || PLACEMENT.m3;
}

export function isSurfaceLevel(levelId) {
  return SURFACE_LEVELS.has(levelId);
}

// A plate point (map coordinates) to world coordinates. `side` is 'left' or
// 'right' and only matters for the sagittal surface plates, which are shown
// over whichever hemisphere is being discussed.
export function plateToWorld(levelId, px, py, side = 'left') {
  const p = placementFor(levelId);
  const s = p.scale;
  const flip = side === 'right' ? -1 : 1;
  if (p.kind === 'sagittal') {
    return {
      x: flip * p.at,
      y: (MAP_MID_X - px) * s + (p.push || 0),
      z: (MAP_MID_Y - py) * s + (p.lift || 0),
    };
  }
  if (p.kind === 'coronal') {
    return {
      x: (px - MAP_MID_X) * s,
      y: p.at,
      z: (MAP_MID_Y - py) * s + (p.lift || 0),
    };
  }
  const depth = ANTERIOR_UP.has(levelId) ? MAP_MID_Y - py : py - MAP_MID_Y;
  return {
    x: (px - MAP_MID_X) * s,
    y: depth * s,
    z: p.at,
  };
}

// A numbered marker to world coordinates. Marker records hold a distance from
// the midline (`x`) rather than a plate coordinate, except on the surface
// plates where the value is already absolute.
export function markerToWorld(levelId, loc, side = 'left') {
  const px = isSurfaceLevel(levelId)
    ? loc.x
    : MAP_MID_X + (side === 'left' ? loc.x : -loc.x);
  return plateToWorld(levelId, px, loc.y, side);
}

// The slab thickness used to give each plate a visible edge.
export function slabThickness(levelId) {
  const p = placementFor(levelId);
  return p.kind === 'axial' ? 9 : 6;
}

// Offsets a world point along the plate's own normal, so a plate can be drawn
// as a slab rather than an infinitely thin sheet.
export function offsetAlongNormal(levelId, point, amount) {
  const p = placementFor(levelId);
  if (p.kind === 'sagittal') return { x: point.x + amount, y: point.y, z: point.z };
  if (p.kind === 'coronal') return { x: point.x, y: point.y + amount, z: point.z };
  return { x: point.x, y: point.y, z: point.z + amount };
}

// Splits a path's `d` attribute into subpaths so each can be sampled on its
// own. Sampling straight through a two-subpath outline (the thalamus and
// capsule plates are drawn as two halves) would stitch the halves together.
export function splitSubpaths(d) {
  if (typeof d !== 'string') return [];
  const out = [];
  let current = '';
  for (let i = 0; i < d.length; i++) {
    const c = d[i];
    if ((c === 'M' || c === 'm') && current.trim()) {
      out.push(current.trim());
      current = c;
    } else {
      current += c;
    }
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

// Camera. Yaw turns around the superoinferior axis, pitch tips the view.
export function makeCamera(overrides = {}) {
  return {
    yaw: -0.62,
    pitch: 0.5,
    distance: 2100,
    focal: 1500,
    target: { x: 0, y: 0, z: 480 },
    ...overrides,
  };
}

export const PITCH_LIMIT = 1.45;

export function clampPitch(pitch) {
  return Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch));
}

export function clampDistance(distance) {
  return Math.max(520, Math.min(6000, distance));
}

// World point to view space: x right, y into the screen, z up.
export function toView(point, cam) {
  const dx = point.x - cam.target.x;
  const dy = point.y - cam.target.y;
  const dz = point.z - cam.target.z;
  const cy = Math.cos(cam.yaw);
  const sy = Math.sin(cam.yaw);
  const x1 = dx * cy - dy * sy;
  const y1 = dx * sy + dy * cy;
  const cp = Math.cos(cam.pitch);
  const sp = Math.sin(cam.pitch);
  return {
    x: x1,
    y: y1 * cp - dz * sp,
    z: y1 * sp + dz * cp,
  };
}

export const NEAR_PLANE = 60;

// View space to screen. `depth` is the distance in front of the camera, used
// both for painter's-algorithm sorting and for the distance haze.
export function project(point, cam, viewport) {
  const v = toView(point, cam);
  const depth = v.y + cam.distance;
  if (depth <= NEAR_PLANE) return { x: 0, y: 0, depth, scale: 0, visible: false };
  const f = (cam.focal * viewport.zoom) / depth;
  return {
    x: viewport.cx + v.x * f + (viewport.panX || 0),
    y: viewport.cy - v.z * f + (viewport.panY || 0),
    depth,
    scale: f,
    visible: true,
  };
}

// Catmull-Rom through the given points, so a structure's course reads as a
// curve rather than a dogleg at every plate it passes through.
export function smoothPath(points, segments = 8) {
  if (points.length < 3) return points.slice();
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    for (let s = 0; s < segments; s++) {
      const t = s / segments;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push({
        x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
        z: 0.5 * ((2 * p1.z) + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3),
      });
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

// The plates a structure is marked on, in rostrocaudal order.
export function courseLevels(region, levelFilter = null) {
  const seen = new Map();
  for (const loc of region.locations || []) seen.set(loc.level, loc);
  return LEVEL_ORDER
    .filter((id) => seen.has(id))
    .filter((id) => !levelFilter || levelFilter(id))
    .map((id) => ({ level: id, loc: seen.get(id) }));
}

// Where the atlas text names a classic decussation, the crossing is drawn as
// a dashed link across the midline at that plate. These are the crossings the
// study notes call out by name; every other structure keeps its crossing rule
// as text only, rather than inventing geometry for it.
export const DECUSSATIONS = [
  { region: 'cst', level: 'm1', label: 'Pyramidal decussation' },
  { region: 'ml', level: 'm2', label: 'Sensory decussation (internal arcuate fibers)' },
  { region: 'scp', level: 'b1', label: 'Superior cerebellar peduncle decussation' },
  { region: 'iv', level: 'b1', label: 'Trochlear decussation' },
];

export function decussationFor(regionId) {
  return DECUSSATIONS.find((d) => d.region === regionId) || null;
}

// Preset viewpoints, named the way the plates are labelled.
export const VIEWPOINTS = {
  oblique: { yaw: -0.62, pitch: 0.5 },
  // Looking down on the plate being studied, the way the 2D map is drawn,
  // with the neighbouring plates still visible underneath it.
  plate: { yaw: -0.5, pitch: 0.82 },
  anterior: { yaw: 0, pitch: 0.06 },
  posterior: { yaw: Math.PI, pitch: 0.06 },
  left: { yaw: -Math.PI / 2, pitch: 0.06 },
  right: { yaw: Math.PI / 2, pitch: 0.06 },
  superior: { yaw: -0.62, pitch: 1.35 },
};
