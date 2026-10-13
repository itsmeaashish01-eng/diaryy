/* ================================================
   ANGIO ATLAS — dsa.js
   The "Recorded DSA" tab. Kept apart from the simulation on purpose:
   nothing in here is rendered, interpolated or invented.

   No recorded sequence ships with the atlas. The candidate datasets were
   checked (SOURCES below) and none could be included yet: either the
   licence, the per-sequence injection side, or the download itself could
   not be confirmed. Until one is, this tab plays only frames the user
   loads from their own disk, and only after they say what the frames are.

   Labels on recorded cine come only from a reviewed annotation file with
   positions given per frame. A frame with no entry shows no labels;
   positions are never carried from one frame to the next.
   ================================================ */
(function (AG) {
  "use strict";

  /* Checked 2026-10-13. "Status" is what would have to change for each
     source to be bundled. */
  const SOURCES = [
    {
      name: "DSCA — DSA sequence dataset for cerebral artery segmentation",
      where: "github.com/jiongzhang-john/DSCA → data on zenodo.org/records/11255024",
      what: "Recorded DSA (DICOM). 58 patients, 224 sequences: ICA 126, ECA 55, vertebral 43; AP and lateral; left and right hemispheres. Pixel-wise vessel masks.",
      phases: "Arterial phase only — the authors removed non-contrast, capillary and venous frames.",
      licence: "Not stated on the GitHub page. The Zenodo record could not be opened from the build environment, so the licence is unverified.",
      status: "Not included. Needs: confirmed licence; per-sequence metadata giving injected vessel, side and projection; a download (zenodo.org is blocked by this environment's network policy). Even then it would supply arterial-phase frames only.",
      ok: false,
    },
    {
      name: "DIAS — DSA-sequence Intracranial Artery Segmentation",
      where: "zenodo.org/records/11637181 (code: github.com/lseventeen/DIAS)",
      what: "Recorded DSA sequences with neurosurgeon-drawn intracranial artery masks and scribble annotations (about 120 sequences: 60 fully labelled).",
      phases: "Not confirmed.",
      licence: "Creative Commons Attribution 4.0 (from the Zenodo record's metadata as indexed; record page not reachable from here). The code repository is Apache-2.0.",
      status: "Not included. Needs: per-sequence injected vessel, side and projection (not documented in the material that could be read); the 292 MB archive (zenodo.org blocked here). Its masks are segmentation labels, not named-branch annotations.",
      ok: false,
    },
    {
      name: "OpenNeuro ds005096 — Royal Brisbane TOF-MRA intracranial aneurysm database",
      where: "github.com/OpenNeuroDatasets/ds005096 (doi:10.18112/openneuro.ds005096.v1.0.3)",
      what: "TOF-MRA of 63 patients (85 aneurysms) with aneurysm and aneurysm-plus-parent-artery segmentations, STL models, Slicer scenes.",
      phases: "Not applicable — MRA, not an injection. No ECA, no neck, no injection identity.",
      licence: "CC0 (dataset_description.json).",
      status: "Not used for six-vessel injections: it is not DSA, and its segmentations are aneurysm-focused. A future 3D-reconstruction mode could segment one subject's circle of Willis from the TOF volume, kept separate per patient.",
      ok: false,
    },
  ];

  const VESSELS = [
    ["", "— choose —"], ["R_ICA", "Right ICA"], ["L_ICA", "Left ICA"], ["R_ECA", "Right ECA"],
    ["L_ECA", "Left ECA"], ["R_VA", "Right vertebral"], ["L_VA", "Left vertebral"],
    ["R_CCA", "Right CCA (common)"], ["L_CCA", "Left CCA (common)"], ["unknown", "Unknown / not recorded"],
  ];
  const PROJECTIONS = ["", "AP", "Towne", "Lateral", "Oblique", "Unknown"];

  const el = (tag, attrs, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "class") n.className = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    for (const k of kids) if (k != null) n.append(k.nodeType ? k : document.createTextNode(String(k)));
    return n;
  };

  function mount(root) {
    root.textContent = "";
    root.append(
      el("div", { class: "banner banner-recorded" },
        el("strong", {}, "Recorded DSA"),
        " — real angiographic frames only. No recorded sequence is bundled with this atlas (see why below). Nothing on this tab is simulated."),
      sourcesTable(),
      loader(),
    );
  }

  function sourcesTable() {
    const rows = SOURCES.map((s) => el("tr", {},
      el("td", {}, el("strong", {}, s.name), el("div", { class: "muted small" }, s.where)),
      el("td", {}, s.what, el("div", { class: "muted small" }, s.phases)),
      el("td", {}, s.licence),
      el("td", {}, el("span", { class: "pill pill-no" }, "Not included"), " ", s.status.replace(/^Not included\. /, ""))));
    return el("section", { class: "card" },
      el("h3", {}, "Sources checked"),
      el("div", { class: "table-wrap" }, el("table", { class: "src" },
        el("thead", {}, el("tr", {}, el("th", {}, "Dataset"), el("th", {}, "Content"), el("th", {}, "Licence"), el("th", {}, "Status"))),
        el("tbody", {}, ...rows))));
  }

  /* ---- local loader and player ---------------------------------------- */
  function loader() {
    const st = { frames: [], idx: 0, playing: false, fps: 4, meta: null, ann: null, last: 0 };
    const files = el("input", { type: "file", accept: "image/png,image/jpeg", multiple: "" });
    const annFile = el("input", { type: "file", accept: "application/json,.json" });
    const src = el("input", { type: "text", placeholder: "e.g. own case, anonymised; or dataset + sequence id" });
    const lic = el("input", { type: "text", placeholder: "e.g. CC BY 4.0, or 'own data, teaching use'" });
    const ves = el("select", {}, ...VESSELS.map(([v, t]) => el("option", { value: v }, t)));
    const proj = el("select", {}, ...PROJECTIONS.map((p) => el("option", { value: p }, p || "— choose —")));
    const ph = ["arterial", "capillary", "venous"].map((p) => el("input", { type: "checkbox", value: p }));
    const fps = el("input", { type: "number", min: "1", max: "30", step: "0.5", value: "4" });
    const sideChecked = el("input", { type: "checkbox" });
    const msg = el("p", { class: "form-msg", role: "status" });
    const canvas = el("canvas", { class: "dsa-canvas", width: "640", height: "640" });
    const info = el("div", { class: "dsa-info" });
    const scrub = el("input", { type: "range", min: "0", max: "0", value: "0", step: "1", "aria-label": "Recorded frame" });
    const play = el("button", { type: "button", class: "btn" }, "Play");
    const time = el("span", { class: "mono" }, "—");
    const player = el("div", { class: "dsa-player", hidden: "" }, info, canvas,
      el("div", { class: "row" }, play, scrub, time));

    const field = (label, input, hint) => el("label", { class: "field" }, el("span", {}, label), input, hint ? el("small", { class: "muted" }, hint) : null);

    const load = el("button", { type: "button", class: "btn btn-primary", onclick: () => {
      const missing = [];
      if (!files.files.length) missing.push("frames");
      if (!src.value.trim()) missing.push("source");
      if (!lic.value.trim()) missing.push("licence or permission");
      if (!ves.value) missing.push("injected vessel");
      if (!proj.value) missing.push("projection");
      if (!ph.some((c) => c.checked)) missing.push("at least one phase present");
      if (!sideChecked.checked) missing.push("confirmation that the side marker was checked");
      if (missing.length) { msg.textContent = `Still needed: ${missing.join(", ")}.`; return; }
      msg.textContent = "";
      st.meta = {
        source: src.value.trim(), licence: lic.value.trim(),
        vessel: VESSELS.find(([v]) => v === ves.value)[1], projection: proj.value,
        phases: ph.filter((c) => c.checked).map((c) => c.value),
      };
      st.fps = Math.max(1, Math.min(30, +fps.value || 4));
      const list = [...files.files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      st.frames.forEach((f) => URL.revokeObjectURL(f.src));
      st.frames = list.map((f) => { const img = new Image(); img.src = URL.createObjectURL(f); return img; });
      st.idx = 0;
      scrub.max = String(st.frames.length - 1);
      scrub.value = "0";
      st.ann = null;
      const go = () => { player.hidden = false; renderInfo(); drawFrame(); };
      if (annFile.files[0]) {
        annFile.files[0].text().then((t) => {
          try { st.ann = parseAnnotations(JSON.parse(t)); }
          catch (e) { msg.textContent = `Annotation file ignored: ${e.message}`; }
          go();
        });
      } else go();
      st.frames[0].onload = drawFrame;
    } }, "Load sequence");

    play.addEventListener("click", () => {
      st.playing = !st.playing;
      play.textContent = st.playing ? "Pause" : "Play";
      st.last = performance.now();
      if (st.playing) requestAnimationFrame(tick);
    });
    scrub.addEventListener("input", () => { st.idx = +scrub.value; drawFrame(); });

    function tick(now) {
      if (!st.playing) return;
      if (now - st.last >= 1000 / st.fps) {
        st.last = now;
        st.idx = (st.idx + 1) % st.frames.length;
        scrub.value = String(st.idx);
        drawFrame();
      }
      requestAnimationFrame(tick);
    }

    function renderInfo() {
      const m = st.meta;
      info.textContent = "";
      info.append(
        el("div", { class: "banner banner-recorded" }, el("strong", {}, "RECORDED DSA — user-supplied"),
          ` · ${m.vessel} · ${m.projection} · phases: ${m.phases.join(", ")}`),
        el("div", { class: "muted small" }, `Source: ${m.source} · Licence: ${m.licence} · Metadata as entered by the user; not independently verified.`),
        el("div", { class: "muted small" }, st.ann
          ? `Reviewed annotations loaded for ${Object.keys(st.ann.frames).length} of ${st.frames.length} frames${st.ann.reviewer ? ` (reviewer: ${st.ann.reviewer})` : ""}.`
          : "No annotation file: frames are shown unlabelled."));
    }

    function drawFrame() {
      const img = st.frames[st.idx];
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      time.textContent = `frame ${st.idx + 1}/${st.frames.length} · ${(st.idx / st.fps).toFixed(2)} s`;
      if (!img || !img.complete || !img.naturalWidth) return;
      const s = Math.min(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight);
      const w = img.naturalWidth * s, h = img.naturalHeight * s;
      const x0 = (canvas.width - w) / 2, y0 = (canvas.height - h) / 2;
      ctx.drawImage(img, x0, y0, w, h);
      const marks = st.ann && st.ann.frames[st.idx];
      ctx.font = "13px system-ui, sans-serif";
      ctx.textBaseline = "middle";
      if (marks) {
        for (const m of marks) {
          const px = x0 + m.x * w, py = y0 + m.y * h;
          ctx.strokeStyle = "#00c8ff"; ctx.fillStyle = "#00c8ff"; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + 24, py - 16); ctx.stroke();
          const tw = ctx.measureText(m.label).width + 8;
          ctx.fillStyle = "rgba(0,0,0,0.75)"; ctx.fillRect(px + 24, py - 26, tw, 18);
          ctx.fillStyle = "#fff"; ctx.fillText(m.label, px + 28, py - 17);
        }
      } else if (st.ann) {
        ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(8, canvas.height - 30, 300, 22);
        ctx.fillStyle = "#fff"; ctx.fillText("No reviewed annotations for this frame", 14, canvas.height - 19);
      }
    }

    return el("section", { class: "card" },
      el("h3", {}, "Play your own recorded run"),
      el("p", { class: "muted" }, "Load the frames of one run as PNG or JPEG (export DICOM to images first; this tab does not parse DICOM). The files stay in your browser. Say what they are before they play — the atlas will not guess the side, the vessel or the phase."),
      el("div", { class: "form-grid" },
        field("Frames", files, "One run, frames in filename order."),
        field("Source", src),
        field("Licence / permission", lic),
        field("Injected vessel", ves),
        field("Projection", proj),
        field("Frame rate (fps)", fps),
        el("fieldset", { class: "field" }, el("legend", {}, "Phases present"),
          ...ph.map((c) => el("label", { class: "inline" }, c, ` ${c.value}`))),
        field("Reviewed annotations (optional JSON)", annFile, "Per-frame positions, see README."),
        el("label", { class: "inline" }, sideChecked, " I checked the side marker / laterality on these frames")),
      load, msg, player);
  }

  /* { reviewer, frames: { "<index>": [{ label, x, y }] } }, x and y as
     fractions of the image. Anything else is rejected rather than
     half-used. */
  function parseAnnotations(j) {
    if (!j || typeof j !== "object" || typeof j.frames !== "object") throw new Error("expected { frames: { … } }");
    if (!j.reviewed) throw new Error("file is not marked \"reviewed\": true");
    const frames = {};
    for (const [k, list] of Object.entries(j.frames)) {
      const i = Number(k);
      if (!Number.isInteger(i) || i < 0 || !Array.isArray(list)) throw new Error(`bad frame entry ${k}`);
      frames[i] = list.map((m) => {
        if (typeof m.label !== "string" || !(m.x >= 0 && m.x <= 1 && m.y >= 0 && m.y <= 1)) throw new Error(`bad mark on frame ${k}`);
        return { label: m.label.slice(0, 60), x: m.x, y: m.y };
      });
    }
    return { reviewer: typeof j.reviewer === "string" ? j.reviewer.slice(0, 60) : "", frames };
  }

  AG.dsa = { mount, SOURCES, parseAnnotations };
})(window.AG);
