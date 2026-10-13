/* ================================================
   ANGIO ATLAS — view.js
   The camera: which way the patient faces on screen, and the orientation
   letters that prove it. Pure maths, no DOM, so selftest.mjs can check
   that "AP" really puts the patient's right on the viewer's left.

   A view is three unit rows in patient RAS coordinates:
     right  — the patient direction that points to screen-right
     up     — the patient direction that points to screen-up
     toward — the patient direction that points out of the screen, at
              the viewer (so the viewer stands on that side of the patient)
   Projection is orthographic, which is close enough to a cone-beam
   angiogram for teaching and keeps labels exactly on their vessels.
   ================================================ */
(function (AG) {
  "use strict";

  const c30 = Math.cos(Math.PI / 6), s30 = Math.sin(Math.PI / 6);
  const s45 = Math.SQRT1_2;

  /* Preset views. The names say where the viewer stands, because "lateral"
     alone does not say which way the face points. */
  const PRESETS = {
    ap: { name: "AP (frontal)", hint: "Viewer faces the patient: patient's right on screen-left, as on a frontal angiogram.",
      right: [-1, 0, 0], up: [0, 0, 1], toward: [0, 1, 0] },
    towne: { name: "Towne (AP, 30° caudal)", hint: "Frontal view tilted to open the posterior fossa — the usual projection for a vertebral run.",
      right: [-1, 0, 0], up: [0, -s30, c30], toward: [0, c30, s30] },
    rlat: { name: "Right lateral", hint: "Viewer at the patient's right side: face to screen-right.",
      right: [0, 1, 0], up: [0, 0, 1], toward: [1, 0, 0] },
    llat: { name: "Left lateral", hint: "Viewer at the patient's left side: face to screen-left.",
      right: [0, -1, 0], up: [0, 0, 1], toward: [-1, 0, 0] },
    sup: { name: "Superior (from above)", hint: "Looking down on the vertex, anterior at the top. Patient's right is on screen-right (not the radiological axial convention).",
      right: [1, 0, 0], up: [0, 1, 0], toward: [0, 0, 1] },
    obl: { name: "Right anterior oblique 45°", hint: "Viewer in front of and to the right of the patient.",
      right: [-s45, s45, 0], up: [0, 0, 1], toward: [s45, s45, 0] },
  };

  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

  function fromPreset(key) {
    const p = PRESETS[key];
    return { right: p.right.slice(), up: p.up.slice(), toward: p.toward.slice(), preset: key };
  }

  /* Rotate a view about one of its own screen axes, as a drag would.
     yaw turns about screen-up, pitch about screen-right (radians). */
  function rotate(view, yaw, pitch) {
    const rot = (v, axis, ang) => {
      // Rodrigues
      const c = Math.cos(ang), s = Math.sin(ang), k = axis;
      const kv = cross(k, v), kd = dot(k, v);
      return [0, 1, 2].map((i) => v[i] * c + kv[i] * s + k[i] * kd * (1 - c));
    };
    let { right, up, toward } = view;
    if (yaw) { right = rot(right, up, yaw); toward = rot(toward, up, yaw); }
    if (pitch) { up = rot(up, right, pitch); toward = rot(toward, right, pitch); }
    // Keep it orthonormal and right-handed (right × up = toward).
    toward = norm(toward);
    right = norm(cross(up, toward));
    up = norm(cross(toward, right));
    return { right, up, toward, preset: null };
  }

  /* Patient point -> camera coordinates (x right, y up, z toward viewer). */
  function toCamera(view, p, center) {
    const q = [p[0] - center[0], p[1] - center[1], p[2] - center[2]];
    return [dot(view.right, q), dot(view.up, q), dot(view.toward, q)];
  }

  /* The letter for a direction given in patient coordinates. Oblique
     directions get two letters, the stronger first. */
  const AXES = [["R", [1, 0, 0]], ["L", [-1, 0, 0]], ["A", [0, 1, 0]], ["P", [0, -1, 0]], ["S", [0, 0, 1]], ["I", [0, 0, -1]]];
  function letterFor(dir) {
    const scored = AXES.map(([l, a]) => [l, dot(a, dir)]).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]);
    if (!scored.length) return "";
    return scored[1] && scored[1][1] > 0.38 ? scored[0][0] + scored[1][0] : scored[0][0];
  }
  /* What patient direction each screen edge faces. */
  function orientation(view) {
    const neg = (a) => [-a[0], -a[1], -a[2]];
    return {
      right: letterFor(view.right), left: letterFor(neg(view.right)),
      top: letterFor(view.up), bottom: letterFor(neg(view.up)),
    };
  }

  /* Silhouette of an ellipsoid (centre c, radii r) under this view: a
     great circle on the unit sphere, mapped back. Used for the faint
     skull outline that keeps orientation readable. */
  function ellipsoidOutline(view, c, r, n = 72) {
    const d = view.toward;
    const w = norm([d[0] / r[0], d[1] / r[1], d[2] / r[2]]);
    const a = norm(Math.abs(w[0]) < 0.9 ? cross(w, [1, 0, 0]) : cross(w, [0, 1, 0]));
    const b = cross(w, a);
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * Math.PI * 2;
      const q = [0, 1, 2].map((k) => a[k] * Math.cos(t) + b[k] * Math.sin(t));
      pts.push([c[0] + r[0] * q[0], c[1] + r[1] * q[1], c[2] + r[2] * q[2]]);
    }
    return pts;
  }

  AG.view = { PRESETS, fromPreset, rotate, toCamera, orientation, letterFor, ellipsoidOutline };
})(window.AG);
