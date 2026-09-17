// Self-test for the 3D neuraxis view. Offline and dependency-free, like the
// other companion apps here, so CI can run it in seconds.
//
// It covers the two things that can quietly break: the geometry that places
// the atlas's plates and markers in space, and the build's anchored edits into
// the app bundle. A plate that loses its placement, or an anchor that no
// longer matches, should fail here rather than in a browser.
//
//   node atlas/selftest.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as G from './src/geometry.mjs';
import { PLATE_ACCENTS, accentsFor } from './src/accents.mjs';
import { build } from './build.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const failures = [];
let checks = 0;

function ok(condition, message) {
  checks++;
  if (!condition) failures.push(message);
}

function equal(actual, expected, message) {
  ok(actual === expected, `${message} (got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)})`);
}

function near(actual, expected, message, tolerance = 1e-6) {
  ok(Math.abs(actual - expected) < tolerance, `${message} (got ${actual}, wanted about ${expected})`);
}

const html = fs.readFileSync(path.join(here, 'Neurovascular-Atlas.html'), 'utf8');

// --- the atlas's own ids, read back out of the shipped file ----------------

// The data arrays hold nested arrays, so their end is found by matching
// brackets rather than by a regular expression.
function idsIn(section) {
  const open = html.indexOf(`${section}:[`);
  if (open === -1) return [];
  const start = html.indexOf('[', open);
  let depth = 0;
  let quote = null;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '[') depth++;
    else if (c === ']') {
      depth--;
      if (depth === 0) {
        const body = html.slice(start, i);
        return [...body.matchAll(/id:"([a-z0-9-]+)"/g)].map((m) => m[1]);
      }
    }
  }
  return [];
}

const levelIds = idsIn('levels');
const regionIds = new Set(idsIn('regions'));

equal(levelIds.length, 15, 'the atlas still has 15 plates');

// --- placement -------------------------------------------------------------

for (const id of levelIds) {
  ok(Object.prototype.hasOwnProperty.call(G.PLACEMENT, id), `plate ${id} has a placement`);
  ok(G.LEVEL_ORDER.includes(id), `plate ${id} has a place in the rostrocaudal order`);
}
for (const id of Object.keys(G.PLACEMENT)) {
  ok(levelIds.includes(id), `placement ${id} still matches a plate in the atlas`);
}
equal(G.LEVEL_ORDER.length, Object.keys(G.PLACEMENT).length, 'every placed plate is ordered once');

// The stacked sections must climb: a section placed out of order would put a
// tract's course through the neuraxis in the wrong direction.
let previous = -Infinity;
for (const id of G.AXIAL_ORDER) {
  const at = G.PLACEMENT[id].at;
  ok(at > previous, `plate ${id} sits above the plate below it`);
  previous = at;
}

// --- plate and marker coordinates -----------------------------------------

// Patient left is +x, and the atlas draws it on the right of the plate.
const leftCst = G.markerToWorld('m3', { x: 65, y: 335 }, 'left');
const rightCst = G.markerToWorld('m3', { x: 65, y: 335 }, 'right');
ok(leftCst.x > 0, 'a left-sided marker sits on the +x side');
near(leftCst.x, -rightCst.x, 'left and right markers mirror across the midline');
near(leftCst.z, G.PLACEMENT.m3.at, 'a marker sits on its plate');
equal(leftCst.y, rightCst.y, 'mirrored markers keep the same depth in the plate');

// A brainstem section is drawn dorsal-up, so a ventral marker is anterior.
const ventral = G.markerToWorld('m3', { x: 65, y: 335 }, 'left');
const dorsal = G.markerToWorld('m3', { x: 65, y: 90 }, 'left');
ok(ventral.y > dorsal.y, 'ventral structures are anterior to dorsal ones');

// The thalamus and capsule plates are drawn anterior-up instead.
const capsuleFront = G.markerToWorld('d1', { x: 60, y: 90 }, 'left');
const capsuleBack = G.markerToWorld('d1', { x: 60, y: 330 }, 'left');
ok(capsuleFront.y > capsuleBack.y, 'on an anterior-up plate the top of the map is anterior');

// A cortical plate is a single hemisphere: marker x is absolute, and the plate
// stands in a sagittal plane.
ok(G.isSurfaceLevel('c1'), 'the lateral cortical surface is a surface plate');
const cortexAnterior = G.markerToWorld('c1', { x: 120, y: 200 }, 'left');
const cortexPosterior = G.markerToWorld('c1', { x: 460, y: 200 }, 'left');
ok(cortexAnterior.y > cortexPosterior.y, 'the left of a cortical map is anterior');
near(cortexAnterior.x, cortexPosterior.x, 'a cortical surface stays in one sagittal plane');
ok(G.markerToWorld('c1', { x: 120, y: 200 }, 'right').x < 0, 'the right hemisphere surface flips to -x');

// Slabs are offset along their own normal, not always in z.
const axialOffset = G.offsetAlongNormal('m3', { x: 0, y: 0, z: 0 }, -9);
equal(axialOffset.z, -9, 'a stacked section thickens downwards');
const sagittalOffset = G.offsetAlongNormal('c1', { x: 0, y: 0, z: 0 }, -6);
equal(sagittalOffset.x, -6, 'a sagittal plate thickens sideways');

// --- outlines --------------------------------------------------------------

// The thalamus and capsule outlines are two halves; sampled as one path they
// would be stitched together across the midline.
equal(G.splitSubpaths('M10 10 L20 20Z M30 30 L40 40Z').length, 2, 'a two-part outline splits in two');
equal(G.splitSubpaths('M10 10 L20 20Z').length, 1, 'a single outline stays whole');
equal(G.splitSubpaths('').length, 0, 'an empty outline yields nothing');
equal(G.splitSubpaths(null).length, 0, 'a missing outline yields nothing');

const outlineMatch = html.match(/Wy=window\.__ATLAS__\.outlines=\{(.*?)\};/s);
ok(!!outlineMatch, 'the plate outlines are exported to the 3D view');
if (outlineMatch) {
  for (const id of levelIds) {
    ok(outlineMatch[1].includes(`${id}:"M`), `plate ${id} still has an outline path`);
  }
}

// --- camera and projection -------------------------------------------------

const cam = G.makeCamera({ yaw: 0, pitch: 0, distance: 1000, focal: 1000, target: { x: 0, y: 0, z: 0 } });
const viewport = { cx: 100, cy: 100, zoom: 1 };
const centre = G.project({ x: 0, y: 0, z: 0 }, cam, viewport);
near(centre.x, 100, 'the camera target projects to the middle of the frame');
near(centre.y, 100, 'the camera target projects to the middle of the frame');
equal(centre.depth, 1000, 'the target sits one camera distance away');

const upPoint = G.project({ x: 0, y: 0, z: 100 }, cam, viewport);
ok(upPoint.y < centre.y, 'superior structures project higher up the screen');
const nearPoint = G.project({ x: 0, y: -500, z: 0 }, cam, viewport);
const farPoint = G.project({ x: 0, y: 500, z: 0 }, cam, viewport);
ok(nearPoint.depth < farPoint.depth, 'anterior structures are nearer at yaw 0');
ok(nearPoint.scale > farPoint.scale, 'nearer structures are drawn larger');
ok(!G.project({ x: 0, y: -1000, z: 0 }, cam, viewport).visible, 'points behind the camera are dropped');

equal(G.clampPitch(9), G.PITCH_LIMIT, 'pitch cannot pass the pole');
equal(G.clampPitch(-9), -G.PITCH_LIMIT, 'pitch cannot pass the pole');
equal(G.clampDistance(1), 520, 'the camera cannot enter the model');

// Turning the camera right swings anterior structures to one side; the point
// must stay the same distance from the target.
const turned = G.toView({ x: 0, y: 500, z: 0 }, G.makeCamera({ yaw: Math.PI / 2, pitch: 0, target: { x: 0, y: 0, z: 0 } }));
near(Math.hypot(turned.x, turned.y, turned.z), 500, 'rotation preserves distance', 1e-9);

// --- courses ---------------------------------------------------------------

const smooth = G.smoothPath([
  { x: 0, y: 0, z: 0 },
  { x: 10, y: 0, z: 100 },
  { x: 20, y: 0, z: 200 },
], 4);
ok(smooth.length > 3, 'a course is smoothed into a curve');
near(smooth[0].z, 0, 'a smoothed course starts where the first plate is');
near(smooth[smooth.length - 1].z, 200, 'a smoothed course ends on the last plate');
equal(G.smoothPath([{ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }], 4).length, 2, 'two points stay a straight segment');

const region = {
  locations: [
    { level: 'p1', x: 90, y: 325 },
    { level: 'm1', x: 40, y: 330 },
    { level: 'c1', x: 200, y: 100 },
  ],
};
const course = G.courseLevels(region);
equal(course.map((step) => step.level).join(','), 'm1,p1,c1', 'a course is read caudal to rostral');
equal(
  G.courseLevels(region, (id) => !G.isSurfaceLevel(id)).length,
  2,
  'a course can be limited to the stacked sections'
);

// Every named decussation must point at a structure and a plate the atlas has.
for (const crossing of G.DECUSSATIONS) {
  ok(regionIds.has(crossing.region), `decussation of ${crossing.region} matches a structure in the atlas`);
  ok(levelIds.includes(crossing.level), `decussation of ${crossing.region} is drawn on a plate that exists`);
}
equal(G.decussationFor('cst').level, 'm1', 'the corticospinal crossing is on the pyramidal decussation plate');
equal(G.decussationFor('ml').level, 'm2', 'the lemniscal crossing is on the sensory decussation plate');
equal(G.decussationFor('nonsense'), null, 'structures without a named crossing get no crossing drawn');

// --- the shipped file ------------------------------------------------------

equal(html.split('<!-- nvx3d:begin -->').length - 1, 1, 'the 3D view is injected exactly once');
ok(html.includes('window.__ATLAS__={data:vl'), 'the app exports its data to the 3D view');
ok(html.includes('["neuraxis","06","3D neuraxis"]'), 'the 3D view has a place in the nav');
ok(html.includes('id:"nvx3d-host"'), 'the app renders the 3D view host');
ok(!html.includes('http://localhost'), 'nothing points at a dev server');
ok(!/<script[^>]+\ssrc=/.test(html), 'the file loads no external scripts');

// Rebuilding the shipped file must be a no-op: the injected block is replaced
// and the bundle edits are skipped, so the file can be rebuilt in place.
equal(build(html), html, 'rebuilding the shipped file changes nothing');

const source = fs.readFileSync(path.join(here, 'src/neuraxis-3d.js'), 'utf8');
ok(source.includes('// @inject modules'), 'the module injection point is still there');
ok(!/\bexport\b/.test(build(html).split('<!-- nvx3d:begin -->')[1].split('</script>')[0]), 'the inlined geometry has no module syntax left');

// --- report ----------------------------------------------------------------

if (failures.length) {
  console.error(`Atlas self-test: ${failures.length} of ${checks} checks failed`);
  for (const failure of failures) console.error('  ✗ ' + failure);
  process.exit(1);
}
console.log(`Atlas self-test: ${checks} checks passed`);
