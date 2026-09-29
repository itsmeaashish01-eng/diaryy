/* ================================================
   QUANTUM LADDER — curriculum.js
   The course. Five rungs, each a set of lessons; every lesson has prose
   with TeX in \( … \) / \[ … \], optionally a simulation to play with,
   check-your-understanding questions, and links into the Math Gym.

   Bodies are String.raw so TeX backslashes survive untouched.
   Exercise kinds:
     mc  — { q, options[], answer: index, why }
     num — { q, answer: number, tol (relative), why }
   ================================================ */
(function (root) {
  "use strict";
  const R = String.raw;

  const levels = [
    { n: 0, name: "Math toolkit", who: "Start here if calculus is rusty", blurb: "Complex numbers, vectors, matrices, probability and Fourier analysis: the language the rest is written in." },
    { n: 1, name: "The quantum surprise", who: "Beginner", blurb: "The experiments that broke classical physics, told with as little math as possible." },
    { n: 2, name: "Wave mechanics", who: "Undergraduate, year 2", blurb: "The Schrödinger equation, solved and watched: boxes, oscillators, tunnelling." },
    { n: 3, name: "The formalism", who: "Undergraduate, year 3", blurb: "Hilbert space, operators, spin, angular momentum, hydrogen and the approximation methods." },
    { n: 4, name: "Theoretical physicist", who: "Graduate", blurb: "Entanglement, many-body theory, path integrals, symmetry, relativity and the road to quantum field theory." },
  ];

  const lessons = [
    /* ================= LEVEL 0 — MATH TOOLKIT ================= */
    {
      id: "complex", level: 0, title: "Complex numbers and phase", minutes: 15,
      sim: { id: "phasor" },
      body: R`
<p>Quantum mechanics is written in complex numbers, and not as a trick: amplitudes have a <em>size</em> and a <em>phase</em>, and interference is what phases do when amplitudes add.</p>
<p>A complex number \(z = a + ib\) with \(i^2 = -1\) is a point in the plane. Its polar form is</p>
\[ z = r\,e^{i\theta} = r(\cos\theta + i\sin\theta), \qquad r = |z| = \sqrt{a^2+b^2}, \quad \theta = \arg z. \]
<p>That identity is Euler's formula. Multiplying complex numbers multiplies their lengths and <em>adds</em> their angles, so multiplying by \(e^{i\varphi}\) is a pure rotation. The complex conjugate \(z^* = a - ib\) reflects across the real axis, and \(z^*z = |z|^2\) is always real and non-negative.</p>
<h3>Why physicists care</h3>
<p>If a particle can reach a detector by two routes with amplitudes \(\psi_1\) and \(\psi_2\), the probability is</p>
\[ P = |\psi_1 + \psi_2|^2 = |\psi_1|^2 + |\psi_2|^2 + 2|\psi_1||\psi_2|\cos(\theta_1 - \theta_2). \]
<p>The last term is interference. It can be as large as the others or cancel them outright. The simulation shows two phasors adding; turn the relative phase and watch the probability swing between \((|\psi_1|+|\psi_2|)^2\) and \((|\psi_1|-|\psi_2|)^2\). Spin the global phase and notice that nothing measurable changes: only <em>relative</em> phases are physical.</p>`,
      exercises: [
        { kind: "num", q: R`Compute \(|3 + 4i|\).`, answer: 5, tol: 0.001, why: R`\(\sqrt{9+16} = 5\).` },
        { kind: "mc", q: R`Multiplying a complex number by \(i\) does what, geometrically?`, options: ["Doubles its length", "Rotates it by 90° anticlockwise", "Reflects it across the real axis", "Nothing measurable"], answer: 1, why: R`\(i = e^{i\pi/2}\): length 1, angle \(90^\circ\).` },
        { kind: "num", q: R`Evaluate \(e^{i\pi} + 1\).`, answer: 0, tol: 0.001, why: R`Euler: \(e^{i\pi} = \cos\pi + i\sin\pi = -1\).` },
        { kind: "mc", q: R`Two amplitudes of equal size \(\tfrac12\) arrive exactly out of phase. The probability is…`, options: ["1", "½", "¼", "0"], answer: 3, why: R`\(|\tfrac12 - \tfrac12|^2 = 0\). Destructive interference.` },
      ],
      gym: ["complex-modulus", "phasor-interference"],
    },
    {
      id: "vectors", level: 0, title: "Vectors, inner products and bases", minutes: 15,
      body: R`
<p>A quantum state is a vector. Before we meet Hilbert space, get comfortable with the finite-dimensional version, \(\mathbb{C}^n\).</p>
<p>The <strong>inner product</strong> of two complex column vectors is</p>
\[ \langle u, v\rangle = \sum_k u_k^*\, v_k, \]
<p>with the conjugate on the <em>first</em> vector so that \(\langle v, v\rangle = \sum |v_k|^2\) is a real length squared. Physicists write it \(\langle u|v\rangle\) (Dirac notation, level 3).</p>
<p>An <strong>orthonormal basis</strong> \(\{e_k\}\) satisfies \(\langle e_j | e_k\rangle = \delta_{jk}\). Any vector expands as \(v = \sum_k c_k e_k\) with \(c_k = \langle e_k|v\rangle\). In quantum mechanics those \(c_k\) are amplitudes and \(|c_k|^2\) are probabilities, which is why states are normalized: \(\sum|c_k|^2 = 1\).</p>
<h3>Two facts used constantly</h3>
<ul>
<li><strong>Cauchy–Schwarz</strong>: \(|\langle u|v\rangle|^2 \le \langle u|u\rangle\langle v|v\rangle\). The uncertainty principle is a consequence of it.</li>
<li><strong>Change of basis</strong> is a unitary matrix \(U\), one with \(U^\dagger U = 1\). Unitary maps preserve inner products, so probabilities survive a change of viewpoint. Time evolution is unitary for the same reason.</li>
</ul>`,
      exercises: [
        { kind: "num", q: R`\(u = (1, i)\), \(v = (i, 1)\). Compute the real part of \(\langle u|v\rangle = \sum u_k^* v_k\).`, answer: 0, tol: 0.001, why: R`\(1^*\cdot i + i^*\cdot 1 = i - i = 0\): they're orthogonal, although they look similar.` },
        { kind: "num", q: R`What \(A>0\) normalizes \(A(1, 2i, 2)\)?`, answer: 1 / 3, tol: 0.001, why: R`\(A^2(1 + 4 + 4) = 1\), \(A = 1/3\).` },
        { kind: "mc", q: R`A state is \(\tfrac{1}{\sqrt 3}e_1 + \sqrt{\tfrac23}\,e_2\). Probability of outcome 2?`, options: ["1/3", "2/3", "√(2/3)", "1/√3"], answer: 1, why: R`Probability is \(|c_2|^2 = 2/3\).` },
      ],
      gym: ["normalize"],
    },
    {
      id: "matrices", level: 0, title: "Matrices, eigenvalues and Hermitian operators", minutes: 20,
      body: R`
<p>Observables such as energy, position and spin are represented by <strong>Hermitian</strong> operators: \(A^\dagger = A\), where \(\dagger\) means transpose and conjugate. In a basis they are matrices with \(A_{jk} = A_{kj}^*\).</p>
<p>An eigenvector satisfies \(A v = \lambda v\). Find eigenvalues from \(\det(A - \lambda\mathbb 1) = 0\). For a 2×2 matrix,</p>
\[ \lambda^2 - (\operatorname{tr}A)\,\lambda + \det A = 0. \]
<h3>The spectral theorem, in three lines</h3>
<p>For Hermitian \(A\):</p>
<ol>
<li>Eigenvalues are real. Measured values are real numbers, and these are the only values a measurement can return.</li>
<li>Eigenvectors for different eigenvalues are orthogonal.</li>
<li>They form a complete basis, so \(A = \sum_k \lambda_k\, v_k v_k^\dagger\).</li>
</ol>
<p>The workhorses are the Pauli matrices</p>
\[ \sigma_x = \begin{pmatrix}0&1\\1&0\end{pmatrix},\quad \sigma_y = \begin{pmatrix}0&-i\\i&0\end{pmatrix},\quad \sigma_z = \begin{pmatrix}1&0\\0&-1\end{pmatrix}, \]
<p>each with eigenvalues \(\pm 1\). They don't commute: \([\sigma_x,\sigma_y] = \sigma_x\sigma_y - \sigma_y\sigma_x = 2i\sigma_z\). Non-commuting observables can't have simultaneous sharp values, and that is where quantum weirdness gets its grip.</p>`,
      exercises: [
        { kind: "num", q: R`Largest eigenvalue of \(\begin{pmatrix}2&1\\1&2\end{pmatrix}\)?`, answer: 3, tol: 0.001, why: R`tr = 4, det = 3: \(\lambda^2 - 4\lambda + 3 = 0\), roots 1 and 3.` },
        { kind: "mc", q: R`Which matrix is Hermitian?`, options: [R`\(\begin{pmatrix}1&i\\i&1\end{pmatrix}\)`, R`\(\begin{pmatrix}1&i\\-i&1\end{pmatrix}\)`, R`\(\begin{pmatrix}i&0\\0&1\end{pmatrix}\)`, R`\(\begin{pmatrix}0&1\\-1&0\end{pmatrix}\)`], answer: 1, why: R`Need \(A_{12} = A_{21}^*\): \(i = (-i)^*\) ✓, and real diagonal.` },
        { kind: "num", q: R`What is \(\det\sigma_y\)?`, answer: -1, tol: 0.001, why: R`\(0\cdot0 - (-i)(i) = -1\). Equivalently, eigenvalues \(+1\) and \(-1\) multiply to \(-1\).` },
      ],
      gym: ["eigen-2x2"],
    },
    {
      id: "probability", level: 0, title: "Probability, averages and spread", minutes: 12,
      body: R`
<p>Quantum mechanics predicts probabilities, not single outcomes. The two numbers you'll compute most are the <strong>expectation value</strong> and the <strong>standard deviation</strong>.</p>
<p>For discrete outcomes \(a_k\) with probabilities \(p_k\):</p>
\[ \langle A\rangle = \sum_k a_k p_k, \qquad (\Delta A)^2 = \langle A^2\rangle - \langle A\rangle^2. \]
<p>For a continuous variable with density \(\rho(x)\), sums become integrals: \(\langle x\rangle = \int x\,\rho(x)\,dx\). In wave mechanics \(\rho(x) = |\psi(x)|^2\), which is Born's rule.</p>
<p>\(\langle A\rangle\) is the average over many identically prepared systems. It need not be a possible outcome: a fair die averages 3.5. \(\Delta A = 0\) exactly when every measurement gives the same result, which in quantum mechanics means the state is an eigenstate of \(A\).</p>
<h3>The Gaussian</h3>
\[ \rho(x) = \frac{1}{\sqrt{2\pi}\,\sigma}\, e^{-(x-\mu)^2/2\sigma^2}, \qquad \int e^{-a x^2}dx = \sqrt{\pi/a}. \]
<p>Memorize that integral. It turns up in wave packets, the harmonic oscillator ground state, path integrals and statistical mechanics.</p>`,
      exercises: [
        { kind: "num", q: R`A fair six-sided die. What is \(\Delta A\)? (Two decimals.)`, answer: Math.sqrt(35 / 12), tol: 0.005, why: R`\(\langle A^2\rangle = 91/6\), \(\langle A\rangle^2 = 49/4\), difference \(35/12\), root \(\approx 1.708\).` },
        { kind: "num", q: R`Evaluate \(\int_{-\infty}^{\infty} e^{-2x^2}\,dx\).`, answer: Math.sqrt(Math.PI / 2), tol: 0.002, why: R`\(\sqrt{\pi/2} \approx 1.2533\).` },
        { kind: "mc", q: R`If every measurement of \(A\) on a state gives 7, then…`, options: ["⟨A⟩ = 7 and ΔA = 7", "⟨A⟩ = 7 and ΔA = 0", "The state is not normalized", "A is not Hermitian"], answer: 1, why: R`No spread means \(\Delta A = 0\); the state is an eigenstate of \(A\) with eigenvalue 7.` },
      ],
      gym: ["expectation"],
    },
    {
      id: "fourier", level: 0, title: "Waves and Fourier analysis", minutes: 20,
      sim: { id: "uncertainty" },
      body: R`
<p>Any reasonable function can be built from plane waves \(e^{ikx}\):</p>
\[ \psi(x) = \frac{1}{\sqrt{2\pi}}\int \phi(k)\, e^{ikx}\,dk, \qquad \phi(k) = \frac{1}{\sqrt{2\pi}}\int \psi(x)\, e^{-ikx}\,dx. \]
<p>\(\phi(k)\) tells you how much of each wavenumber is present. In quantum mechanics \(p = \hbar k\), so \(\phi\) is the <strong>momentum-space wavefunction</strong>, and \(|\phi(p)|^2\) is the momentum distribution.</p>
<p>The key fact is a trade-off. A narrow bump in \(x\) needs many wavenumbers to build it; a single clean wavenumber stretches forever in \(x\). For a Gaussian the Fourier transform is again Gaussian, and the widths satisfy exactly</p>
\[ \sigma_x\,\sigma_k = \tfrac12. \]
<p>For any other shape the product is larger. Multiply by \(\hbar\) and you have Heisenberg's \(\Delta x\,\Delta p \ge \hbar/2\). It isn't a statement about clumsy measurement. It's a property of waves.</p>
<p>In the simulation, narrow the packet and watch the momentum distribution widen. Try the square pulse and the two-peak states: their product \(\Delta x\,\Delta p\) sits well above ½.</p>
<p><strong>Parseval's theorem</strong> guarantees \(\int|\psi|^2dx = \int|\phi|^2dk\): probability is conserved when you change viewpoint.</p>`,
      exercises: [
        { kind: "num", q: R`A Gaussian packet has \(\sigma_x = 0.25\) (units with \(\hbar = 1\)). What is \(\sigma_p\)?`, answer: 2, tol: 0.001, why: R`\(\sigma_p = 1/(2\sigma_x) = 2\).` },
        { kind: "mc", q: R`The Fourier transform of a pure \(e^{ik_0x}\) (infinitely long) is…`, options: ["A Gaussian centred on k₀", "A spike (delta function) at k₀", "Flat in k", "Zero"], answer: 1, why: R`Exactly one wavenumber is present: \(\phi(k) \propto \delta(k - k_0)\).` },
        { kind: "mc", q: R`Which state has the smallest possible \(\Delta x\,\Delta p\)?`, options: ["A square pulse", "A Gaussian", "Two separated Gaussians", "A sine wave in a box"], answer: 1, why: R`Gaussians saturate the bound. Everything else does worse.` },
      ],
    },
    {
      id: "odes", level: 0, title: "Differential equations you'll meet", minutes: 20,
      body: R`
<p>The Schrödinger equation is a partial differential equation. Three techniques cover most of this course.</p>
<h3>1. Constant-coefficient linear ODEs</h3>
<p>\(f'' = -k^2 f\) gives \(f = A\sin kx + B\cos kx\) (or \(e^{\pm ikx}\)). \(f'' = +\kappa^2 f\) gives \(e^{\pm\kappa x}\). Guess \(e^{rx}\), solve for \(r\), and apply the boundary conditions. The boundary conditions are what make energies discrete.</p>
<h3>2. Separation of variables</h3>
<p>Try \(\Psi(x,t) = \psi(x)\,T(t)\) in \(i\hbar\partial_t\Psi = \hat H\Psi\). Dividing through,</p>
\[ i\hbar\frac{T'}{T} = \frac{\hat H\psi}{\psi} = E, \]
<p>a constant, because the left side depends only on \(t\) and the right only on \(x\). So \(T = e^{-iEt/\hbar}\) and \(\hat H\psi = E\psi\), the time-independent Schrödinger equation.</p>
<h3>3. Series solutions and special functions</h3>
<p>For \(-\tfrac12 f'' + \tfrac12 x^2 f = E f\), a power series only terminates, and so only stays normalizable, when \(E = n + \tfrac12\). The terminating polynomials are the Hermite polynomials. Legendre (angular momentum) and Laguerre (hydrogen) polynomials come out of the same mechanism. The rule to remember: <em>requiring the solution to behave is what quantizes the energy.</em></p>`,
      exercises: [
        { kind: "mc", q: R`General solution of \(f'' = 9f\)?`, options: [R`\(A\sin 3x + B\cos 3x\)`, R`\(Ae^{3x} + Be^{-3x}\)`, R`\(Ae^{9x}\)`, R`\(Ax + B\)`], answer: 1, why: R`\(r^2 = 9\), \(r = \pm3\).` },
        { kind: "num", q: R`\(f'' = -k^2 f\) on \([0, 1]\) with \(f(0) = f(1) = 0\), \(f\) not identically zero. Smallest \(k > 0\)?`, answer: Math.PI, tol: 0.001, why: R`\(f = \sin kx\) needs \(\sin k = 0\), so \(k = \pi\). This is the particle in a box.` },
        { kind: "mc", q: R`After separation, the time dependence of a stationary state is…`, options: [R`\(e^{-Et/\hbar}\)`, R`\(e^{-iEt/\hbar}\)`, R`\(\cos(Et)\)`, R`\(t^E\)`], answer: 1, why: R`A pure phase rotating at angular frequency \(E/\hbar\), which is why \(|\psi|^2\) is stationary.` },
      ],
    },

    /* ================= LEVEL 1 — THE QUANTUM SURPRISE ================= */
    {
      id: "photons", level: 1, title: "Light comes in lumps", minutes: 12,
      body: R`
<p>By 1900 light was well established as a wave. Then two results didn't fit.</p>
<p><strong>Blackbody radiation.</strong> Classical physics predicted that a hot oven radiates infinite energy at short wavelengths, the "ultraviolet catastrophe". Planck fixed it by assuming energy is exchanged in packets \(E = h f\), with \(h = 6.626\times10^{-34}\,\mathrm{J\,s}\).</p>
<p><strong>The photoelectric effect.</strong> Shine light on a metal and electrons fly out, but only if the light's <em>frequency</em> is above a threshold. Brighter red light ejects nothing; faint ultraviolet ejects electrons immediately. Einstein (1905) explained it: light arrives as photons of energy \(hf\), and each ejects at most one electron:</p>
\[ K_{\max} = hf - W, \]
<p>where \(W\) is the metal's work function. Intensity sets the <em>number</em> of photons; frequency sets their <em>energy</em>.</p>
<p>A handy number: \(hc = 1239.84\ \mathrm{eV\,nm}\), so a 500 nm green photon carries \(2.48\ \mathrm{eV}\).</p>
<p>Photons are not little billiard balls, though. The double-slit experiment (two lessons on) shows they also interfere. Both descriptions are partial; the full theory is quantum.</p>`,
      exercises: [
        { kind: "num", q: R`Energy of a 620 nm (red) photon, in eV?`, answer: 1239.84 / 620, tol: 0.005, why: R`\(1239.84/620 \approx 2.00\ \mathrm{eV}\).` },
        { kind: "mc", q: R`Doubling the intensity of light above threshold doubles…`, options: ["The electrons' maximum kinetic energy", "The number of electrons ejected per second", "The threshold frequency", "The work function"], answer: 1, why: R`More photons, same energy each.` },
      ],
      gym: ["photoelectric"],
    },
    {
      id: "matterwaves", level: 1, title: "Matter waves", minutes: 12,
      body: R`
<p>In 1924 de Broglie turned Einstein's idea around. If waves carry momentum \(p = h/\lambda\), then particles with momentum \(p\) should have a wavelength</p>
\[ \lambda = \frac{h}{p}. \]
<p>For a thrown baseball, \(\lambda \sim 10^{-34}\) m: invisible. For an electron accelerated through 54 volts, \(\lambda \approx 0.167\) nm, about the spacing of atoms in a crystal. Davisson and Germer fired such electrons at nickel in 1927 and saw diffraction peaks exactly where waves of that wavelength would put them.</p>
<p>That is the working principle of the electron microscope: short wavelength, sharp images.</p>
<h3>Bohr's atom, reread</h3>
<p>Bohr had guessed that electron orbits in hydrogen have angular momentum \(L = n\hbar\). With de Broglie's idea it becomes a standing wave: a whole number of wavelengths fits around the orbit, \(2\pi r = n\lambda\). The picture is still wrong (electrons don't orbit), but it gets the energies right:</p>
\[ E_n = -\frac{13.6\ \mathrm{eV}}{n^2}. \]
<p>The Schrödinger equation (level 2) replaces the picture with the real mechanism.</p>`,
      exercises: [
        { kind: "num", q: R`Electron at 100 V: de Broglie wavelength in nm? (\(\lambda \approx 1.226/\sqrt V\) nm)`, answer: 0.1226, tol: 0.01, why: R`\(1.226/10 = 0.123\) nm.` },
        { kind: "mc", q: R`A proton and an electron have the same speed. Whose wavelength is longer?`, options: ["The proton's", "The electron's", "They're equal", "Protons have no wavelength"], answer: 1, why: R`\(\lambda = h/mv\): the lighter particle has the longer wavelength (by 1836×).` },
      ],
      gym: ["de-broglie"],
    },
    {
      id: "doubleslit", level: 1, title: "The double slit, one particle at a time", minutes: 15,
      sim: { id: "doubleslit" },
      body: R`
<p>Feynman called this "the only mystery". Send particles, electrons or photons, one at a time towards a wall with two slits. Each lands at a single point on the screen, like a particle. But after thousands have landed, the dots form <strong>interference fringes</strong>, like a wave.</p>
<p>No single particle "interferes with another"; they arrive one at a time. Each particle's amplitude goes through both slits, and the two contributions add:</p>
\[ P(x) = |\psi_1(x) + \psi_2(x)|^2. \]
<p>Now try to find out which slit each particle went through. Any detector good enough to tell the paths apart destroys the fringes, and you get</p>
\[ P(x) = |\psi_1(x)|^2 + |\psi_2(x)|^2, \]
<p>two overlapping single-slit humps. Toggle <em>which-path detector</em> in the simulation to see it.</p>
<p>Fringe spacing on a distant screen: bright fringes where \(d\sin\theta = m\lambda\). The single-slit envelope, with zeros at \(a\sin\theta = m\lambda\), limits how many fringes you see.</p>
<p>The lesson generalizes. Amplitudes for <em>indistinguishable</em> alternatives add; probabilities for <em>distinguishable</em> ones add. Whether an alternative is distinguishable depends on whether the information exists anywhere in the universe, not on whether anyone reads it.</p>`,
      exercises: [
        { kind: "mc", q: "You fire electrons one per minute for a month. What do you see?", options: ["No fringes: one at a time can't interfere", "Fringes, built up dot by dot", "Two bright bands only", "A uniform smear"], answer: 1, why: "Each electron's amplitude interferes with itself." },
        { kind: "num", q: R`Slits \(d = 10\,\mu\mathrm m\) apart, light 500 nm. Angle (degrees) of the first bright fringe away from centre?`, answer: (Math.asin(0.05) * 180) / Math.PI, tol: 0.01, why: R`\(\sin\theta = \lambda/d = 0.05\), \(\theta \approx 2.87^\circ\).` },
        { kind: "mc", q: "Turning on a which-path detector…", options: ["Doubles the fringe spacing", "Removes the interference fringes", "Stops particles from arriving", "Has no effect"], answer: 1, why: "Distinguishable paths add as probabilities, not amplitudes." },
      ],
    },
    {
      id: "uncertainty", level: 1, title: "The uncertainty principle", minutes: 12,
      sim: { id: "uncertainty" },
      body: R`
<p>A particle described by a wave can't have both a sharp position and a sharp momentum, because a wave can't be both short and single-wavelength (see the Fourier lesson). Heisenberg's bound is</p>
\[ \Delta x\,\Delta p \ \ge\ \frac{\hbar}{2}, \qquad \hbar = \frac{h}{2\pi} = 1.055\times10^{-34}\ \mathrm{J\,s}. \]
<h3>What it is not</h3>
<p>It's not that measuring disturbs the particle, though measurement often does. The bound constrains the <em>state</em> itself: prepare a million identical particles, measure position on half and momentum on the other half, and the two spreads obey the inequality.</p>
<h3>What it explains</h3>
<ul>
<li><strong>Atoms are stable.</strong> Squeeze an electron closer to the nucleus to lower its potential energy and its kinetic energy \(\sim \hbar^2/2m r^2\) rises. The balance point is the Bohr radius, \(0.053\) nm.</li>
<li><strong>Zero-point energy.</strong> An oscillator can't sit still at the bottom of its well. Its lowest energy is \(\tfrac12\hbar\omega\), not zero. Liquid helium never freezes at atmospheric pressure for this reason.</li>
</ul>
<p>There is also an energy–time relation, \(\Delta E\,\Delta t \gtrsim \hbar/2\): short-lived states have fuzzy energies, which you can see directly in the widths of spectral lines.</p>`,
      exercises: [
        { kind: "mc", q: "The uncertainty principle is fundamentally about…", options: ["Imperfect instruments", "A property of wave-like states", "Only very small particles", "Relativity"], answer: 1, why: "It's the Fourier trade-off applied to matter waves." },
        { kind: "num", q: R`Estimate the electron's minimum kinetic energy in eV if confined to \(\Delta x = 0.1\) nm, using \(K \approx (\Delta p)^2/2m\) with \(\Delta p = \hbar/2\Delta x\).`, answer: (1.054571817e-34 / 2e-10) ** 2 / (2 * 9.1093837015e-31) / 1.602176634e-19, tol: 0.02, why: R`\(\Delta p = 5.27\times10^{-25}\) kg m/s, \(K \approx 0.95\ \mathrm{eV}\): atomic energies are eV-scale.` },
      ],
      gym: ["heisenberg"],
    },

    /* ================= LEVEL 2 — WAVE MECHANICS ================= */
    {
      id: "schrodinger", level: 2, title: "The Schrödinger equation", minutes: 20,
      sim: { id: "wavepacket", preset: "free" },
      body: R`
<p>The state of a particle in one dimension is a complex function \(\Psi(x,t)\). It evolves by</p>
\[ i\hbar\,\frac{\partial\Psi}{\partial t} = -\frac{\hbar^2}{2m}\frac{\partial^2\Psi}{\partial x^2} + V(x)\,\Psi \equiv \hat H\Psi. \]
<p>Read it as energy bookkeeping: \(\hat p = -i\hbar\,\partial_x\), so the first term is \(\hat p^2/2m\), kinetic energy, and the second is potential energy.</p>
<h3>Born's rule</h3>
<p>\(|\Psi(x,t)|^2\,dx\) is the probability of finding the particle between \(x\) and \(x+dx\). The equation conserves \(\int|\Psi|^2dx\) automatically, which is why the rule is consistent. The <em>probability current</em> \(j = \frac{\hbar}{m}\operatorname{Im}(\Psi^*\partial_x\Psi)\) satisfies \(\partial_t|\Psi|^2 + \partial_x j = 0\): probability flows like a fluid.</p>
<h3>Watching it</h3>
<p>The simulation integrates the equation numerically (Crank–Nicolson, units \(\hbar = m = 1\)). The filled curve is \(|\Psi|^2\) and its <strong>colour is the phase</strong> of \(\Psi\), so you can see the wave's internal rotation. A free Gaussian packet moves at the group velocity \(\langle p\rangle/m\) and spreads:</p>
\[ \sigma(t) = \sigma_0\sqrt{1 + \left(\frac{\hbar t}{2m\sigma_0^2}\right)^2}. \]
<p>Narrow packets spread faster, which is the uncertainty principle again: a narrow packet contains a wide range of velocities.</p>
<h3>Ehrenfest's theorem</h3>
\[ \frac{d\langle x\rangle}{dt} = \frac{\langle p\rangle}{m}, \qquad \frac{d\langle p\rangle}{dt} = -\left\langle V'(x)\right\rangle. \]
<p>Averages obey Newton's laws, nearly. That's how classical mechanics emerges.</p>`,
      exercises: [
        { kind: "mc", q: R`In position representation, the momentum operator is…`, options: [R`\(\hat p = m\,dx/dt\)`, R`\(\hat p = -i\hbar\,\partial/\partial x\)`, R`\(\hat p = i\hbar\,\partial/\partial t\)`, R`\(\hat p = \hbar k\) always`], answer: 1, why: R`Acting on \(e^{ikx}\) it gives \(\hbar k\), de Broglie's relation.` },
        { kind: "num", q: R`A free Gaussian with \(\sigma_0 = 1\) (\(\hbar=m=1\)). At what time \(t\) has its width grown by \(\sqrt2\)?`, answer: 2, tol: 0.001, why: R`Need \(t/(2\sigma_0^2) = 1\), so \(t = 2\).` },
        { kind: "mc", q: R`Multiplying \(\Psi\) everywhere by \(e^{i\alpha}\) (constant \(\alpha\))…`, options: ["Changes all probabilities", "Changes the energy", "Changes nothing measurable", "Reverses the motion"], answer: 2, why: "A global phase is invisible. Only relative phases matter." },
      ],
    },
    {
      id: "box", level: 2, title: "Particle in a box", minutes: 20,
      sim: { id: "eigen", preset: "box" },
      body: R`
<p>Trap a particle between impenetrable walls at \(x = 0\) and \(x = L\). Inside, \(V = 0\) and the time-independent equation is \(-\frac{\hbar^2}{2m}\psi'' = E\psi\). The walls force \(\psi(0) = \psi(L) = 0\). The solutions are standing waves</p>
\[ \psi_n(x) = \sqrt{\frac2L}\sin\frac{n\pi x}{L}, \qquad E_n = \frac{n^2\pi^2\hbar^2}{2mL^2}, \quad n = 1, 2, 3, \dots \]
<p>Three things to notice:</p>
<ul>
<li><strong>Quantization</strong> comes from boundary conditions, with no extra postulate.</li>
<li><strong>No zero energy.</strong> \(n = 0\) would give \(\psi \equiv 0\), which is no particle at all.</li>
<li><strong>Nodes.</strong> \(\psi_n\) has \(n - 1\) interior zeros. More wiggles means more curvature and more kinetic energy.</li>
</ul>
<p>The simulation solves the equation numerically for any potential and compares with the exact answer. Switch the preset to a <em>finite</em> well and notice that the wavefunctions leak into the walls. The energies drop, and there are only finitely many bound states.</p>
<h3>Where it's real</h3>
<p>Electrons in conjugated dye molecules, quantum dots (whose colour is tuned by their size, since \(E \propto 1/L^2\)), and quantum-well lasers.</p>`,
      exercises: [
        { kind: "num", q: R`In a box, \(E_3 / E_1 = ?\)`, answer: 9, tol: 0.001, why: R`\(E_n \propto n^2\).` },
        { kind: "mc", q: R`Where is the particle <em>least</em> likely to be found in state \(n = 2\)?`, options: ["At x = L/4", "At x = L/2", "At x = 3L/4", "Uniformly everywhere"], answer: 1, why: R`\(\psi_2 \propto \sin(2\pi x/L)\) has a node at the centre.` },
        { kind: "num", q: R`Halve the box width. By what factor does \(E_1\) change?`, answer: 4, tol: 0.001, why: R`\(E \propto 1/L^2\).` },
      ],
      gym: ["box-energy", "box-transition"],
    },
    {
      id: "superposition", level: 2, title: "Superposition and time evolution", minutes: 15,
      sim: { id: "eigen", preset: "box", superpose: [0, 1] },
      body: R`
<p>Stationary states are boring on their own: \(\psi_n(x)e^{-iE_nt/\hbar}\) has a time-independent \(|\psi|^2\). Motion comes from <strong>superposition</strong>:</p>
\[ \Psi(x,t) = \sum_n c_n\,\psi_n(x)\,e^{-iE_n t/\hbar}, \qquad c_n = \int\psi_n^*(x)\,\Psi(x,0)\,dx. \]
<p>Because the phases rotate at different rates, cross terms in \(|\Psi|^2\) oscillate. For two states,</p>
\[ |\Psi|^2 = |c_1|^2|\psi_1|^2 + |c_2|^2|\psi_2|^2 + 2\,\mathrm{Re}\!\left[c_1^*c_2\,\psi_1^*\psi_2\,e^{-i(E_2-E_1)t/\hbar}\right], \]
<p>which sloshes at the <strong>Bohr frequency</strong> \(\omega_{21} = (E_2 - E_1)/\hbar\). An atom in such a superposition has an oscillating charge distribution, and it radiates at exactly that frequency. That is the origin of spectral lines.</p>
<p>In the simulation, tick several levels to superpose them and press play. The coloured density shows the phase; the probability sloshes.</p>
<h3>Measurement</h3>
<p>Measure the energy and you get one of the \(E_n\), with probability \(|c_n|^2\). Afterwards the state <em>is</em> \(\psi_n\). That jump is the collapse postulate. Level 4 discusses decoherence, which explains most of what the jump is doing.</p>
<p><strong>Quantum revival:</strong> in a box all \(E_n \propto n^2\), so after \(T = 4mL^2/\pi\hbar\) every phase realigns and the initial state reappears exactly.</p>`,
      exercises: [
        { kind: "num", q: R`\(\Psi = \tfrac{1}{\sqrt2}(\psi_1 + \psi_2)\) in a box. Probability of measuring \(E_2\)?`, answer: 0.5, tol: 0.001, why: R`\(|c_2|^2 = 1/2\).` },
        { kind: "num", q: R`Same state, in units where \(E_1 = 1\) and \(\hbar = 1\). Find \(\langle E\rangle\).`, answer: 2.5, tol: 0.001, why: R`\(\tfrac12\cdot1 + \tfrac12\cdot4 = 2.5\).` },
        { kind: "mc", q: R`Why doesn't \(|\psi_n(x)|^2\) change in time for a single eigenstate?`, options: ["The particle is at rest", R`The time factor \(e^{-iE_nt/\hbar}\) has modulus 1`, "Energy is zero", "The box walls stop it"], answer: 1, why: "A global phase cancels in |ψ|²." },
      ],
    },
    {
      id: "tunnelling", level: 2, title: "Tunnelling through barriers", minutes: 20,
      sim: { id: "wavepacket", preset: "barrier" },
      body: R`
<p>A classical ball with energy \(E\) can't cross a hill of height \(V_0 > E\). A quantum particle can. Inside the barrier the Schrödinger equation reads \(\psi'' = \kappa^2\psi\) with</p>
\[ \kappa = \frac{\sqrt{2m(V_0 - E)}}{\hbar}, \]
<p>so the wavefunction decays exponentially instead of stopping dead. If the barrier is thin enough, some amplitude survives to the far side. Matching \(\psi\) and \(\psi'\) at both edges gives the exact transmission probability for a rectangular barrier of width \(a\):</p>
\[ T = \left[1 + \frac{V_0^2\sinh^2(\kappa a)}{4E(V_0 - E)}\right]^{-1} \approx 16\frac{E}{V_0}\Big(1-\frac{E}{V_0}\Big)e^{-2\kappa a}. \]
<p>The exponential makes tunnelling exquisitely sensitive to width. Several Nobel-level technologies depend on it:</p>
<ul>
<li><strong>Alpha decay</strong>: Gamow's explanation of why half-lives range over 20 orders of magnitude for small changes in energy.</li>
<li><strong>Scanning tunnelling microscope</strong>: the current changes by about 10× per 0.1 nm of tip height, enough to image single atoms.</li>
<li><strong>Flash memory</strong> and <strong>Josephson junctions</strong> in superconducting qubits.</li>
</ul>
<p>In the simulation, a wave packet hits a barrier. Watch it split. The reflected part interferes with the incoming part, making ripples, and the transmitted fraction is displayed alongside the plane-wave formula at the packet's mean energy. They differ because a packet is a spread of energies, and the higher-energy components tunnel far more easily.</p>`,
      exercises: [
        { kind: "mc", q: "Doubling barrier width (deep tunnelling regime) makes T roughly…", options: ["Half as large", "Squared (much smaller)", "Twice as large", "Unchanged"], answer: 1, why: R`\(T \sim e^{-2\kappa a}\), so doubling \(a\) squares it.` },
        { kind: "num", q: R`\(\hbar = m = 1\), \(E = 1\), \(V_0 = 3\), \(a = 1\). Compute exact \(T\) (3 significant figures).`, answer: 1 / (1 + (9 * Math.sinh(2) ** 2) / (4 * 1 * 2)), tol: 0.01, why: R`\(\kappa = 2\); \(T = [1 + 9\sinh^2 2/8]^{-1} \approx 0.0633\).` },
        { kind: "mc", q: R`For \(E > V_0\), a quantum particle…`, options: ["Always transmits", "Can still reflect", "Must tunnel", "Stops at the barrier"], answer: 1, why: R`Over-barrier reflection: \(T < 1\) except at resonances where \(\sin ka = 0\).` },
      ],
      gym: ["tunnel"],
    },
    {
      id: "oscillator", level: 2, title: "The harmonic oscillator and ladder operators", minutes: 25,
      sim: { id: "eigen", preset: "harmonic" },
      body: R`
<p>Near the bottom of any smooth well, \(V \approx \tfrac12 m\omega^2x^2\). The quantum harmonic oscillator therefore describes molecular vibrations, phonons in solids, photons in a cavity, and every mode of every free quantum field.</p>
<p>Define the <strong>ladder operators</strong></p>
\[ \hat a = \sqrt{\frac{m\omega}{2\hbar}}\left(\hat x + \frac{i\hat p}{m\omega}\right), \qquad \hat a^\dagger = \sqrt{\frac{m\omega}{2\hbar}}\left(\hat x - \frac{i\hat p}{m\omega}\right). \]
<p>From \([\hat x,\hat p] = i\hbar\) follows \([\hat a,\hat a^\dagger] = 1\), and</p>
\[ \hat H = \hbar\omega\left(\hat a^\dagger\hat a + \tfrac12\right). \]
<p>Now the whole spectrum follows from algebra. If \(\hat H|n\rangle = E|n\rangle\) then \(\hat a^\dagger|n\rangle\) has energy \(E + \hbar\omega\) and \(\hat a|n\rangle\) has \(E - \hbar\omega\). Energy can't go below zero, so there is a bottom rung with \(\hat a|0\rangle = 0\), and</p>
\[ E_n = \hbar\omega\left(n + \tfrac12\right), \qquad \hat a^\dagger|n\rangle = \sqrt{n+1}\,|n+1\rangle, \quad \hat a|n\rangle = \sqrt n\,|n-1\rangle. \]
<p>No differential equation was solved. The ground state \(\langle x|0\rangle \propto e^{-m\omega x^2/2\hbar}\) is a Gaussian, the minimum-uncertainty state. The simulation's numerical levels land on \(n + \tfrac12\) exactly (in units \(\hbar = m = \omega = 1\)).</p>
<p>This app is named after these operators. In level 4, \(\hat a^\dagger\) becomes "create a particle".</p>`,
      exercises: [
        { kind: "num", q: R`Compute \(\langle 3|\hat a^\dagger\hat a|3\rangle\).`, answer: 3, tol: 0.001, why: R`\(\hat N = \hat a^\dagger\hat a\) counts quanta: \(\hat N|n\rangle = n|n\rangle\).` },
        { kind: "num", q: R`\(\hat a^\dagger\hat a^\dagger|0\rangle = c\,|2\rangle\). Find \(c\).`, answer: Math.SQRT2, tol: 0.001, why: R`\(\hat a^\dagger|0\rangle = |1\rangle\), \(\hat a^\dagger|1\rangle = \sqrt2|2\rangle\).` },
        { kind: "mc", q: "The spacing between oscillator levels is…", options: ["Growing like n²", "Constant, ħω", "Shrinking like 1/n²", "Zero"], answer: 1, why: "Evenly spaced ladder: the hallmark of the oscillator." },
      ],
      gym: ["oscillator"],
    },

    /* ================= LEVEL 3 — THE FORMALISM ================= */
    {
      id: "dirac", level: 3, title: "Dirac notation and Hilbert space", minutes: 20,
      body: R`
<p>Wavefunctions, spin states and photon polarizations are all vectors in a complex inner-product space, a <strong>Hilbert space</strong> \(\mathcal H\). Dirac's notation makes the algebra automatic.</p>
<ul>
<li>A <strong>ket</strong> \(|\psi\rangle\) is a state vector.</li>
<li>A <strong>bra</strong> \(\langle\phi|\) is a linear map from kets to numbers; \(\langle\phi|\psi\rangle\) is the inner product.</li>
<li>\(|\psi\rangle\langle\phi|\) is an operator: it eats \(|\chi\rangle\) and returns \(|\psi\rangle\langle\phi|\chi\rangle\).</li>
</ul>
<p>Any orthonormal basis resolves the identity:</p>
\[ \mathbb 1 = \sum_n |n\rangle\langle n| \quad\text{or}\quad \mathbb 1 = \int |x\rangle\langle x|\,dx. \]
<p>Inserting that "1" is the single most useful move in the subject. For example, \(\psi(x) = \langle x|\psi\rangle\) is just the component of \(|\psi\rangle\) along \(|x\rangle\), and</p>
\[ \langle\phi|\psi\rangle = \int \langle\phi|x\rangle\langle x|\psi\rangle\,dx = \int\phi^*(x)\psi(x)\,dx. \]
<p>The momentum-space wavefunction is \(\langle p|\psi\rangle\) with \(\langle x|p\rangle = e^{ipx/\hbar}/\sqrt{2\pi\hbar}\): the Fourier transform is a change of basis.</p>
<h3>Operators</h3>
<p>Matrix elements are \(A_{mn} = \langle m|\hat A|n\rangle\). The adjoint obeys \(\langle\phi|\hat A\psi\rangle = \langle \hat A^\dagger\phi|\psi\rangle\). A <strong>projector</strong> \(\hat P = |n\rangle\langle n|\) satisfies \(\hat P^2 = \hat P\); the probability of outcome \(n\) is \(\langle\psi|\hat P|\psi\rangle\).</p>`,
      exercises: [
        { kind: "num", q: R`\(|\psi\rangle = \tfrac35|0\rangle + \tfrac45 i|1\rangle\). Compute \(\langle\psi|\psi\rangle\).`, answer: 1, tol: 0.001, why: R`\(9/25 + 16/25 = 1\). The bra conjugates the \(i\).` },
        { kind: "mc", q: R`\(\big(|a\rangle\langle b|\big)^\dagger = ?\)`, options: [R`\(|a\rangle\langle b|\)`, R`\(|b\rangle\langle a|\)`, R`\(\langle a|b\rangle\)`, R`\(\langle b|a\rangle\)`], answer: 1, why: "Adjoint reverses order and swaps bras and kets." },
        { kind: "num", q: R`For \(|\psi\rangle\) above, \(|\langle 1|\psi\rangle|^2 = ?\)`, answer: 0.64, tol: 0.001, why: R`\(|4i/5|^2 = 16/25\).` },
      ],
    },
    {
      id: "observables", level: 3, title: "Observables, commutators and measurement", minutes: 25,
      body: R`
<p>The postulates, stated cleanly:</p>
<ol>
<li><strong>States</strong> are unit vectors in \(\mathcal H\), up to a global phase.</li>
<li><strong>Observables</strong> are Hermitian operators \(\hat A = \sum_a a\,\hat P_a\).</li>
<li><strong>Measurement</strong> of \(\hat A\) yields eigenvalue \(a\) with probability \(\langle\psi|\hat P_a|\psi\rangle\), and leaves the state \(\hat P_a|\psi\rangle/\|\hat P_a|\psi\rangle\|\).</li>
<li><strong>Evolution</strong> between measurements is unitary: \(|\psi(t)\rangle = e^{-i\hat Ht/\hbar}|\psi(0)\rangle\).</li>
</ol>
<h3>Commutators</h3>
<p>\([\hat A,\hat B] = \hat A\hat B - \hat B\hat A\). The canonical one is \([\hat x,\hat p] = i\hbar\). The <strong>Robertson uncertainty relation</strong> follows from Cauchy–Schwarz:</p>
\[ \Delta A\,\Delta B \ \ge\ \tfrac12\left|\langle[\hat A,\hat B]\rangle\right|. \]
<p>Commuting observables share an eigenbasis and can be sharp together; that's how we label hydrogen states by \((n,\ell,m)\) at once.</p>
<h3>Heisenberg picture and conserved quantities</h3>
<p>Move the time dependence onto operators: \(\hat A(t) = e^{i\hat Ht/\hbar}\hat A e^{-i\hat Ht/\hbar}\), so</p>
\[ \frac{d\hat A}{dt} = \frac{i}{\hbar}[\hat H,\hat A]. \]
<p>If \(\hat A\) commutes with \(\hat H\), it's conserved. Compare the classical Poisson bracket \(\dot A = \{A, H\}\); Dirac's rule \(\{\,,\}\to[\,,]/i\hbar\) is canonical quantization.</p>
<p>Useful identities: \([\hat A,\hat B\hat C] = [\hat A,\hat B]\hat C + \hat B[\hat A,\hat C]\), and \([\hat x, f(\hat p)] = i\hbar f'(\hat p)\).</p>`,
      exercises: [
        { kind: "mc", q: R`\([\hat x, \hat p^2] = ?\)`, options: [R`\(0\)`, R`\(2i\hbar\hat p\)`, R`\(i\hbar\)`, R`\(-2i\hbar\hat x\)`], answer: 1, why: R`\([\hat x,\hat p]\hat p + \hat p[\hat x,\hat p] = 2i\hbar\hat p\).` },
        { kind: "num", q: R`Spin-½: \([\hat S_x,\hat S_y] = i\hbar\hat S_z\). In state \(|{\uparrow}\rangle\), what's the lower bound on \(\Delta S_x\Delta S_y\) in units of \(\hbar^2\)?`, answer: 0.25, tol: 0.001, why: R`\(\tfrac12|\langle i\hbar S_z\rangle| = \tfrac12\hbar\cdot\hbar/2 = \hbar^2/4\).` },
        { kind: "mc", q: R`If \([\hat H,\hat A] = 0\), then…`, options: [R`\(\langle A\rangle\) is constant in time for every state`, "A must equal H", "A has no eigenvalues", "The system is free"], answer: 0, why: "Commuting with H means conserved." },
      ],
    },
    {
      id: "spin", level: 3, title: "Spin-½ and the Bloch sphere", minutes: 25,
      sim: { id: "bloch" },
      body: R`
<p>Stern and Gerlach (1922) sent silver atoms through an inhomogeneous magnet and found two spots, not a smear: the electron has an intrinsic angular momentum whose component along any axis is \(\pm\hbar/2\). Its state lives in \(\mathbb C^2\), the simplest Hilbert space there is, and the same space as a <strong>qubit</strong>.</p>
\[ \hat{\vec S} = \frac\hbar2\vec\sigma, \qquad |\psi\rangle = \cos\tfrac\theta2|{\uparrow}\rangle + e^{i\varphi}\sin\tfrac\theta2|{\downarrow}\rangle. \]
<p>Every pure state is a point \((\theta,\varphi)\) on a sphere, the <strong>Bloch sphere</strong>, and it "points" in direction \(\hat n = (\sin\theta\cos\varphi, \sin\theta\sin\varphi, \cos\theta)\): it's the \(+\) eigenstate of \(\hat n\cdot\vec\sigma\). Measuring along another axis \(\hat m\):</p>
\[ P(+\hat m) = \tfrac12(1 + \hat n\cdot\hat m) = \cos^2\tfrac{\gamma}{2}, \]
<p>with \(\gamma\) the angle between them. Opposite points are orthogonal states.</p>
<h3>Dynamics: precession</h3>
<p>In a magnetic field, \(\hat H = -\gamma_e\vec B\cdot\hat{\vec S}\), and the Bloch vector precesses about \(\vec B\) at the Larmor frequency. Any unitary on a qubit is a rotation of the sphere: \(e^{-i\alpha\,\hat n\cdot\vec\sigma/2}\) turns by \(\alpha\) about \(\hat n\). This is how MRI works, and how quantum gates work.</p>
<p>One strange detail: a \(2\pi\) rotation gives \(e^{-i\pi} = -1\). Spinors need \(4\pi\) to return home. Neutron interferometry has measured that sign.</p>
<p>In the simulation, apply gates (H, X, S, T, rotations), then measure along x, y or z many times and compare the counts with \(\tfrac12(1+\hat n\cdot\hat m)\).</p>`,
      exercises: [
        { kind: "num", q: R`State \(|{+x}\rangle\). Probability of \(+\) along z?`, answer: 0.5, tol: 0.001, why: R`Perpendicular axes: \(\tfrac12(1 + 0)\).` },
        { kind: "num", q: R`Bloch vector at \(60^\circ\) from the z-axis. \(P(+z) = ?\)`, answer: 0.75, tol: 0.001, why: R`\(\cos^2 30^\circ = 3/4\).` },
        { kind: "mc", q: R`The Hadamard gate takes \(|{\uparrow}\rangle\) to…`, options: ["|↓⟩", "|+x⟩", "|+y⟩", "−|↑⟩"], answer: 1, why: R`\(H|0\rangle = (|0\rangle + |1\rangle)/\sqrt2\), the +x state.` },
      ],
      gym: ["spin-prob", "sigma-z"],
    },
    {
      id: "hydrogen", level: 3, title: "Angular momentum and the hydrogen atom", minutes: 30,
      sim: { id: "hydrogen" },
      body: R`
<p>Angular momentum operators obey \([\hat L_x,\hat L_y] = i\hbar\hat L_z\) and cyclic permutations. \(\hat L^2\) commutes with each component, so we label states by \(\hat L^2\) and \(\hat L_z\):</p>
\[ \hat L^2|\ell m\rangle = \hbar^2\ell(\ell+1)|\ell m\rangle, \quad \hat L_z|\ell m\rangle = \hbar m|\ell m\rangle, \quad m = -\ell,\dots,\ell. \]
<p>Ladder operators \(\hat L_\pm = \hat L_x \pm i\hat L_y\) step \(m\) by one, just like the oscillator. The algebra alone allows half-integer \(\ell\) too; those are spins.</p>
<h3>The hydrogen atom</h3>
<p>For a central potential, \(\psi_{n\ell m}(r,\theta,\varphi) = R_{n\ell}(r)\,Y_\ell^m(\theta,\varphi)\). The radial equation contains an effective potential with a centrifugal barrier \(\hbar^2\ell(\ell+1)/2mr^2\). For \(V = -e^2/4\pi\epsilon_0 r\), requiring normalizability quantizes the energy:</p>
\[ E_n = -\frac{m e^4}{2(4\pi\epsilon_0)^2\hbar^2}\frac{1}{n^2} = -\frac{13.606\ \mathrm{eV}}{n^2}, \qquad \ell = 0,\dots,n-1. \]
<p>The energy doesn't depend on \(\ell\): an "accidental" degeneracy (\(n^2\) states per level, \(2n^2\) with spin) that traces back to a hidden conserved quantity, the Runge–Lenz vector, and an \(SO(4)\) symmetry.</p>
<p>Radial functions have \(n - \ell - 1\) nodes. The simulation draws \(|\psi_{n\ell m}|^2\) in a slice through the z-axis. Compare 2s with 2p, and 3d with \(m = 0\) versus \(m = \pm2\).</p>
<h3>What real atoms add</h3>
<p>Fine structure (relativity and spin–orbit, \(\sim\alpha^2\)), the Lamb shift (QED), and hyperfine structure (nuclear spin; the 21 cm line of radio astronomy).</p>`,
      exercises: [
        { kind: "num", q: R`How many states (ignoring spin) share \(n = 3\)?`, answer: 9, tol: 0.001, why: R`\(\sum_{\ell=0}^{2}(2\ell+1) = 1+3+5 = n^2 = 9\).` },
        { kind: "num", q: R`Ionization energy of hydrogen from \(n = 2\), in eV?`, answer: 13.606 / 4, tol: 0.005, why: R`\(13.606/4 = 3.40\) eV.` },
        { kind: "mc", q: R`The 3d orbital has how many radial nodes?`, options: ["0", "1", "2", "3"], answer: 0, why: R`\(n - \ell - 1 = 3 - 2 - 1 = 0\).` },
        { kind: "num", q: R`Magnitude \(|\vec L|\) for \(\ell = 2\), in units of \(\hbar\)?`, answer: Math.sqrt(6), tol: 0.002, why: R`\(\sqrt{\ell(\ell+1)} = \sqrt6 \approx 2.449\). Never equal to \(\ell\hbar\), since \(L_x, L_y\) can't both vanish.` },
      ],
      gym: ["hydrogen-line"],
    },
    {
      id: "perturbation", level: 3, title: "Perturbation theory", minutes: 25,
      sim: { id: "eigen", preset: "harmonic", perturb: true },
      body: R`
<p>Few Hamiltonians can be solved exactly. Most real ones are a solvable \(\hat H_0\) plus something small, \(\lambda\hat H'\). Expand in powers of \(\lambda\):</p>
\[ E_n = E_n^{(0)} + \lambda\langle n|\hat H'|n\rangle + \lambda^2\sum_{k\ne n}\frac{|\langle k|\hat H'|n\rangle|^2}{E_n^{(0)} - E_k^{(0)}} + \cdots \]
<p>Read off two rules of thumb:</p>
<ul>
<li>First order is just the <strong>average of the perturbation</strong> in the unperturbed state.</li>
<li>Second order for the ground state is <strong>always negative</strong>: levels repel, and the ground state is pushed down.</li>
</ul>
<p>The state correction is \(|n^{(1)}\rangle = \sum_{k\ne n}\frac{\langle k|\hat H'|n\rangle}{E_n^{(0)}-E_k^{(0)}}|k\rangle\). It blows up if two levels are degenerate. Then use <strong>degenerate perturbation theory</strong>: diagonalize \(\hat H'\) inside the degenerate subspace first. The Stark effect in hydrogen's \(n = 2\) level is the classic example.</p>
<p>In the simulation, add a perturbation \(\lambda x^3\), \(\lambda x^4\) or a linear field \(\lambda x\) to the oscillator and compare three columns: exact numerical energy, first-order estimate, and the unperturbed value. Push \(\lambda\) up until first order visibly fails.</p>
<h3>Time-dependent version</h3>
<p>For a perturbation switched on in time, the transition probability to first order leads to <strong>Fermi's golden rule</strong>:</p>
\[ \Gamma_{i\to f} = \frac{2\pi}{\hbar}|\langle f|\hat H'|i\rangle|^2\,\rho(E_f), \]
<p>which gives decay rates, absorption cross-sections and much of spectroscopy.</p>`,
      exercises: [
        { kind: "num", q: R`Oscillator (\(\hbar=m=\omega=1\)) plus \(\lambda x\). First-order shift of the ground state?`, answer: 0, tol: 0.001, why: R`\(\langle0|x|0\rangle = 0\) by parity. The real shift \(-\lambda^2/2\) is second-order.` },
        { kind: "mc", q: "Second-order correction to the ground-state energy is…", options: ["Always positive", "Always negative or zero", "Always zero", "Either sign"], answer: 1, why: R`Every denominator \(E_0 - E_k < 0\).` },
        { kind: "num", q: R`Box of width 1 (\(\hbar=m=1\)) plus constant \(V' = 0.3\) everywhere inside. First-order shift of \(E_2\)?`, answer: 0.3, tol: 0.001, why: "A constant shifts every level by itself, exactly." },
      ],
      gym: ["perturb"],
    },
    {
      id: "variational", level: 3, title: "The variational method", minutes: 15,
      body: R`
<p>For any normalized trial state \(|\chi\rangle\),</p>
\[ E_0 \le \langle\chi|\hat H|\chi\rangle. \]
<p>Proof in one line: expand \(|\chi\rangle = \sum c_n|n\rangle\); then \(\langle\hat H\rangle = \sum|c_n|^2E_n \ge E_0\sum|c_n|^2 = E_0\).</p>
<p>So guess a family \(\chi_\alpha\), compute \(E(\alpha) = \langle\chi_\alpha|\hat H|\chi_\alpha\rangle\), and minimize. The minimum is an upper bound, and usually a very good one because the energy error is second-order in the wavefunction error.</p>
<h3>Worked example: helium</h3>
<p>Two electrons, nucleus \(Z = 2\). Try a product of hydrogen-like 1s orbitals with an adjustable effective charge \(Z_{\text{eff}}\). Minimizing gives \(Z_{\text{eff}} = Z - \tfrac{5}{16} = 1.6875\): each electron partially screens the nucleus from the other. The resulting energy is \(-77.5\) eV against the measured \(-79.0\) eV, within 2% from a one-parameter guess.</p>
<p>Modern quantum chemistry (Hartree–Fock and beyond) and variational quantum eigensolvers on quantum computers are elaborate versions of this idea.</p>`,
      exercises: [
        { kind: "mc", q: "The variational estimate of the ground-state energy is always…", options: ["Below the true value", "Above or equal to the true value", "Exactly correct", "Negative"], answer: 1, why: "It's an upper bound." },
        { kind: "num", q: R`Helium with \(Z_{\text{eff}}\): \(E = (Z_{\text{eff}}^2 - 2ZZ_{\text{eff}} + \tfrac58 Z_{\text{eff}})\) Hartree. With \(Z = 2\), what \(Z_{\text{eff}}\) minimizes it?`, answer: 1.6875, tol: 0.001, why: R`\(dE/dZ_{\text{eff}} = 2Z_{\text{eff}} - 4 + \tfrac58 = 0\).` },
      ],
      gym: ["variational"],
    },

    /* ================= LEVEL 4 — THEORETICAL PHYSICIST ================= */
    {
      id: "entanglement", level: 4, title: "Entanglement and Bell's theorem", minutes: 30,
      sim: { id: "bell" },
      body: R`
<p>Two systems live in the tensor product \(\mathcal H_A\otimes\mathcal H_B\). A state that can't be written \(|\alpha\rangle\otimes|\beta\rangle\) is <strong>entangled</strong>. The singlet</p>
\[ |\Psi^-\rangle = \tfrac{1}{\sqrt2}\big(|{\uparrow\downarrow}\rangle - |{\downarrow\uparrow}\rangle\big) \]
<p>has perfectly anticorrelated spins along <em>every</em> axis, yet neither spin has any definite value on its own.</p>
<h3>Density matrices</h3>
<p>For a subsystem, use \(\hat\rho_A = \operatorname{Tr}_B|\Psi\rangle\langle\Psi|\). For the singlet, \(\hat\rho_A = \tfrac12\mathbb 1\): maximally mixed. Purity \(\operatorname{Tr}\hat\rho^2\) and entanglement entropy \(S = -\operatorname{Tr}\hat\rho_A\ln\hat\rho_A\) quantify it (\(S = \ln 2\) here).</p>
<h3>Bell's theorem (1964)</h3>
<p>Suppose the outcomes were fixed in advance by hidden variables \(\lambda\) and Alice's result didn't depend on Bob's setting (locality). Then for settings \(a, a'\) and \(b, b'\), the CHSH combination</p>
\[ S = E(a,b) - E(a,b') + E(a',b) + E(a',b') \]
<p>obeys \(|S| \le 2\). Quantum mechanics predicts \(E(a,b) = -\cos(a-b)\) for the singlet, and at \(a = 0\), \(a' = 90^\circ\), \(b = 45^\circ\), \(b' = 135^\circ\) it gives \(|S| = 2\sqrt2\) (Tsirelson's bound). Experiments by Aspect, Clauser and Zeilinger (Nobel 2022), and loophole-free tests in 2015, side with quantum mechanics.</p>
<p>The simulation runs both models, a genuinely local hidden-variable model and the quantum prediction, pair by pair. The local model is capped at 2 however you set the angles.</p>
<p>What Bell rules out is <em>local realism</em>. Entanglement still can't send signals: Bob's own statistics don't depend on Alice's choice (no-signalling).</p>`,
      exercises: [
        { kind: "num", q: R`For the singlet, what is \(E(a,b)\) when \(a = b\)?`, answer: -1, tol: 0.001, why: "Perfect anticorrelation." },
        { kind: "num", q: R`Maximal quantum CHSH value \(|S|\)? (3 d.p.)`, answer: 2 * Math.SQRT2, tol: 0.001, why: R`Tsirelson: \(2\sqrt2 \approx 2.828\).` },
        { kind: "mc", q: R`\(\hat\rho_A\) of one half of a Bell pair is…`, options: ["A pure state", "½·𝟙, maximally mixed", "Zero", "Not defined"], answer: 1, why: "All the information sits in the correlations." },
      ],
      gym: ["chsh-corr", "purity"],
    },
    {
      id: "identical", level: 4, title: "Identical particles and second quantization", minutes: 30,
      body: R`
<p>Two electrons are not merely similar; they are <em>indistinguishable</em>. Swapping them can change the state by at most a sign:</p>
\[ \psi(x_2,x_1) = \pm\,\psi(x_1,x_2). \]
<p>\(+\) for <strong>bosons</strong> (integer spin), \(-\) for <strong>fermions</strong> (half-integer spin). That link is the spin–statistics theorem, provable only in relativistic QFT. Antisymmetry forbids two fermions from sharing a state: the <strong>Pauli exclusion principle</strong>, which builds the periodic table and holds white dwarfs up.</p>
<h3>Occupation numbers</h3>
<p>Writing symmetrized many-body wavefunctions is painful. Instead, list how many particles occupy each single-particle mode, \(|n_1, n_2, \dots\rangle\), and introduce creation and annihilation operators for each mode:</p>
\[ [\hat a_i,\hat a_j^\dagger] = \delta_{ij}\ \text{(bosons)}, \qquad \{\hat c_i,\hat c_j^\dagger\} = \delta_{ij}\ \text{(fermions)}. \]
<p>The anticommutator makes \((\hat c_i^\dagger)^2 = 0\): Pauli exclusion as algebra. One- and two-body operators become</p>
\[ \hat H = \sum_{ij} t_{ij}\,\hat c_i^\dagger\hat c_j + \tfrac12\sum_{ijkl}V_{ijkl}\,\hat c_i^\dagger\hat c_j^\dagger\hat c_l\hat c_k. \]
<p>This is <strong>second quantization</strong>, the language of condensed matter (Hubbard model, BCS superconductivity) and quantum field theory. The harmonic oscillator's ladder is the same structure: each mode of a field is an oscillator, and \(\hat a^\dagger\) adds one quantum.</p>`,
      exercises: [
        { kind: "num", q: R`Fermionic mode: compute \(\hat c^\dagger\hat c^\dagger|0\rangle\)'s norm.`, answer: 0, tol: 0.001, why: R`\(\{\hat c^\dagger,\hat c^\dagger\} = 0\) so \((\hat c^\dagger)^2 = 0\).` },
        { kind: "num", q: R`How many ways can 2 identical bosons occupy 3 modes?`, answer: 6, tol: 0.001, why: R`Multisets: \(\binom{3+2-1}{2} = 6\). Fermions: \(\binom32 = 3\). Distinguishable: 9.` },
        { kind: "mc", q: "White dwarfs don't collapse under gravity mainly because of…", options: ["Thermal pressure", "Electron degeneracy pressure (Pauli)", "Magnetic fields", "Nuclear fusion"], answer: 1, why: "Electrons can't all drop into the lowest momentum states." },
      ],
      gym: ["fermions"],
    },
    {
      id: "pathintegral", level: 4, title: "Path integrals", minutes: 30,
      body: R`
<p>Feynman's reformulation: the amplitude to go from \(x_a\) at time 0 to \(x_b\) at time \(T\) is a sum over <em>every</em> path, each weighted by a phase set by the classical action:</p>
\[ \langle x_b|e^{-i\hat HT/\hbar}|x_a\rangle = \int\mathcal D[x(t)]\;e^{iS[x]/\hbar}, \qquad S = \int_0^T\left(\tfrac12m\dot x^2 - V(x)\right)dt. \]
<h3>Derivation sketch</h3>
<p>Slice \(T\) into \(N\) steps of \(\epsilon\). Insert \(\mathbb 1 = \int|x_k\rangle\langle x_k|dx_k\) between every factor \(e^{-i\hat H\epsilon/\hbar}\), and use \(e^{-i(\hat T+\hat V)\epsilon/\hbar}\approx e^{-i\hat T\epsilon/\hbar}e^{-i\hat V\epsilon/\hbar}\) (Trotter). Each short-time kernel is a Gaussian integral over momentum, giving \(e^{i\epsilon[\frac m2(\frac{x_{k+1}-x_k}{\epsilon})^2 - V]/\hbar}\). Take \(N\to\infty\).</p>
<h3>Why classical mechanics wins for big things</h3>
<p>When \(S\gg\hbar\), neighbouring paths have wildly different phases and cancel, except near paths where \(\delta S = 0\). Stationary phase recovers the principle of least action, and so Newton. Quantum effects are the fluctuations around the classical path, of order \(\sqrt\hbar\).</p>
<h3>What it's good for</h3>
<ul>
<li><strong>Imaginary time</strong> \(t\to-i\tau\) turns \(e^{iS/\hbar}\) into \(e^{-S_E/\hbar}\): quantum mechanics becomes statistical mechanics, and quantum Monte Carlo becomes possible.</li>
<li><strong>Instantons</strong>: tunnelling rates as classical paths in imaginary time.</li>
<li><strong>Symmetries and gauge theories</strong> are manifest in the action, which is why QFT is built this way.</li>
</ul>
<p>The free-particle kernel is \(K = \sqrt{\frac{m}{2\pi i\hbar T}}\exp\!\left[\frac{im(x_b-x_a)^2}{2\hbar T}\right]\).</p>`,
      exercises: [
        { kind: "mc", q: "In the classical limit, the paths that dominate are those where…", options: ["S is maximal", "S is stationary (δS = 0)", "S = 0", "The particle is at rest"], answer: 1, why: "Stationary phase." },
        { kind: "num", q: R`Free particle, \(m=\hbar=1\), \(T = 1\): what is \(|K|\) (independent of \(x\))? (3 d.p.)`, answer: 1 / Math.sqrt(2 * Math.PI), tol: 0.002, why: R`\(|\sqrt{1/2\pi i}| = 1/\sqrt{2\pi} \approx 0.399\).` },
        { kind: "mc", q: R`Rotating to imaginary time relates quantum mechanics to…`, options: ["Relativity", "Statistical mechanics with β ↔ T/ħ", "Electromagnetism", "Fluid dynamics"], answer: 1, why: R`\(\operatorname{Tr}e^{-\beta\hat H}\) is a path integral over periodic paths.` },
      ],
    },
    {
      id: "symmetry", level: 4, title: "Symmetry, Wigner and Berry", minutes: 25,
      body: R`
<p>A symmetry is a transformation that preserves all transition probabilities. <strong>Wigner's theorem</strong> says it must act as a unitary or an antiunitary operator; time reversal is the antiunitary one.</p>
<p>Continuous symmetries have generators: \(\hat U(\alpha) = e^{-i\alpha\hat G/\hbar}\). If \([\hat H,\hat G] = 0\), then \(\hat G\) is conserved. That's Noether's theorem in quantum form:</p>
<table class="mini"><tr><th>Symmetry</th><th>Generator</th><th>Conserved</th></tr>
<tr><td>Translation in space</td><td>\(\hat p\)</td><td>Momentum</td></tr>
<tr><td>Translation in time</td><td>\(\hat H\)</td><td>Energy</td></tr>
<tr><td>Rotation</td><td>\(\hat{\vec J}\)</td><td>Angular momentum</td></tr>
<tr><td>Phase \(e^{i\alpha}\)</td><td>\(\hat N\)</td><td>Particle number / charge</td></tr></table>
<p>Representation theory then does real work. The <strong>Wigner–Eckart theorem</strong> factors every matrix element of a tensor operator into a Clebsch–Gordan coefficient and one reduced number. Selection rules such as \(\Delta\ell = \pm1\) for dipole transitions come directly from it.</p>
<h3>Berry phase</h3>
<p>Take a Hamiltonian around a closed loop of parameters \(\vec R(t)\) slowly. Besides the dynamical phase, the state picks up a geometric phase</p>
\[ \gamma = i\oint\langle n(\vec R)|\nabla_{\vec R}\,n(\vec R)\rangle\cdot d\vec R. \]
<p>For a spin-½ following a magnetic field around a loop, \(\gamma = -\tfrac12\Omega\), minus half the solid angle enclosed. Berry phases underlie the Aharonov–Bohm effect, the quantum Hall effect and topological insulators.</p>`,
      exercises: [
        { kind: "num", q: R`Spin-½ follows a field once around the equator of the Bloch sphere. \(|\gamma|\) = ? (radians)`, answer: Math.PI, tol: 0.001, why: R`Solid angle of a hemisphere \(= 2\pi\); \(|\gamma| = \pi\).` },
        { kind: "mc", q: "Time reversal in quantum mechanics is represented by…", options: ["A unitary operator", "An antiunitary operator", "A projector", "It isn't a symmetry"], answer: 1, why: R`It must conjugate \(i\) to keep \(i\hbar\partial_t\) consistent.` },
        { kind: "mc", q: R`Dipole transitions in hydrogen require \(\Delta\ell = \)…`, options: ["0", "±1", "±2", "anything"], answer: 1, why: R`\(\hat{\vec r}\) is a rank-1 tensor with odd parity.` },
      ],
    },
    {
      id: "relativistic", level: 4, title: "Relativistic quantum mechanics", minutes: 30,
      body: R`
<p>Schrödinger's equation is first-order in time but second-order in space, which is not Lorentz-invariant. Two repairs:</p>
<h3>Klein–Gordon</h3>
<p>Quantize \(E^2 = p^2c^2 + m^2c^4\) directly:</p>
\[ \left(\frac{1}{c^2}\partial_t^2 - \nabla^2 + \frac{m^2c^2}{\hbar^2}\right)\phi = 0. \]
<p>It has negative-energy solutions and a "probability density" that can go negative. It turns out to be fine as a <em>field</em> equation for spin-0 particles, but not as a single-particle wave equation.</p>
<h3>Dirac</h3>
<p>Dirac wanted first order in time <em>and</em> space: \(i\hbar\partial_t\psi = (c\,\vec\alpha\cdot\hat{\vec p} + \beta mc^2)\psi\). Squaring must return Klein–Gordon, which forces \(\{\alpha_i,\alpha_j\} = 2\delta_{ij}\), \(\{\alpha_i,\beta\} = 0\), \(\beta^2 = 1\). The smallest matrices that satisfy these are 4×4, so \(\psi\) has four components. In covariant form:</p>
\[ (i\hbar\gamma^\mu\partial_\mu - mc)\psi = 0. \]
<p>The payoff:</p>
<ul>
<li><strong>Spin ½ appears automatically</strong>, with the electron's g-factor \(g = 2\). QED later corrects it to \(2.00231930436\dots\), one of the most precisely confirmed predictions in science.</li>
<li><strong>Fine structure</strong> of hydrogen comes out exactly.</li>
<li><strong>Antimatter.</strong> Negative-energy solutions led Dirac to predict the positron, found by Anderson in 1932.</li>
</ul>
<p>The lesson Dirac's equation teaches: relativity plus quantum mechanics allows particles to be created and destroyed. A fixed-particle-number wave equation can't be the whole story. You need fields.</p>`,
      exercises: [
        { kind: "num", q: "Dirac spinors in 3+1 dimensions have how many components?", answer: 4, tol: 0.001, why: "Two spin states × particle/antiparticle." },
        { kind: "num", q: R`Electron rest energy \(m_ec^2\) in keV? (3 s.f.)`, answer: 511, tol: 0.003, why: "511 keV: the energy of each photon when an electron and positron annihilate at rest." },
        { kind: "mc", q: "Dirac's equation predicted…", options: ["The neutron", "The positron", "The photon", "The Higgs"], answer: 1, why: "Anderson, cloud chamber, 1932." },
      ],
    },
    {
      id: "qft", level: 4, title: "Toward quantum field theory", minutes: 35,
      body: R`
<p>Put a field on a lattice of points, each coupled to its neighbours by springs. Its normal modes are harmonic oscillators, one for each wavevector \(\vec k\), with frequency \(\omega_k = \sqrt{c^2k^2 + m^2c^4/\hbar^2}\). Quantize each oscillator (level 2) and the field becomes</p>
\[ \hat\phi(\vec x) = \int\frac{d^3k}{(2\pi)^3}\frac{1}{\sqrt{2\omega_k}}\left(\hat a_{\vec k}\,e^{i\vec k\cdot\vec x} + \hat a^\dagger_{\vec k}\,e^{-i\vec k\cdot\vec x}\right), \qquad \hat H = \int\frac{d^3k}{(2\pi)^3}\,\hbar\omega_k\left(\hat a^\dagger_{\vec k}\hat a_{\vec k} + \tfrac12\right). \]
<p>A state \(\hat a^\dagger_{\vec k}|0\rangle\) has energy \(\hbar\omega_k\) and momentum \(\hbar\vec k\): <strong>a particle is one quantum of excitation of a field</strong>. Every electron in the universe is identical because they are all excitations of the same field.</p>
<h3>What comes next</h3>
<ul>
<li><strong>The vacuum isn't empty.</strong> Zero-point energies of all modes give the Casimir force between plates (measured) and a cosmological-constant problem (unsolved).</li>
<li><strong>Interactions</strong> such as \(\lambda\phi^4\) or \(e\bar\psi\gamma^\mu\psi A_\mu\) are expanded perturbatively. Each term is a <strong>Feynman diagram</strong>.</li>
<li><strong>Renormalization.</strong> Loop diagrams diverge. Absorbing the infinities into measured parameters works, and Wilson's renormalization group explains why: physics at long distances is insensitive to details at short ones.</li>
<li><strong>Gauge theories.</strong> Demanding local phase symmetry forces the existence of force fields. \(U(1)\) gives electromagnetism; \(SU(2)\times U(1)\) and \(SU(3)\) give the Standard Model.</li>
</ul>
<h3>Where to go from here</h3>
<p>Shankar or Sakurai for graduate quantum mechanics; Peskin &amp; Schroeder, Schwartz, or Tong's free lecture notes for QFT; Nielsen &amp; Chuang for quantum information.</p>`,
      exercises: [
        { kind: "mc", q: "In QFT, a particle is…", options: ["A point with a wavefunction", "A quantized excitation of a field mode", "A classical wave packet", "A small sphere"], answer: 1, why: R`\(\hat a^\dagger_{\vec k}|0\rangle\).` },
        { kind: "num", q: R`Zero-point energy of a single mode with \(\hbar\omega = 2\) meV, in meV?`, answer: 1, tol: 0.001, why: R`\(\tfrac12\hbar\omega\).` },
        { kind: "mc", q: "Requiring local U(1) phase invariance of the electron field forces…", options: ["Gravity", "The electromagnetic field", "The strong force", "Nothing"], answer: 1, why: R`The covariant derivative needs a gauge field \(A_\mu\): the photon.` },
      ],
    },
    {
      id: "decoherence", level: 4, title: "Decoherence and open systems", minutes: 25,
      body: R`
<p>Why don't we see cats in superposition? A system is never isolated. It entangles with its environment:</p>
\[ (\alpha|0\rangle + \beta|1\rangle)|E\rangle \ \to\ \alpha|0\rangle|E_0\rangle + \beta|1\rangle|E_1\rangle. \]
<p>Trace out the environment and the system's density matrix is</p>
\[ \hat\rho = \begin{pmatrix}|\alpha|^2 & \alpha\beta^*\langle E_1|E_0\rangle\\ \alpha^*\beta\langle E_0|E_1\rangle & |\beta|^2\end{pmatrix}. \]
<p>As the environment records which branch it's in, \(\langle E_0|E_1\rangle\to0\), the off-diagonal <em>coherences</em> vanish, and the system looks like a classical mixture. For a dust grain in air this takes about \(10^{-31}\) seconds. The measurement "collapse" is, operationally, decoherence into the environment of the apparatus. Whether anything further happens is the interpretation question (Copenhagen, many worlds, Bohmian mechanics, QBism). It remains open, because all interpretations make the same predictions for every experiment done so far.</p>
<h3>The Lindblad equation</h3>
<p>The most general Markovian evolution of \(\hat\rho\) that keeps it a valid density matrix is</p>
\[ \frac{d\hat\rho}{dt} = -\frac{i}{\hbar}[\hat H,\hat\rho] + \sum_k\gamma_k\left(\hat L_k\hat\rho\hat L_k^\dagger - \tfrac12\{\hat L_k^\dagger\hat L_k,\hat\rho\}\right). \]
<p>With \(\hat L = \hat\sigma_-\) you get spontaneous emission (T₁); with \(\hat L = \hat\sigma_z\), pure dephasing (T₂). Fighting these rates is the central engineering problem of quantum computing, which is what quantum error correction is for.</p>`,
      exercises: [
        { kind: "mc", q: "Decoherence destroys…", options: ["Populations (diagonal of ρ)", "Coherences (off-diagonal of ρ)", "Energy", "Normalization"], answer: 1, why: "Pure dephasing leaves populations alone." },
        { kind: "num", q: R`Pure state \(\tfrac{1}{\sqrt2}(|0\rangle+|1\rangle)\) fully decohered. Purity \(\operatorname{Tr}\rho^2\) = ?`, answer: 0.5, tol: 0.001, why: R`\(\rho = \tfrac12\mathbb 1\), \(\operatorname{Tr}\rho^2 = \tfrac14 + \tfrac14\).` },
      ],
      gym: ["purity"],
    },
  ];

  root.QCourse = { levels, lessons, byId: Object.fromEntries(lessons.map((l) => [l.id, l])) };
})(typeof window !== "undefined" ? window : globalThis);
