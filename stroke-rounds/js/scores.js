/* ==========================================================
   StrokeRounds — scores.js
   Bedside scales and calculators, defined as data so the UI can
   render any of them from one generic renderer.

   These are aids for a clinician who already knows the scales.
   They do not replace institutional protocol or the package insert.
   ========================================================== */

const Scores = (() => {

  /* ---------- Scales scored by summing item selections ---------- */

  const SCALES = {

    nihss: {
      id: "nihss",
      name: "NIH Stroke Scale",
      sub: "15 items · 0–42 · score what you see, not what you think",
      items: [
        { label: "1a. Level of consciousness", opts: [
          ["Alert", 0], ["Not alert, rousable", 1], ["Not alert, repeated stim", 2], ["Unresponsive / reflex only", 3]] },
        { label: "1b. LOC questions (month, age)", opts: [
          ["Both correct", 0], ["One correct", 1], ["Neither correct", 2]] },
        { label: "1c. LOC commands (open eyes, grip)", opts: [
          ["Both correct", 0], ["One correct", 1], ["Neither correct", 2]] },
        { label: "2. Best gaze", opts: [
          ["Normal", 0], ["Partial gaze palsy", 1], ["Forced deviation", 2]] },
        { label: "3. Visual fields", opts: [
          ["No loss", 0], ["Partial hemianopia", 1], ["Complete hemianopia", 2], ["Bilateral hemianopia", 3]] },
        { label: "4. Facial palsy", opts: [
          ["Normal", 0], ["Minor", 1], ["Partial", 2], ["Complete", 3]] },
        { label: "5a. Left arm motor", opts: [
          ["No drift", 0], ["Drift", 1], ["Some effort vs gravity", 2], ["No effort vs gravity", 3], ["No movement", 4], ["Amputation / fused (UN)", 0]] },
        { label: "5b. Right arm motor", opts: [
          ["No drift", 0], ["Drift", 1], ["Some effort vs gravity", 2], ["No effort vs gravity", 3], ["No movement", 4], ["Amputation / fused (UN)", 0]] },
        { label: "6a. Left leg motor", opts: [
          ["No drift", 0], ["Drift", 1], ["Some effort vs gravity", 2], ["No effort vs gravity", 3], ["No movement", 4], ["Amputation / fused (UN)", 0]] },
        { label: "6b. Right leg motor", opts: [
          ["No drift", 0], ["Drift", 1], ["Some effort vs gravity", 2], ["No effort vs gravity", 3], ["No movement", 4], ["Amputation / fused (UN)", 0]] },
        { label: "7. Limb ataxia", opts: [
          ["Absent", 0], ["One limb", 1], ["Two limbs", 2]] },
        { label: "8. Sensory", opts: [
          ["Normal", 0], ["Mild–moderate loss", 1], ["Severe / total loss", 2]] },
        { label: "9. Best language", opts: [
          ["No aphasia", 0], ["Mild–moderate", 1], ["Severe", 2], ["Mute / global", 3]] },
        { label: "10. Dysarthria", opts: [
          ["Normal", 0], ["Mild–moderate", 1], ["Severe / anarthric", 2], ["Intubated (UN)", 0]] },
        { label: "11. Extinction / inattention", opts: [
          ["No abnormality", 0], ["One modality", 1], ["Profound / >1 modality", 2]] },
      ],
      interpret(t) {
        if (t === 0) return "No stroke symptoms";
        if (t <= 4)  return "Minor stroke";
        if (t <= 15) return "Moderate stroke";
        if (t <= 20) return "Moderate–severe stroke";
        return "Severe stroke";
      },
    },

    chadsvasc: {
      id: "chadsvasc",
      name: "CHA₂DS₂-VASc",
      sub: "Annual stroke risk in non-valvular atrial fibrillation",
      items: [
        { label: "Congestive heart failure / LV dysfunction", opts: [["No", 0], ["Yes", 1]] },
        { label: "Hypertension",                              opts: [["No", 0], ["Yes", 1]] },
        { label: "Age",                                       opts: [["< 65", 0], ["65–74", 1], ["≥ 75", 2]] },
        { label: "Diabetes mellitus",                         opts: [["No", 0], ["Yes", 1]] },
        { label: "Prior stroke / TIA / thromboembolism",       opts: [["No", 0], ["Yes", 2]] },
        { label: "Vascular disease (MI, PAD, aortic plaque)",  opts: [["No", 0], ["Yes", 1]] },
        { label: "Sex category",                              opts: [["Male", 0], ["Female", 1]] },
      ],
      interpret(t) {
        const risk = { 0: "0.2%", 1: "0.6%", 2: "2.2%", 3: "3.2%", 4: "4.8%",
                       5: "7.2%", 6: "9.7%", 7: "11.2%", 8: "10.8%", 9: "12.2%" };
        return `≈ ${risk[Math.min(t, 9)]} / year ischemic stroke risk untreated`;
      },
    },

    hasbled: {
      id: "hasbled",
      name: "HAS-BLED",
      sub: "Major bleeding risk on anticoagulation — a prompt to fix modifiable risks, not to withhold",
      items: [
        { label: "Hypertension (uncontrolled, SBP > 160)", opts: [["No", 0], ["Yes", 1]] },
        { label: "Abnormal renal function",                opts: [["No", 0], ["Yes", 1]] },
        { label: "Abnormal liver function",                opts: [["No", 0], ["Yes", 1]] },
        { label: "Prior stroke",                           opts: [["No", 0], ["Yes", 1]] },
        { label: "Bleeding history or predisposition",     opts: [["No", 0], ["Yes", 1]] },
        { label: "Labile INR (on warfarin)",               opts: [["No", 0], ["Yes", 1]] },
        { label: "Elderly (> 65)",                         opts: [["No", 0], ["Yes", 1]] },
        { label: "Drugs (antiplatelet / NSAID)",           opts: [["No", 0], ["Yes", 1]] },
        { label: "Alcohol ≥ 8 drinks/week",                opts: [["No", 0], ["Yes", 1]] },
      ],
      interpret(t) {
        if (t <= 2) return "Low–moderate bleeding risk";
        return "High bleeding risk (≥ 3) — address modifiable factors, review more often";
      },
    },

    ich: {
      id: "ich",
      name: "ICH Score",
      sub: "30-day mortality after spontaneous intracerebral hemorrhage",
      items: [
        { label: "GCS",                          opts: [["13–15", 0], ["5–12", 1], ["3–4", 2]] },
        { label: "ICH volume",                   opts: [["< 30 mL", 0], ["≥ 30 mL", 1]] },
        { label: "Intraventricular hemorrhage",  opts: [["No", 0], ["Yes", 1]] },
        { label: "Infratentorial origin",        opts: [["No", 0], ["Yes", 1]] },
        { label: "Age",                          opts: [["< 80", 0], ["≥ 80", 1]] },
      ],
      interpret(t) {
        const m = { 0: "0%", 1: "13%", 2: "26%", 3: "72%", 4: "97%", 5: "100%", 6: "100%" };
        return `≈ ${m[t]} 30-day mortality in the original cohort`;
      },
    },

    abcd2: {
      id: "abcd2",
      name: "ABCD²",
      sub: "Early stroke risk after TIA",
      items: [
        { label: "Age ≥ 60",              opts: [["No", 0], ["Yes", 1]] },
        { label: "BP ≥ 140/90 at present", opts: [["No", 0], ["Yes", 1]] },
        { label: "Clinical features",     opts: [["Other", 0], ["Speech impairment, no weakness", 1], ["Unilateral weakness", 2]] },
        { label: "Duration",              opts: [["< 10 min", 0], ["10–59 min", 1], ["≥ 60 min", 2]] },
        { label: "Diabetes",              opts: [["No", 0], ["Yes", 1]] },
      ],
      interpret(t) {
        if (t <= 3) return "Low (≈1% 2-day stroke risk)";
        if (t <= 5) return "Moderate (≈4% 2-day stroke risk)";
        return "High (≈8% 2-day stroke risk)";
      },
    },

    mrs: {
      id: "mrs",
      name: "Modified Rankin Scale",
      sub: "Pick one level — pre-morbid on admission, functional at discharge",
      single: true,
      items: [
        { label: "Level", opts: [
          ["0 · No symptoms", 0],
          ["1 · No significant disability", 1],
          ["2 · Slight disability", 2],
          ["3 · Moderate — walks unaided", 3],
          ["4 · Moderately severe — cannot walk unassisted", 4],
          ["5 · Severe — bedridden, constant care", 5],
          ["6 · Dead", 6]] },
      ],
      interpret(t) {
        return t <= 2 ? "Functionally independent (mRS 0–2)" : "Dependent (mRS 3–5)";
      },
    },
  };

  /* ---------- Thrombolytic dosing ---------- */

  function alteplase(weightKg) {
    const w = Math.max(0, Number(weightKg) || 0);
    const total = Math.min(0.9 * w, 90);
    const bolus = total * 0.1;
    return {
      total:   round1(total),
      bolus:   round1(bolus),
      infusion: round1(total - bolus),
      capped:  0.9 * w > 90,
      note: "0.9 mg/kg (max 90 mg): 10% as bolus over 1 min, remainder over 60 min.",
    };
  }

  function tenecteplase(weightKg, dosePerKg = 0.25) {
    const w = Math.max(0, Number(weightKg) || 0);
    const cap = dosePerKg === 0.25 ? 25 : 50;
    const total = Math.min(dosePerKg * w, cap);
    return {
      total: round1(total),
      capped: dosePerKg * w > cap,
      note: `${dosePerKg} mg/kg (max ${cap} mg) as a single IV bolus over ~5 seconds.`,
    };
  }

  /** ABC/2 estimate of hematoma volume, in mL. */
  function ichVolume(a, b, slices, sliceThicknessCm = 0.5) {
    const A = Number(a) || 0, B = Number(b) || 0;
    const C = (Number(slices) || 0) * (Number(sliceThicknessCm) || 0);
    return round1((A * B * C) / 2);
  }

  const round1 = (n) => Math.round(n * 10) / 10;

  /* ---------- Reference cards ---------- */

  const REFERENCE = [
    {
      title: "Blood pressure targets",
      rows: [
        ["Pre-thrombolytic", "< 185/110 before the bolus"],
        ["First 24 h post-lytic", "< 180/105"],
        ["Post-EVT, recanalized", "Often < 160 or < 140 systolic — per protocol"],
        ["AIS, no reperfusion therapy", "Permissive to 220/120 unless another indication"],
        ["ICH, SBP 150–220", "Lower to ~140 (avoid dips below 130)"],
      ],
    },
    {
      title: "Antithrombotic timing",
      rows: [
        ["After IV thrombolysis", "No antiplatelet/anticoag for 24 h; repeat imaging first"],
        ["Minor stroke / high-risk TIA", "DAPT 21–90 days, then single agent"],
        ["AF, small infarct", "Anticoagulate early — day 3–5 typical"],
        ["AF, large infarct", "Delay ~day 7–14; re-image before starting"],
        ["Symptomatic ICAD", "DAPT 90 days + aggressive risk factor control"],
      ],
    },
    {
      title: "Secondary prevention targets",
      rows: [
        ["LDL", "< 70 mg/dL (high-intensity statin ± ezetimibe/PCSK9)"],
        ["HbA1c", "< 7% for most"],
        ["BP long term", "< 130/80 once stable"],
        ["Carotid stenosis", "Symptomatic 70–99% → revascularize, usually within 2 weeks"],
        ["Lifestyle", "Smoking cessation, OSA screening, 150 min/wk activity"],
      ],
    },
  ];

  return { SCALES, alteplase, tenecteplase, ichVolume, REFERENCE };
})();
