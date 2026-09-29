# Quantum Ladder

A course in quantum mechanics, from complex numbers to quantum field theory,
with the mathematics taught alongside the physics.

Open `quantum/index.html`. No build step, no dependencies. Like the rest of
this repository, it's plain HTML, CSS and JavaScript. Equations are typeset
by MathJax from jsDelivr; offline, they show as readable TeX source.

## What's inside

**Course**: 28 lessons on five rungs, each with worked prose, key equations
and "check your understanding" problems (multiple choice and numeric).

| Level | For | Covers |
| --- | --- | --- |
| 0 · Math toolkit | Anyone | Complex numbers, vectors & inner products, Hermitian matrices, probability, Fourier analysis, ODEs |
| 1 · The quantum surprise | Beginner | Photons, matter waves, the double slit, uncertainty |
| 2 · Wave mechanics | Undergraduate yr 2 | Schrödinger equation, box, superposition, tunnelling, oscillator & ladder operators |
| 3 · The formalism | Undergraduate yr 3 | Dirac notation, commutators & measurement, spin, hydrogen, perturbation theory, variational method |
| 4 · Theoretical physicist | Graduate | Entanglement & Bell, second quantization, path integrals, symmetry & Berry phase, Dirac equation, QFT, decoherence |

**Lab**: eight live simulations, computed in the browser:

- *Adding two amplitudes*: phasors and interference
- *Position vs momentum*: a packet and its Fourier transform; Δx·Δp ≥ ½
- *Double slit*: fringes built photon by photon, with a which-path detector
- *Wave packet evolution*: Crank–Nicolson solution of the time-dependent
  Schrödinger equation with barriers, steps, wells and traps; |ψ|² is coloured by phase
- *Stationary states*: eigenvalues and eigenfunctions of any 1-D potential
  (Sturm bisection + inverse iteration), superpositions evolving in time,
  and perturbation theory against the exact answer
- *Bloch sphere*: gates, rotations and repeated measurement on a qubit
- *Hydrogen orbitals*: |ψₙₗₘ|² up to n = 5, with radial distributions
- *Bell test*: CHSH against a local hidden-variable model

**Math Gym**: 20 problem generators (complex arithmetic, eigenvalues,
photoelectric effect, box energies, tunnelling, hydrogen lines, spin,
perturbation theory, Bell correlations, purity, fermion filling). Each
problem gets fresh numbers and a worked solution. Answers can be typed as
expressions: `sqrt(2)/2`, `3pi^2/2`, `1.2e-10`.

Progress (solved problems, Gym streak) is kept in the browser's
localStorage and nowhere else.

## Tests

```
node quantum/selftest.mjs
```

It checks the numerics against textbook results (box and oscillator levels,
Airy-zero bouncing-ball levels, unitarity and spreading of the time stepper,
barrier transmission, Gaussian Fourier widths, hydrogen normalization and ⟨r⟩,
gate/rotation equivalence, Tsirelson's bound, the local model's |S| ≤ 2).
It also checks the course: every numeric exercise must accept its own answer
typed to 4 significant figures, and every generator is run with 40 seeds.
CI runs it on every push (`.github/workflows/checks.yml`).

## Layout

```
quantum/
  index.html        page shell
  style.css         tokens (light + dark), layout
  js/physics.js     solvers and exact results (no DOM)
  js/exercises.js   answer parser + Math Gym generators
  js/curriculum.js  the lessons
  js/sims.js        canvas simulations
  js/app.js         routing (#lesson-box, #lab-bell, #gym-tunnel), progress
  selftest.mjs      offline test suite
```
