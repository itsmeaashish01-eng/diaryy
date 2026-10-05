/* ================================================
   MARKET LENS — lib/quantum.mjs
   The "quantum probability": putting the evidence together.

   This is quantum-*inspired* maths running on your ordinary CPU — the
   probability rules of quantum mechanics used as a way to combine
   evidence, not a quantum computer and not a source of extra accuracy.
   What it buys over a plain average is a principled way to let signals
   that agree reinforce each other and signals that disagree cancel out.

   Each piece of evidence i says "up with probability p_i". Write it as a
   qubit with amplitudes, not probabilities:

        |ψ_i⟩ = √p_i |up⟩ + √(1 − p_i) |down⟩

   Superpose them, each weighted by how much we trust that source:

        |Ψ⟩ = Σ α_i |ψ_i⟩

   and read off the answer with the Born rule:

        P(up) = |⟨up|Ψ⟩|² / ⟨Ψ|Ψ⟩

   The cross terms α_i α_j √(p_i p_j) are the interference. ⟨Ψ|Ψ⟩ itself
   is the *fidelity* of the evidence: 1 when every source says the same
   thing, smaller as they pull apart.

   Last, decoherence. When the sources are thin (little news, no filings,
   a model that showed little skill out of sample), the state is mixed
   with the maximally uncertain one, ρ = C|Ψ⟩⟨Ψ| + (1 − C)·I/2, so a
   weak case can't produce a confident-looking number.
   ================================================ */

/* sources: [{ id, label, p, weight, confidence }]  (p may be null: skipped) */
export function fuse(sources) {
  const live = sources.filter((s) => s.p != null && Number.isFinite(s.p) && s.weight > 0 && s.confidence > 0);
  if (!live.length) return { p: 0.5, fidelity: 1, consensus: 0, confidence: 0, band: [0.5, 0.5], parts: [] };

  const pureWeight = sources.reduce((s, x) => s + (x.weight || 0), 0) || 1;
  const raw = live.map((s) => s.weight * s.confidence);
  const total = raw.reduce((a, b) => a + b, 0);
  const alpha = raw.map((r) => r / total);

  const coherent = (idx) => {
    let up = 0, down = 0, norm = 0;
    for (const i of idx) {
      const p = Math.min(0.999, Math.max(0.001, live[i].p));
      up += alpha[i] * Math.sqrt(p);
      down += alpha[i] * Math.sqrt(1 - p);
      norm += alpha[i];
    }
    up /= norm; down /= norm;
    return { pUp: (up * up) / (up * up + down * down), fidelity: up * up + down * down };
  };

  const all = live.map((_, i) => i);
  const { pUp, fidelity } = coherent(all);

  // Overall trust: how much of the evidence we wanted actually turned up, and how solid it is.
  const C = total / pureWeight;
  const mixed = (x) => C * x + (1 - C) * 0.5;
  const p = mixed(pUp);

  // How much rests on any one source: the answer with each left out in turn.
  const loo = live.length > 1
    ? all.map((k) => mixed(coherent(all.filter((i) => i !== k)).pUp))
    : [p];
  const band = [Math.min(p, ...loo), Math.max(p, ...loo)];

  // Share of the trusted weight sitting on the same side of 50% as the answer.
  const side = Math.sign(p - 0.5);
  const consensus = side === 0 ? 0 : live.reduce((s, x, i) => s + (Math.sign(x.p - 0.5) === side ? alpha[i] : 0), 0);

  return {
    p,
    coherentP: pUp,
    fidelity,
    consensus,
    confidence: C,
    band,
    parts: live.map((s, i) => ({ id: s.id, label: s.label, p: s.p, share: alpha[i] })),
  };
}
