/* Neuro Multiverse — page behaviour. No dependencies. */

// ---------- Settings you will want to change ----------
const SITE = {
  // Your Instagram username, without the @.
  instagramHandle: "neuromultiverse",
  // Where the sign-up form POSTs JSON ({ email, role }). Leave empty until you
  // connect a mailing service (Formspree, Buttondown, Mailchimp, your own API).
  signupEndpoint: "",
};

// ---------- Quantum Stroke content ----------
const TERRITORIES = [
  {
    id: "lmca", name: "Left MCA", tag: "dominant",
    vessel: "Middle cerebral artery · left",
    supplies: ["Lateral frontal, parietal and temporal cortex", "Internal capsule and basal ganglia via lenticulostriates"],
    deficits: ["Right face and arm weaker than leg", "Right-sided sensory loss", "Aphasia: Broca (superior division) or Wernicke (inferior division)", "Right homonymous hemianopia", "Gaze deviation to the left"],
    pearl: "In a hemispheric stroke the eyes look toward the lesion and away from the weak side.",
  },
  {
    id: "rmca", name: "Right MCA", tag: "non-dominant",
    vessel: "Middle cerebral artery · right",
    supplies: ["Lateral right hemisphere cortex", "Right internal capsule and basal ganglia"],
    deficits: ["Left face and arm weaker than leg", "Left hemispatial neglect", "Anosognosia: unaware of the deficit", "Dressing and constructional apraxia", "Gaze deviation to the right"],
    pearl: "The NIHSS weights language heavily, so a right MCA stroke scores lower than a left one of the same volume.",
  },
  {
    id: "aca", name: "ACA", tag: "medial",
    vessel: "Anterior cerebral artery",
    supplies: ["Medial frontal and parietal cortex", "Paracentral lobule (leg area)", "Anterior corpus callosum"],
    deficits: ["Contralateral leg weaker than arm", "Abulia and slowed responses", "Urinary incontinence", "Grasp reflex", "Transcortical motor aphasia if left-sided"],
    pearl: "Both ACAs can arise from one A2 trunk. Its occlusion gives bilateral leg weakness that mimics a cord lesion.",
  },
  {
    id: "pca", name: "PCA", tag: "posterior",
    vessel: "Posterior cerebral artery",
    supplies: ["Occipital lobe", "Medial and inferior temporal lobe", "Thalamus via thalamoperforators"],
    deficits: ["Contralateral homonymous hemianopia, often macular sparing", "Alexia without agraphia (left PCA with splenium)", "Memory loss from hippocampal infarction", "Thalamic sensory loss"],
    pearl: "Patients often don't notice a field cut. They present after walking into door frames, with a low NIHSS.",
  },
  {
    id: "basilar", name: "Basilar", tag: "brainstem",
    vessel: "Basilar artery",
    supplies: ["Pons and midbrain", "Cerebellum (AICA, SCA)", "Thalami and occipital lobes via the PCAs"],
    deficits: ["Reduced consciousness or coma", "Quadriparesis or crossed signs", "Ophthalmoplegia, pinpoint pupils", "Dysarthria and dysphagia", "Locked-in syndrome"],
    pearl: "A stuttering course of dizziness, diplopia and slurred speech can precede occlusion. Thrombectomy now has trial support (ATTENTION, BAOCHE).",
  },
  {
    id: "lacunar", name: "Lacunar", tag: "perforators",
    vessel: "Small penetrating arteries",
    supplies: ["Internal capsule", "Thalamus", "Basis pontis", "Corona radiata"],
    deficits: ["Pure motor hemiparesis", "Pure sensory stroke", "Ataxic hemiparesis", "Dysarthria–clumsy hand", "Sensorimotor stroke"],
    pearl: "No cortical signs. Aphasia, neglect or a field cut argue against a lacune.",
  },
  {
    id: "pica", name: "Lateral medulla", tag: "vertebral / PICA",
    vessel: "Vertebral artery or PICA · Wallenberg",
    supplies: ["Lateral medulla", "Inferior cerebellum"],
    deficits: ["Vertigo, nystagmus, vomiting", "Ipsilateral Horner syndrome", "Ipsilateral face and contralateral body pain/temperature loss", "Hoarseness and dysphagia (nucleus ambiguus)", "Ipsilateral limb ataxia"],
    pearl: "The NIHSS can be 0. Use HINTS in acute vertigo before calling it peripheral.",
  },
];

const TRIALS = [
  { name: "AcT", year: "Lancet 2022", q: "Is tenecteplase as good as alteplase within 4.5 hours?", find: "Tenecteplase 0.25 mg/kg was non-inferior to alteplase for excellent functional outcome.", signal: ["yes", "Changed practice"] },
  { name: "SELECT2 · ANGEL-ASPECT", year: "NEJM 2023", q: "Does thrombectomy help when the ischaemic core is already large?", find: "Yes. Thrombectomy improved functional outcome in large-core strokes, with more haemorrhage but no excess mortality.", signal: ["yes", "Changed practice"] },
  { name: "ATTENTION · BAOCHE", year: "NEJM 2022", q: "Does thrombectomy help basilar artery occlusion?", find: "Thrombectomy improved functional outcome over medical therapy, up to 12 h (ATTENTION) and 6–24 h (BAOCHE).", signal: ["yes", "Changed practice"] },
  { name: "ESCAPE-MeVO · DISTAL", year: "NEJM 2025", q: "Should we chase medium and distal vessel occlusions?", find: "Thrombectomy did not improve outcomes over best medical treatment for these smaller occlusions.", signal: ["no", "No benefit shown"] },
  { name: "TIMELESS", year: "NEJM 2024", q: "Does tenecteplase help at 4.5–24 hours before thrombectomy?", find: "No significant improvement in functional outcome; most patients went on to thrombectomy.", signal: ["no", "No benefit shown"] },
  { name: "ELAN", year: "NEJM 2023", q: "How soon can a DOAC start after AF-related ischaemic stroke?", find: "Early start was not associated with more recurrence or bleeding than a later start.", signal: ["mixed", "Reassuring"] },
  { name: "INTERACT3", year: "Lancet 2023", q: "Does a bundle of care improve intracerebral haemorrhage outcomes?", find: "Early control of blood pressure, glucose and fever plus anticoagulant reversal improved functional outcome.", signal: ["yes", "Changed practice"] },
  { name: "ENRICH", year: "NEJM 2024", q: "Can minimally invasive surgery help lobar haemorrhage?", find: "Minimally invasive evacuation improved 180-day outcome, with the benefit seen in lobar bleeds.", signal: ["yes", "Practice moving"] },
];

// Each option: [label, detail] for a status in a given minute range.
function windowOptions(min) {
  const h = min / 60;
  const ivt =
    h <= 4.5 ? ["go", "Studied", "IV thrombolysis", "Alteplase or tenecteplase within 4.5 h (NINDS, ECASS III, AcT)."]
    : h <= 9 ? ["maybe", "Imaging", "IV thrombolysis", "Beyond 4.5 h only with perfusion mismatch (EXTEND) or DWI–FLAIR mismatch in unknown onset (WAKE-UP)."]
    : ["no", "Not studied", "IV thrombolysis", "No trial support for routine use this late."];
  const evt =
    h <= 6 ? ["go", "Studied", "Thrombectomy · anterior LVO", "Benefit shown within 6 h (HERMES pooled analysis)."]
    : h <= 24 ? ["maybe", "Imaging", "Thrombectomy · anterior LVO", "6–24 h with clinical–core or perfusion mismatch (DAWN, DEFUSE 3)."]
    : ["no", "Not studied", "Thrombectomy · anterior LVO", "Outside the windows of the landmark trials."];
  const ba =
    h <= 24 ? ["go", "Studied", "Thrombectomy · basilar", "Benefit up to 12 h (ATTENTION) and 6–24 h (BAOCHE)."]
    : ["no", "Not studied", "Thrombectomy · basilar", "Beyond 24 h is outside trial data."];
  return [ivt, evt, ba];
}

// ---------- Helpers ----------
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } },
};

// ---------- Nav + theme ----------
function initNav() {
  const btn = $("#navToggle");
  const links = $("#navLinks");
  btn.addEventListener("click", () => {
    const open = links.classList.toggle("open");
    btn.setAttribute("aria-expanded", String(open));
  });
  links.addEventListener("click", (e) => {
    if (e.target.closest("a")) { links.classList.remove("open"); btn.setAttribute("aria-expanded", "false"); }
  });

  const root = document.documentElement;
  const saved = store.get("nm-theme");
  if (saved === "light" || saved === "dark") root.dataset.theme = saved;
  $("#themeBtn").addEventListener("click", () => {
    const isDark = root.dataset.theme
      ? root.dataset.theme === "dark"
      : window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = isDark ? "light" : "dark";
    store.set("nm-theme", root.dataset.theme);
    window.dispatchEvent(new Event("themechange"));
  });
}

// ---------- Time is brain counter ----------
function initNeuronClock() {
  const el = $("#neuronCount");
  const perMs = 1.9e6 / 60000;
  const start = performance.now();
  const fmt = new Intl.NumberFormat("en-US");
  const tick = () => {
    el.textContent = fmt.format(Math.floor((performance.now() - start) * perMs));
    setTimeout(tick, reduceMotion ? 1000 : 80);
  };
  tick();
}

// ---------- Quantum Stroke tabs ----------
function initTabs() {
  const tabs = [...document.querySelectorAll(".qs-tabs [role=tab]")];
  const select = (tab) => {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
    });
  };
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => select(t));
    t.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
      select(next); next.focus();
    });
  });
  select(tabs[0]);
}

// ---------- Vascular territories ----------
function initTerritories() {
  const list = $("#territoryList");
  const card = $("#territoryCard");
  list.innerHTML = TERRITORIES.map((t) =>
    `<button type="button" role="option" data-id="${t.id}" aria-selected="false">${esc(t.name)}<span>${esc(t.tag)}</span></button>`
  ).join("");

  const show = (id) => {
    const t = TERRITORIES.find((x) => x.id === id) || TERRITORIES[0];
    list.querySelectorAll("button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.id === t.id)));
    card.innerHTML = `
      <p class="vessel">${esc(t.vessel)}</p>
      <h3>${esc(t.name)} stroke</h3>
      <div class="t-grid">
        <div><h4>Supplies</h4><ul>${t.supplies.map((s) => `<li>${esc(s)}</li>`).join("")}</ul></div>
        <div><h4>Classic deficits</h4><ul>${t.deficits.map((s) => `<li>${esc(s)}</li>`).join("")}</ul></div>
      </div>
      <p class="pearl"><b>Pearl</b>${esc(t.pearl)}</p>`;
  };
  list.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (b) show(b.dataset.id);
  });
  show(TERRITORIES[0].id);
}

// ---------- Trials ----------
function initTrials() {
  $("#trialList").innerHTML = TRIALS.map((t) => `
    <article class="trial">
      <div class="trial-top"><h3>${esc(t.name)}</h3><span class="yr">${esc(t.year)}</span></div>
      <p class="q">${esc(t.q)}</p>
      <p class="find">${esc(t.find)}</p>
      <span class="signal signal-${t.signal[0]}">${esc(t.signal[1])}</span>
    </article>`).join("");
}

// ---------- Window check ----------
function initWindow() {
  const range = $("#lkwRange");
  const out = $("#lkwOut");
  const list = $("#windowList");
  const render = () => {
    const m = Number(range.value);
    out.textContent = `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
    list.innerHTML = windowOptions(m).map(([st, label, name, detail]) =>
      `<li><span class="st st-${st}">${esc(label)}</span><b>${esc(name)}</b><small>${esc(detail)}</small></li>`
    ).join("");
  };
  range.addEventListener("input", render);
  render();
}

// ---------- Instagram + sign-up ----------
function initSocial() {
  const url = `https://www.instagram.com/${encodeURIComponent(SITE.instagramHandle)}/`;
  document.querySelectorAll('#instagram a[href^="https://www.instagram.com"]').forEach((a) => { a.href = url; });
  $("#igFollow").textContent = `Follow @${SITE.instagramHandle}`;
}

function initForm() {
  const form = $("#waitForm");
  const email = $("#waitEmail");
  const msg = $("#waitMsg");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!email.checkValidity() || !email.value.trim()) {
      msg.textContent = "Enter a valid email address, like name@hospital.org.";
      email.focus();
      return;
    }
    if (!SITE.signupEndpoint) {
      msg.textContent = `Sign-ups open soon. Follow @${SITE.instagramHandle} on Instagram for the launch.`;
      return;
    }
    msg.textContent = "Joining…";
    try {
      const res = await fetch(SITE.signupEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ email: email.value.trim(), role: $("#waitRole").value }),
      });
      if (!res.ok) throw new Error(String(res.status));
      msg.textContent = "You're on the list. Watch your inbox for the next round-up.";
      form.reset();
    } catch {
      msg.textContent = "That didn't go through. Check your connection and try again.";
    }
  });
}

// ---------- Hero neural network ----------
function initCanvas() {
  const canvas = $("#neuralCanvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  let w = 0, h = 0, nodes = [], pulses = [], colors = {}, raf = 0;

  const readColors = () => {
    const cs = getComputedStyle(document.documentElement);
    colors = { node: cs.getPropertyValue("--accent").trim(), line: cs.getPropertyValue("--line").trim(), spark: cs.getPropertyValue("--vessel").trim() };
  };

  const build = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.round(Math.min(90, (w * h) / 14000));
    // Nodes are weighted toward the right so the headline stays clear.
    nodes = Array.from({ length: count }, () => ({
      x: w * (0.35 + 0.65 * Math.sqrt(Math.random())),
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.15,
      vy: (Math.random() - 0.5) * 0.15,
      r: 1.5 + Math.random() * 2.2,
    }));
    pulses = [];
  };

  const edges = () => {
    const out = [];
    const max = 130;
    for (let i = 0; i < nodes.length; i++)
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y;
        const d = Math.hypot(dx, dy);
        if (d < max) out.push([i, j, 1 - d / max]);
      }
    return out;
  };

  const draw = () => {
    ctx.clearRect(0, 0, w, h);
    const es = edges();
    ctx.strokeStyle = colors.line;
    es.forEach(([i, j, s]) => {
      ctx.globalAlpha = s * 0.9;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(nodes[i].x, nodes[i].y); ctx.lineTo(nodes[j].x, nodes[j].y); ctx.stroke();
    });
    ctx.fillStyle = colors.node;
    nodes.forEach((n) => { ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.fill(); });
    ctx.fillStyle = colors.spark;
    pulses.forEach((p) => {
      const a = nodes[p.a], b = nodes[p.b];
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(a.x + (b.x - a.x) * p.t, a.y + (b.y - a.y) * p.t, 2.4, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;
    return es;
  };

  const step = () => {
    nodes.forEach((n) => {
      n.x += n.vx; n.y += n.vy;
      if (n.x < 0 || n.x > w) n.vx *= -1;
      if (n.y < 0 || n.y > h) n.vy *= -1;
    });
    const es = draw();
    // Fire an "action potential" along a random edge now and then; when it
    // arrives it may propagate to a neighbour, like a chain of synapses.
    if (es.length && pulses.length < 6 && Math.random() < 0.04) {
      const [a, b] = es[(Math.random() * es.length) | 0];
      pulses.push({ a, b, t: 0 });
    }
    pulses = pulses.flatMap((p) => {
      p.t += 0.025;
      if (p.t < 1) return [p];
      const next = es.filter(([i, j]) => (i === p.b || j === p.b) && i !== p.a && j !== p.a);
      if (next.length && Math.random() < 0.7) {
        const [i, j] = next[(Math.random() * next.length) | 0];
        return [{ a: p.b, b: i === p.b ? j : i, t: 0 }];
      }
      return [];
    });
    raf = requestAnimationFrame(step);
  };

  const start = () => {
    cancelAnimationFrame(raf);
    readColors(); build();
    if (reduceMotion) draw(); else step();
  };

  let resizeTimer;
  window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(start, 150); });
  window.addEventListener("themechange", () => { readColors(); if (reduceMotion) draw(); });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => { readColors(); if (reduceMotion) draw(); });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) cancelAnimationFrame(raf);
    else if (!reduceMotion) { cancelAnimationFrame(raf); step(); }
  });
  start();
}

// ---------- Boot ----------
document.addEventListener("DOMContentLoaded", () => {
  $("#year").textContent = new Date().getFullYear();
  initNav();
  initNeuronClock();
  initTabs();
  initTerritories();
  initTrials();
  initWindow();
  initSocial();
  initForm();
  initCanvas();
});
