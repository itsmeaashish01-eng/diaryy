/* ================================================
   ANGIO ATLAS — anatomy.js
   The schematic teaching model: an original, editable vascular graph of
   the neck and head, drawn from textbook anatomy. It is NOT derived from
   any patient scan, and the app says so on every screen.

   Coordinates are millimetres in patient RAS:
     +x = patient's RIGHT, +y = ANTERIOR, +z = SUPERIOR.
   The origin sits roughly at the sella, so the circle of Willis lies near
   z = 0..16 and the carotid bifurcation near z = -86 (about C4).

   Right-sided structures are written once and mirrored (x -> -x) to make
   the left side, so the two sides cannot drift apart by accident. That
   also means the model is symmetric: no dominance, no variants, unless an
   assumption in model.js says otherwise.

   Each vessel is a polyline of control points, smoothed later. A point is
   either [x, y, z] or a junction name:
     "@name"   — a junction on this vessel's own side
     "R@name"  — a right-side junction, named explicitly (for midline vessels)
     "#name"   — a midline junction
   Point order is the direction of normal (antegrade) flow.
   ================================================ */
window.AG = window.AG || {};
(function (AG) {
  "use strict";

  /* ---- junctions: branch origins and segment boundaries -------------- */
  // Right side; mirrored for the left.
  const SIDE_J = {
    cca0:   [24, 2, -150],
    bif:    [27, 8, -86],     // carotid bifurcation, ~C4
    icaCath:[30.5, 2, -64],   // catheter tip for an ICA run (cervical ICA, ~C2)
    c1c2:   [26, 0, -30],     // skull base, carotid canal
    c2c3:   [17, 16, -17],    // foramen lacerum
    c3c4:   [16, 17, -11],    // petrolingual ligament
    c4c5:   [15, 32, 2],      // proximal dural ring, at the anterior genu
    c5c6:   [15.5, 30, 6],    // distal dural ring
    ophO:   [16, 28, 7.5],    // ophthalmic origin
    pcomO:  [16.5, 23, 9],    // PCom origin = C6/C7 boundary
    achaO:  [17, 20.5, 10.5], // anterior choroidal origin
    icaT:   [17.5, 19, 12.5], // ICA terminus
    acomJ:  [1.6, 27, 16],    // A1/A2 junction at the ACom
    heubO:  [2.2, 28.5, 18],
    fpO:    [3, 34, 29],
    cmO:    [3.2, 40, 41],    // callosomarginal origin, near the genu
    lsO1:   [24, 19, 12.5],
    lsO2:   [28.5, 18.8, 12.5],
    atO:    [31, 18.5, 12.5],
    mBif:   [42, 16, 14],     // MCA bifurcation, at the limen insulae
    supTop: [46, 11, 37],     // superior trunk at the top of the insula
    infTop: [47, -10, 23],    // inferior trunk at the back of the insula
    p1p2:   [9.5, 4, 3.5],    // P1/P2 junction, where the PCom joins
    tpO:    [4.5, 5, 2.2],
    ptO:    [19, -10, 6],
    p2p3:   [21, -28, 10],
    vaCath: [31, -5, -125],   // catheter tip for a vertebral run (V2)
    va0:    [33, -4, -150],
    c2tf:   [30, -8, -80],    // C2 transverse foramen: V2/V3
    vaDura: [16, -16, -55],   // dural entry: V3/V4
    picaO:  [11, -6, -51],
    picaBif:[8, -36, -44],
    ecaCath:[26.5, 9.5, -85], // catheter tip for an ECA run (proximal ECA)
    stO:    [27, 11, -84],
    apO:    [26.5, 10.2, -81],
    lgO:    [28, 14, -78],
    faO:    [29, 15, -74],
    ocO:    [30.5, 13, -70],
    paO:    [36, 12, -46],
    ecaT:   [44, 11, -32],    // ECA terminal division at the mandibular neck
    mmaO:   [40, 15, -31],
    mmaBif: [50, 16, 8],
    staBif: [66, 11, 14],
    // veins
    tsSig:  [56, -60, -4],
    jb:     [40, -26, -38],
    tsMid:  [44, -82, 6],
  };

  const MID_J = {
    vbJ:    [0, 9, -40],      // vertebrobasilar junction
    aicaJ:  [0, 9.5, -30],
    scaJ:   [0, 7, -4],
    bTip:   [0, 5.5, 1],
    sssA:   [0, 28, 86],
    sssMid: [0, 0, 94],
    sssP:   [0, -62, 66],
    torc:   [0, -92, 14],
    galen:  [0, -20, 30],
    ssO:    [0, -26, 34],
    stS:    [0, -50, 30],
    issA:   [0, 36, 40],
  };

  /* ---- vessels --------------------------------------------------------
     side: "both" (written for the right, mirrored) or "mid".
     r: lumen radius in mm at the start; r1 at the end (defaults to r).
     label: { at: fraction along the vessel, pri: 1 major … 3 minor } or
     false. drain: for arterial end-branches, where the capillary bed's
     blood goes next (a venous junction), or null if that drainage is not
     modelled. */
  const DEFS = [
    /* -- carotid system, catheter route -------------------------------- */
    { id: "cca", side: "both", kind: "context", group: "CCA",
      name: "Common carotid artery", short: "CCA",
      path: ["@cca0", [25.5, 4, -120], "@bif"], r: 3.4,
      label: { at: 0.4, pri: 2 },
      desc: "Catheter route for carotid runs. Proximal to every catheter tip, so it does not opacify in a selective ICA or ECA injection." },

    /* -- ICA, Bouthillier segments -------------------------------------- */
    { id: "ica_c1a", side: "both", kind: "context", group: "ICA", name: "ICA — C1 cervical (bulb)", short: "ICA C1",
      path: ["@bif", [30, 4, -78], "@icaCath"], r: 3.0, r1: 2.6, label: false,
      desc: "Carotid bulb, proximal to the ICA catheter tip. Fills only from the CCA, which the selective ICA run bypasses." },
    { id: "ica_c1", side: "both", group: "ICA", name: "ICA — C1 cervical", short: "ICA C1",
      path: ["@icaCath", [29.5, 0, -47], "@c1c2"], r: 2.6, label: { at: 0.5, pri: 1 },
      desc: "Cervical ICA, bifurcation to the carotid canal. No named branches." },
    { id: "ica_c2", side: "both", group: "ICA", name: "ICA — C2 petrous", short: "C2 petrous",
      path: ["@c1c2", [25.5, 1, -23], [22, 8, -19], "@c2c3"], r: 2.5, label: { at: 0.6, pri: 2 },
      desc: "Vertical then horizontal course in the carotid canal. Vidian and caroticotympanic branches are not modelled." },
    { id: "ica_c3", side: "both", group: "ICA", name: "ICA — C3 lacerum", short: "C3 lacerum",
      path: ["@c2c3", "@c3c4"], r: 2.45, label: { at: 0.5, pri: 3 },
      desc: "Over the foramen lacerum to the petrolingual ligament." },
    { id: "ica_c4", side: "both", group: "ICA", name: "ICA — C4 cavernous", short: "C4 cavernous",
      path: ["@c3c4", [15, 18, -6], [14.5, 24, -5], [14.5, 30, -3], "@c4c5"], r: 2.4, label: { at: 0.55, pri: 1 },
      desc: "Within the cavernous sinus. Meningohypophyseal trunk and inferolateral trunk are not modelled." },
    { id: "ica_c5", side: "both", group: "ICA", name: "ICA — C5 clinoid", short: "C5 clinoid",
      path: ["@c4c5", "@c5c6"], r: 2.3, label: { at: 0.5, pri: 3 },
      desc: "Between the proximal and distal dural rings." },
    { id: "ica_c6", side: "both", group: "ICA", name: "ICA — C6 ophthalmic", short: "C6 ophthalmic",
      path: ["@c5c6", "@ophO", "@pcomO"], r: 2.2, label: { at: 0.6, pri: 2 },
      desc: "Distal dural ring to the PCom origin. Gives the ophthalmic artery; superior hypophyseal arteries not modelled." },
    { id: "ica_c7", side: "both", group: "ICA", name: "ICA — C7 communicating", short: "C7",
      path: ["@pcomO", "@achaO", "@icaT"], r: 2.0, label: { at: 0.4, pri: 3 },
      desc: "PCom origin to the terminal bifurcation. Gives the PCom and the anterior choroidal artery." },
    { id: "oph", side: "both", group: "ICA", name: "Ophthalmic artery", short: "Ophthalmic",
      path: ["@ophO", [19, 34, 5], [22, 42, 5], [26, 52, 8], [22, 62, 11], [14, 70, 14]], r: 0.8, r1: 0.4,
      label: { at: 0.55, pri: 1 }, drain: null,
      desc: "Through the optic canal into the orbit: retina, globe, and forehead (supraorbital, supratrochlear). Drains via ophthalmic veins to the cavernous sinus — not modelled." },
    { id: "pcom", side: "both", group: "COW", name: "Posterior communicating artery", short: "PCom",
      path: ["@pcomO", [14, 16, 7.5], [11.5, 8, 5], "@p1p2"], r: 0.75,
      flow: "both", mix: "pcomFwd", mixRev: "pcomRev", revStop: true,
      label: { at: 0.5, pri: 1 },
      desc: "Joins the ICA to the PCA at the P1/P2 junction. How much it carries depends on P1 size, which varies; see Assumptions." },
    { id: "acha", side: "both", group: "ICA", name: "Anterior choroidal artery", short: "AChA",
      path: ["@achaO", [21, 14, 11], [25, 5, 13], [28, -5, 16], [28, -14, 20]], r: 0.5, r1: 0.35,
      label: { at: 0.6, pri: 1 }, drain: "@deep",
      desc: "Optic tract, posterior limb of the internal capsule, choroid plexus of the temporal horn." },

    /* -- ACA ------------------------------------------------------------- */
    { id: "a1", side: "both", group: "ACA", name: "ACA — A1 (precommunicating)", short: "A1",
      path: ["@icaT", [11, 23, 14], [5, 26, 15.5], "@acomJ"], r: 1.1, label: { at: 0.5, pri: 1 },
      desc: "ICA terminus to the ACom. Medial lenticulostriates not modelled separately." },
    { id: "acom", side: "mid", group: "COW", name: "Anterior communicating artery", short: "ACom",
      path: ["R@acomJ", "L@acomJ"], r: 0.6,
      flow: "both", mix: "acomCross", mixRev: "acomCross",
      label: { at: 0.5, pri: 1 },
      desc: "Joins the two A1/A2 junctions. Cross-filling of the opposite A2 on a carotid run depends on the A1s and on pressures; the model's share is a stated assumption, not a measurement." },
    { id: "a2", side: "both", group: "ACA", name: "ACA — A2 (postcommunicating)", short: "A2",
      path: ["@acomJ", "@heubO", [2.8, 31, 23], "@fpO", [3.2, 38, 36], "@cmO"], r: 1.0,
      label: { at: 0.5, pri: 1 },
      desc: "ACom to the genu of the corpus callosum." },
    { id: "heub", side: "both", group: "ACA", name: "Recurrent artery of Heubner", short: "Heubner",
      path: ["@heubO", [7, 27, 15], [13, 25, 13]], r: 0.35, label: { at: 0.7, pri: 3 }, drain: "@deep",
      desc: "Head of caudate, anterior limb of the internal capsule. Origin varies (A1, A2 or ACom); drawn from proximal A2." },
    { id: "fpa", side: "both", group: "ACA", name: "Frontopolar artery", short: "Frontopolar",
      path: ["@fpO", [4, 48, 30], [5, 60, 36]], r: 0.45, label: { at: 0.7, pri: 2 }, drain: "#sssA",
      desc: "Medial frontal pole." },
    { id: "peri", side: "both", group: "ACA", name: "Pericallosal artery (A3–A5)", short: "Pericallosal",
      path: ["@cmO", [3, 42, 50], [3, 33, 58], [3, 18, 63], [3, 0, 64], [3, -18, 60], [3.5, -32, 52]], r: 0.8, r1: 0.45,
      label: { at: 0.35, pri: 1 }, drain: "#issA",
      desc: "Over the corpus callosum; medial frontal and parietal lobes." },
    { id: "cma", side: "both", group: "ACA", name: "Callosomarginal artery", short: "Callosomarginal",
      path: ["@cmO", [4, 48, 52], [4.5, 44, 66], [5, 30, 76], [5, 12, 83], [5, -5, 86]], r: 0.7, r1: 0.4,
      label: { at: 0.45, pri: 1 }, drain: "#sssA",
      desc: "In the cingulate sulcus; medial frontal lobe and paracentral lobule. Absent in a sizeable minority — drawn present." },

    /* -- MCA ------------------------------------------------------------- */
    { id: "m1", side: "both", group: "MCA", name: "MCA — M1 (sphenoidal)", short: "M1",
      path: ["@icaT", "@lsO1", "@lsO2", "@atO", [37, 17.5, 13], "@mBif"], r: 1.4, r1: 1.25,
      label: { at: 0.5, pri: 1 },
      desc: "ICA terminus to the bifurcation at the limen insulae." },
    { id: "ls1", side: "both", group: "MCA", name: "Lateral lenticulostriate arteries", short: "Lenticulostriates",
      path: ["@lsO1", [24, 17, 20], [25, 15, 30]], r: 0.3, label: { at: 0.8, pri: 2 }, drain: "@deep",
      desc: "Basal ganglia and internal capsule. Many small vessels in reality; two are drawn." },
    { id: "ls2", side: "both", group: "MCA", name: "Lateral lenticulostriate arteries", short: "Lenticulostriates",
      path: ["@lsO2", [28, 17, 20], [29, 15, 29]], r: 0.3, label: false, drain: "@deep",
      desc: "Basal ganglia and internal capsule. Many small vessels in reality; two are drawn." },
    { id: "ata", side: "both", group: "MCA", name: "Anterior temporal artery", short: "Ant. temporal",
      path: ["@atO", [42, 21, 4], [50, 18, -6], [54, 8, -12]], r: 0.5, label: { at: 0.7, pri: 2 }, drain: "@labbeIn",
      desc: "Anterior temporal lobe. Often arises from M1 (as here) or from the inferior trunk." },
    { id: "m2s", side: "both", group: "MCA", name: "MCA — M2 superior trunk (insular)", short: "M2 sup.",
      path: ["@mBif", [44, 16, 22], [45, 14, 30], "@supTop"], r: 1.0, label: { at: 0.5, pri: 2 },
      desc: "Insular segment of the superior division." },
    { id: "m2i", side: "both", group: "MCA", name: "MCA — M2 inferior trunk (insular)", short: "M2 inf.",
      path: ["@mBif", [45, 9, 17], [46, 0, 20], "@infTop"], r: 1.0, label: { at: 0.5, pri: 2 },
      desc: "Insular segment of the inferior division." },
    { id: "mofa", side: "both", group: "MCA", name: "MCA prefrontal / orbitofrontal branches (M3–M4)", short: "Prefrontal br.",
      path: ["@supTop", [52, 26, 42], [48, 44, 48], [40, 58, 50]], r: 0.6, r1: 0.35, label: { at: 0.7, pri: 2 }, drain: "@trolardIn",
      desc: "Lateral frontal lobe, inferior frontal gyrus. Several named cortical branches are grouped here." },
    { id: "mcen", side: "both", group: "MCA", name: "MCA central (Rolandic) / precentral branches", short: "Rolandic br.",
      path: ["@supTop", [58, 8, 52], [56, 0, 68], [48, -8, 80]], r: 0.6, r1: 0.35, label: { at: 0.7, pri: 2 }, drain: "@trolardIn",
      desc: "Pre- and postcentral gyri: lateral motor and sensory cortex (face, arm)." },
    { id: "mpar", side: "both", group: "MCA", name: "MCA anterior parietal branch", short: "Ant. parietal br.",
      path: ["@supTop", [60, -6, 46], [58, -20, 62], [50, -30, 76]], r: 0.55, r1: 0.35, label: { at: 0.75, pri: 3 }, drain: "@trolardIn",
      desc: "Anterior parietal lobe." },
    { id: "mang", side: "both", group: "MCA", name: "MCA angular / posterior parietal branch", short: "Angular br.",
      path: ["@infTop", [60, -30, 34], [58, -48, 42], [50, -62, 48]], r: 0.6, r1: 0.35, label: { at: 0.7, pri: 2 }, drain: "@labbeIn",
      desc: "Angular and supramarginal gyri. Usually the terminal MCA branch." },
    { id: "mpt", side: "both", group: "MCA", name: "MCA posterior temporal branch", short: "Post. temporal br.",
      path: ["@infTop", [62, -26, 12], [62, -42, 4], [56, -58, 2]], r: 0.55, r1: 0.35, label: { at: 0.7, pri: 2 }, drain: "@labbeIn",
      desc: "Posterior superior and middle temporal gyri." },

    /* -- vertebrobasilar ------------------------------------------------- */
    { id: "va_v1", side: "both", kind: "context", group: "VB", name: "Vertebral artery — V2 below the catheter", short: "VA V2",
      path: ["@va0", "@vaCath"], r: 1.9, label: false,
      desc: "Proximal to the vertebral catheter tip; does not opacify on a selective vertebral run." },
    { id: "va_v2", side: "both", group: "VB", name: "Vertebral artery — V2 (foraminal)", short: "VA V2",
      path: ["@vaCath", [31, -6, -100], "@c2tf"], r: 1.9, label: { at: 0.4, pri: 1 },
      desc: "Through the transverse foramina, C6 to C2. Muscular and radicular branches not modelled." },
    { id: "va_v3", side: "both", group: "VB", name: "Vertebral artery — V3 (extraspinal)", short: "VA V3",
      path: ["@c2tf", [37, -10, -72], [40, -14, -66], [33, -26, -62], [24, -24, -58], "@vaDura"], r: 1.8,
      label: { at: 0.5, pri: 2 },
      desc: "C2 to the dura: loops laterally through C1, then medially over the posterior arch of C1." },
    { id: "va_v4", side: "both", group: "VB", name: "Vertebral artery — V4 (intradural)", short: "VA V4",
      path: ["@vaDura", "@picaO"], r: 1.7, label: { at: 0.5, pri: 1 },
      desc: "Dural entry to the vertebrobasilar junction." },
    { id: "va_v4d", side: "both", group: "VB", name: "Vertebral artery — V4 (intradural)", short: "VA V4",
      path: ["@picaO", [6, 3, -45], "#vbJ"], r: 1.6, label: false, refluxable: true,
      desc: "Distal V4, PICA origin to the vertebrobasilar junction. On a contralateral vertebral run, contrast can reflux down this segment to the PICA origin." },
    { id: "pica", side: "both", group: "VB", name: "Posterior inferior cerebellar artery", short: "PICA",
      path: ["@picaO", [14, -12, -58], [10, -22, -56], [6, -30, -48], "@picaBif"], r: 0.65,
      label: { at: 0.35, pri: 1 },
      desc: "Lateral medulla, inferior vermis, inferior cerebellar hemisphere. The caudal loop's height varies." },
    { id: "pica_h", side: "both", group: "VB", name: "PICA hemispheric branch", short: "PICA hemis.",
      path: ["@picaBif", [20, -44, -40], [32, -46, -32]], r: 0.45, label: { at: 0.8, pri: 3 }, drain: "@tsMid",
      desc: "Inferior cerebellar hemisphere." },
    { id: "pica_v", side: "both", group: "VB", name: "PICA vermian branch", short: "PICA vermian",
      path: ["@picaBif", [3, -42, -36], [2, -46, -26]], r: 0.4, label: { at: 0.8, pri: 3 }, drain: "#torc",
      desc: "Inferior vermis." },
    { id: "basilar", side: "mid", group: "VB", name: "Basilar artery", short: "Basilar",
      path: ["#vbJ", "#aicaJ", [0, 9, -20], "#scaJ", "#bTip"], r: 1.7, r1: 1.5,
      mix: "vbMix", label: { at: 0.45, pri: 1 },
      desc: "On the clivus, from the vertebrobasilar junction to the tip. A single vertebral run mixes with unopacified blood from the other vertebral here." },
    { id: "aica", side: "both", group: "VB", name: "Anterior inferior cerebellar artery", short: "AICA",
      path: ["#aicaJ", [8, 7, -31], [15, 4, -29], [20, 1, -26], [24, -8, -30], [28, -20, -34]], r: 0.5, r1: 0.35,
      label: { at: 0.45, pri: 1 }, drain: "@tsSig",
      desc: "Anterolateral pons, flocculus, anterior inferior cerebellum. Loops toward the internal acoustic meatus (labyrinthine artery not modelled)." },
    { id: "sca", side: "both", group: "VB", name: "Superior cerebellar artery", short: "SCA",
      path: ["#scaJ", [7, 4, -4], [14, -2, -4], [19, -14, -6], [16, -28, -10], [10, -38, -12]], r: 0.6, r1: 0.4,
      label: { at: 0.45, pri: 1 }, drain: "#galen",
      desc: "Superior cerebellum and upper vermis, upper pons and midbrain." },
    { id: "p1", side: "both", group: "PCA", name: "PCA — P1 (precommunicating)", short: "P1",
      path: ["#bTip", "@tpO", "@p1p2"], r: 1.1, mix: "p1Mix", label: { at: 0.5, pri: 1 },
      desc: "Basilar tip to the PCom junction. Hypoplastic when the PCA is fetal-type." },
    { id: "thal", side: "both", group: "PCA", name: "Thalamoperforating arteries", short: "Thalamoperf.",
      path: ["@tpO", [4, 0, 10], [5, -4, 18]], r: 0.3, label: { at: 0.8, pri: 3 }, drain: "@deep",
      desc: "Medial thalamus and midbrain. Several small vessels; one drawn." },
    { id: "p2", side: "both", group: "PCA", name: "PCA — P2 (ambient)", short: "P2",
      path: ["@p1p2", [15, -2, 5], "@ptO", [22, -20, 8], "@p2p3"], r: 1.0, label: { at: 0.4, pri: 1 },
      desc: "Around the midbrain in the ambient cistern. Posterior choroidal arteries not modelled." },
    { id: "pita", side: "both", group: "PCA", name: "PCA inferior temporal branches", short: "PCA temporal br.",
      path: ["@ptO", [30, -20, 0], [36, -34, -2]], r: 0.5, label: { at: 0.75, pri: 3 }, drain: "@basal",
      desc: "Inferior temporal lobe." },
    { id: "calc", side: "both", group: "PCA", name: "Calcarine artery", short: "Calcarine",
      path: ["@p2p3", [16, -45, 14], [11, -62, 16], [8, -78, 18]], r: 0.55, r1: 0.35, label: { at: 0.6, pri: 1 }, drain: "#stS",
      desc: "Primary visual cortex along the calcarine fissure." },
    { id: "poa", side: "both", group: "PCA", name: "Parieto-occipital artery", short: "Parieto-occipital",
      path: ["@p2p3", [16, -42, 26], [11, -54, 38], [8, -62, 50]], r: 0.55, r1: 0.35, label: { at: 0.6, pri: 2 }, drain: "#sssP",
      desc: "Cuneus and precuneus." },

    /* -- ECA and its eight principal branches --------------------------- */
    { id: "eca0", side: "both", kind: "context", group: "ECA", name: "External carotid artery", short: "ECA",
      path: ["@bif", "@ecaCath"], r: 2.2, label: false,
      desc: "First millimetre of the ECA, proximal to the catheter tip." },
    { id: "eca", side: "both", group: "ECA", name: "External carotid artery", short: "ECA",
      path: ["@ecaCath", "@stO", "@apO", "@lgO", "@faO", "@ocO", [33, 13, -58], "@paO", "@ecaT"], r: 2.1, r1: 1.6,
      label: { at: 0.6, pri: 1 },
      desc: "Bifurcation to its terminal division behind the mandibular neck." },
    { id: "sta_thy", side: "both", group: "ECA", name: "Superior thyroid artery", short: "Sup. thyroid",
      path: ["@stO", [23, 22, -92], [19, 30, -104], [15, 32, -120]], r: 0.8, r1: 0.5,
      label: { at: 0.6, pri: 1 }, drain: null,
      desc: "ECA branch 1. Larynx (superior laryngeal artery) and upper pole of the thyroid." },
    { id: "apa", side: "both", group: "ECA", name: "Ascending pharyngeal artery", short: "Asc. pharyngeal",
      path: ["@apO", [23, 7, -70], [20, 6, -50], [17, 7, -32]], r: 0.5, r1: 0.35,
      label: { at: 0.6, pri: 1 }, drain: null,
      desc: "ECA branch 2. Pharynx, skull-base dura, lower cranial nerves. Important anastomoses with the ICA and vertebral — not modelled." },
    { id: "lingual", side: "both", group: "ECA", name: "Lingual artery", short: "Lingual",
      path: ["@lgO", [27, 24, -78], [20, 38, -72], [14, 50, -64], [9, 60, -56]], r: 0.8, r1: 0.45,
      label: { at: 0.55, pri: 1 }, drain: null,
      desc: "ECA branch 3. Tongue and floor of mouth." },
    { id: "facial", side: "both", group: "ECA", name: "Facial artery", short: "Facial",
      path: ["@faO", [34, 26, -82], [40, 40, -80], [46, 50, -74], [40, 60, -55], [32, 68, -38], [22, 74, -18], [17, 74, -4]], r: 0.9, r1: 0.4,
      label: { at: 0.45, pri: 1 }, drain: null,
      desc: "ECA branch 4. Loops under the mandible, then up across the face to the angular artery at the medial canthus (an ECA–ophthalmic anastomosis, not modelled)." },
    { id: "occ", side: "both", group: "ECA", name: "Occipital artery", short: "Occipital",
      path: ["@ocO", [36, 0, -64], [40, -18, -56], [36, -38, -42], [28, -62, -24], [20, -80, -2], [14, -88, 22]], r: 0.9, r1: 0.45,
      label: { at: 0.45, pri: 1 }, drain: null,
      desc: "ECA branch 5. Posterior scalp and neck muscles. Anastomoses with the vertebral artery are not modelled." },
    { id: "pau", side: "both", group: "ECA", name: "Posterior auricular artery", short: "Post. auricular",
      path: ["@paO", [46, 0, -44], [58, -18, -34], [66, -30, -14], [64, -40, 6]], r: 0.5, r1: 0.35,
      label: { at: 0.7, pri: 1 }, drain: null,
      desc: "ECA branch 6. Auricle and scalp behind the ear; stylomastoid branch." },
    { id: "imax", side: "both", group: "ECA", name: "Maxillary artery", short: "Maxillary",
      path: ["@ecaT", "@mmaO", [34, 22, -30], [28, 32, -28], [20, 44, -24], [11, 54, -18]], r: 1.2, r1: 0.6,
      label: { at: 0.55, pri: 1 }, drain: null,
      desc: "ECA terminal branch (branch 7). Through the infratemporal fossa to the pterygopalatine fossa, ending as the sphenopalatine artery (nasal cavity). Deep temporal, buccal, alveolar branches not modelled." },
    { id: "mma", side: "both", group: "ECA", name: "Middle meningeal artery", short: "MMA",
      path: ["@mmaO", [34, 14, -24], [30, 12, -16], [42, 14, -4], "@mmaBif"], r: 0.7,
      label: { at: 0.45, pri: 1 }, drain: null,
      desc: "From the maxillary artery through the foramen spinosum to the convexity dura. Its dural blush is intracranial but extra-axial." },
    { id: "mma_f", side: "both", group: "ECA", name: "Middle meningeal artery — frontal branch", short: "MMA frontal",
      path: ["@mmaBif", [56, 26, 28], [52, 22, 50], [40, 16, 72]], r: 0.5, r1: 0.35,
      label: { at: 0.7, pri: 3 }, drain: null, desc: "Frontoparietal convexity dura." },
    { id: "mma_p", side: "both", group: "ECA", name: "Middle meningeal artery — parietal branch", short: "MMA parietal",
      path: ["@mmaBif", [58, -4, 22], [56, -26, 40], [46, -46, 60]], r: 0.5, r1: 0.35,
      label: { at: 0.7, pri: 3 }, drain: null, desc: "Parietal convexity dura." },
    { id: "sta", side: "both", group: "ECA", name: "Superficial temporal artery", short: "STA",
      path: ["@ecaT", [54, 10, -20], [62, 10, -4], "@staBif"], r: 0.9,
      label: { at: 0.5, pri: 1 }, drain: null,
      desc: "ECA terminal branch (branch 8). Ascends in front of the tragus to the scalp." },
    { id: "sta_f", side: "both", group: "ECA", name: "STA — frontal branch", short: "STA frontal",
      path: ["@staBif", [70, 34, 38], [60, 56, 58], [42, 68, 68]], r: 0.6, r1: 0.4,
      label: { at: 0.6, pri: 3 }, drain: null, desc: "Frontal scalp." },
    { id: "sta_p", side: "both", group: "ECA", name: "STA — parietal branch", short: "STA parietal",
      path: ["@staBif", [72, -2, 40], [68, -16, 64], [56, -22, 88]], r: 0.6, r1: 0.4,
      label: { at: 0.6, pri: 3 }, drain: null, desc: "Parietal scalp." },

    /* -- veins and dural sinuses (schematic) ----------------------------- */
    { id: "sss", side: "mid", kind: "vein", group: "VEN", name: "Superior sagittal sinus", short: "SSS",
      path: [[0, 66, 30], [0, 52, 62], "#sssA", "#sssMid", [0, -32, 88], "#sssP", [0, -84, 38], "#torc"], r: 2.6, r1: 3.4,
      label: { at: 0.55, pri: 1 }, desc: "Midline, in the falx. Receives superficial cortical veins of both hemispheres." },
    { id: "iss", side: "mid", kind: "vein", group: "VEN", name: "Inferior sagittal sinus", short: "ISS",
      path: ["#issA", [0, 10, 48], [0, -12, 44], "#ssO"], r: 1.0,
      label: { at: 0.4, pri: 3 }, desc: "Free edge of the falx." },
    { id: "icv", side: "both", kind: "vein", group: "VEN", name: "Internal cerebral vein", short: "ICV",
      path: ["@deep", [3, 0, 27], "#galen"], r: 1.0,
      label: { at: 0.5, pri: 2 }, desc: "Deep venous drainage of the basal ganglia and thalamus." },
    { id: "basal", side: "both", kind: "vein", group: "VEN", name: "Basal vein of Rosenthal", short: "Basal v.",
      path: ["@basal", [20, -4, 10], [12, -16, 22], "#galen"], r: 0.9,
      label: { at: 0.4, pri: 3 }, desc: "Medial temporal lobe and midbrain, to the vein of Galen." },
    { id: "galen", side: "mid", kind: "vein", group: "VEN", name: "Vein of Galen", short: "V. of Galen",
      path: ["#galen", "#ssO"], r: 1.8, label: { at: 0.5, pri: 2 }, desc: "Joins the ICVs and basal veins to the straight sinus." },
    { id: "straight", side: "mid", kind: "vein", group: "VEN", name: "Straight sinus", short: "Straight sinus",
      path: ["#ssO", "#stS", [0, -74, 22], "#torc"], r: 2.0,
      label: { at: 0.4, pri: 2 }, desc: "Along the tentorium to the torcula." },
    { id: "trans", side: "both", kind: "vein", group: "VEN", name: "Transverse sinus", short: "Transverse",
      path: ["#torc", [22, -92, 12], "@tsMid", "@tsSig"], r: 2.8,
      label: { at: 0.5, pri: 1 }, desc: "Torcula to the sigmoid. Drawn symmetric; in life the right is often dominant." },
    { id: "sig", side: "both", kind: "vein", group: "VEN", name: "Sigmoid sinus", short: "Sigmoid",
      path: ["@tsSig", [54, -46, -18], [46, -34, -30], "@jb"], r: 2.8, label: { at: 0.5, pri: 2 },
      desc: "S-shaped course to the jugular bulb." },
    { id: "ijv", side: "both", kind: "vein", group: "VEN", name: "Internal jugular vein", short: "IJV",
      path: ["@jb", [38, -14, -60], [34, -6, -95], [30, -2, -120]], r: 3.6, label: { at: 0.4, pri: 2 },
      desc: "Jugular bulb into the neck." },
    { id: "trolard", side: "both", kind: "vein", group: "VEN", name: "Vein of Trolard (superior anastomotic)", short: "V. of Trolard",
      path: ["@trolardIn", [58, 2, 50], [36, -4, 84], "#sssMid"], r: 1.0,
      label: { at: 0.5, pri: 2 }, desc: "Sylvian region up to the SSS. Represents the superficial cortical drainage of the upper MCA territory." },
    { id: "labbe", side: "both", kind: "vein", group: "VEN", name: "Vein of Labbé (inferior anastomotic)", short: "V. of Labbé",
      path: ["@labbeIn", [58, -30, 4], [52, -58, -2], "@tsSig"], r: 1.0,
      label: { at: 0.5, pri: 2 }, desc: "Temporal lobe to the transverse sinus. Represents drainage of the lower MCA territory." },
  ];

  // Venous start points referenced by "drain" and by the veins themselves.
  Object.assign(SIDE_J, {
    deep:       [4, 14, 24],
    basal:      [18, 12, 6],
    trolardIn:  [50, 12, 22],
    labbeIn:    [50, 6, 18],
  });

  /* ---- mirroring ------------------------------------------------------ */
  const mirror = (p) => [-p[0], p[1], p[2]];

  function junctions() {
    const out = {};
    for (const [k, p] of Object.entries(SIDE_J)) {
      out[`R.${k}`] = p.slice();
      out[`L.${k}`] = mirror(p);
    }
    for (const [k, p] of Object.entries(MID_J)) out[`M.${k}`] = p.slice();
    return out;
  }

  // "@x" on side S -> "S.x"; "R@x" -> "R.x"; "#x" -> "M.x".
  function resolveRef(ref, side) {
    if (ref[0] === "#") return `M.${ref.slice(1)}`;
    if (ref[0] === "@") return `${side}.${ref.slice(1)}`;
    const m = /^([RL])@(.+)$/.exec(ref);
    if (m) return `${m[1]}.${m[2]}`;
    throw new Error(`bad junction ref ${ref}`);
  }

  /* Every vessel, both sides, with junction refs resolved and coordinates
     mirrored. id is "R.m1", "L.m1" or "M.basilar". */
  function vessels() {
    const out = [];
    for (const d of DEFS) {
      const sides = d.side === "mid" ? ["M"] : ["R", "L"];
      for (const s of sides) {
        const path = d.path.map((p) => {
          if (typeof p === "string") return resolveRef(p, s === "M" ? "M" : s);
          return s === "L" ? mirror(p) : p.slice();
        });
        const drain = d.drain === undefined ? undefined
          : d.drain === null ? null : resolveRef(d.drain, s === "M" ? "M" : s);
        const sideWord = s === "R" ? "Right" : s === "L" ? "Left" : "";
        out.push({
          ...d,
          key: d.id,
          id: `${s}.${d.id}`,
          side: s,
          path,
          drain,
          kind: d.kind || "artery",
          flow: d.flow || "fwd",
          r1: d.r1 == null ? d.r : d.r1,
          fullName: sideWord ? `${sideWord} ${lowerFirst(d.name)}` : d.name,
          tag: s === "M" ? d.short : `${s} ${d.short}`,
        });
      }
    }
    return out;
  }
  function lowerFirst(s) {
    // "ICA — C1" and "MCA …" keep their capitals; ordinary words don't.
    return /^[A-Z]{2}/.test(s) ? s : s[0].toLowerCase() + s.slice(1);
  }

  /* ---- coverage checklist ---------------------------------------------
     The structures the atlas was asked to include, and what the model
     actually has for each. "schematic" means drawn from textbook anatomy;
     nothing here is patient-derived. */
  const COVERAGE = [
    ["ICA segments C1–C7 (Bouthillier)", "schematic", "All seven segments, bilateral."],
    ["Ophthalmic artery", "schematic", "Bilateral; orbital branches grouped."],
    ["Posterior communicating artery", "schematic", "Bilateral; filling share is an editable assumption."],
    ["Anterior choroidal artery", "schematic", "Bilateral."],
    ["ACA A1, A2, ACom", "schematic", "Cross-filling across the ACom is an editable assumption."],
    ["ACA branches", "schematic", "Pericallosal, callosomarginal, frontopolar, recurrent artery of Heubner. Orbitofrontal and internal frontal branches grouped/not drawn."],
    ["MCA M1, M2 trunks, lenticulostriates, anterior temporal", "schematic", "Bifurcation pattern only (no trifurcation variant)."],
    ["MCA cortical branches", "schematic", "Five grouped branches (prefrontal, Rolandic, anterior parietal, angular, posterior temporal) stand in for ~12 named ones."],
    ["ECA trunk and eight principal branches", "schematic", "Superior thyroid, ascending pharyngeal, lingual, facial, occipital, posterior auricular, maxillary (with MMA), superficial temporal."],
    ["Vertebral arteries V2–V4", "schematic", "V1 not drawn (catheter sits in V2)."],
    ["Basilar, PICA, AICA, SCA", "schematic", "Bilateral, symmetric."],
    ["PCA P1, P2, cortical branches, thalamoperforators", "schematic", "Posterior choroidal arteries not drawn."],
    ["Dural sinuses and deep veins", "schematic", "SSS, ISS, ICV, basal vein, Galen, straight, transverse, sigmoid, IJV, Trolard, Labbé. Cavernous sinus, ophthalmic veins, superficial middle cerebral vein, petrosal veins not drawn."],
  ];

  const MISSING = [
    "Cavernous ICA branches (meningohypophyseal trunk, inferolateral trunk) and superior hypophyseal arteries.",
    "ECA–ICA and ECA–vertebral anastomoses (via ophthalmic, inferolateral trunk, ascending pharyngeal, occipital). An ECA run here never fills intracranial arteries.",
    "Venous drainage of ECA territories (scalp, face, pterygoid plexus) and of the orbit — an ECA run shows blush and washout but no venous phase.",
    "Anatomical variants: fetal PCA (available as an assumption), duplicated or absent A1, MCA trifurcation, persistent trigeminal artery, vertebral dominance or a vertebral ending in PICA.",
    "Anterior and posterior spinal arteries; vertebral muscular and radicular branches.",
    "Posterior choroidal arteries; medial lenticulostriates; labyrinthine artery.",
    "Leptomeningeal collaterals between territories.",
  ];

  AG.anatomy = { junctions, vessels, COVERAGE, MISSING, mirror };
})(window.AG);
