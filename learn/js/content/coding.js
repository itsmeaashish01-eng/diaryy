/* ================================================
   CODE CLINIC — content/coding.js
   Track 1: from a blank page to a working website, then enough Python
   to analyse data. Every HTML exercise is a piece of your own site.

   Escaping, for whoever edits this next: lesson text lives in template
   literals, so a backtick inside it is written \` and a dollar-brace is
   written \${ . The self-test runs every model answer, so a slip in code
   shows up there; a slip in prose shows up on the page.
   ================================================ */
(function (CC) {
  "use strict";

  /* ---- fictional patients the data exercises share ------------------- */
  const PATIENTS_JS = `const PATIENTS = [
  { id: "A01", age: 67, sex: "F", sbp: 142, diabetes: true },
  { id: "A02", age: 54, sex: "M", sbp: 128, diabetes: false },
  { id: "A03", age: 81, sex: "F", sbp: 155, diabetes: false },
  { id: "A04", age: 73, sex: "M", sbp: 138, diabetes: true },
  { id: "A05", age: 49, sex: "F", sbp: 118, diabetes: false },
  { id: "A06", age: 88, sex: "F", sbp: 162, diabetes: true },
  { id: "A07", age: 62, sex: "M", sbp: 134, diabetes: false },
  { id: "A08", age: 77, sex: "M", sbp: 149, diabetes: true },
  { id: "A09", age: 58, sex: "F", sbp: 124, diabetes: false },
  { id: "A10", age: 70, sex: "F", sbp: 136, diabetes: false },
  { id: "A11", age: 84, sex: "M", sbp: 158, diabetes: true },
  { id: "A12", age: 66, sex: "F", sbp: 130, diabetes: false },
];`;

  const PATIENTS_PY = `PATIENTS = [
    {"id": "A01", "age": 67, "sex": "F", "sbp": 142, "diabetes": True},
    {"id": "A02", "age": 54, "sex": "M", "sbp": 128, "diabetes": False},
    {"id": "A03", "age": 81, "sex": "F", "sbp": 155, "diabetes": False},
    {"id": "A04", "age": 73, "sex": "M", "sbp": 138, "diabetes": True},
    {"id": "A05", "age": 49, "sex": "F", "sbp": 118, "diabetes": False},
    {"id": "A06", "age": 88, "sex": "F", "sbp": 162, "diabetes": True},
    {"id": "A07", "age": 62, "sex": "M", "sbp": 134, "diabetes": False},
    {"id": "A08", "age": 77, "sex": "M", "sbp": 149, "diabetes": True},
    {"id": "A09", "age": 58, "sex": "F", "sbp": 124, "diabetes": False},
    {"id": "A10", "age": 70, "sex": "F", "sbp": 136, "diabetes": False},
    {"id": "A11", "age": 84, "sex": "M", "sbp": 158, "diabetes": True},
    {"id": "A12", "age": 66, "sex": "F", "sbp": 130, "diabetes": False},
]`;

  /* ---- HTML exercises ------------------------------------------------- */

  const ABOUT_STARTER = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title></title>
</head>
<body>
  <!-- 1. A main heading with your name -->

  <!-- 2. A paragraph about you: what you do, what you're curious about -->

  <!-- 3. A list of three or more research interests -->

  <!-- 4. A link people can use to reach you -->

</body>
</html>
`;

  const ABOUT_SOLUTION = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Dr A. N. Example — physician and researcher</title>
</head>
<body>
  <h1>Dr A. N. Example</h1>
  <p>I am a physician in fellowship training. I'm interested in how older adults recover after an admission to hospital, and in making research data easier to trust.</p>
  <h2>Research interests</h2>
  <ul>
    <li>Recovery and readmission after acute illness</li>
    <li>Frailty, and how we measure it</li>
    <li>Reproducible analysis of routine data</li>
  </ul>
  <p>Get in touch: <a href="mailto:a.example@example.org">a.example@example.org</a></p>
</body>
</html>
`;

  const SEMANTIC_STARTER = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Dr A. N. Example</title>
</head>
<body>
  <div class="top">
    <h1>Dr A. N. Example</h1>
    <div class="menu">
      <a href="#about">About</a>
      <a href="#research">Research</a>
      <a href="#contact">Contact</a>
    </div>
  </div>

  <div class="content">
    <div id="about">
      <h3>About</h3>
      <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='96'%3E%3Ccircle cx='48' cy='48' r='46' fill='%23c7784c'/%3E%3C/svg%3E">
      <p>Physician in fellowship training, interested in recovery after acute illness.</p>
    </div>

    <div id="research">
      <h3>Research</h3>
      <p>I study readmission after hospital stays in older adults. To read about the current project, <a href="#research">click here</a>.</p>
    </div>

    <div id="contact">
      <h3>Contact</h3>
      <p>Email <a href="mailto:a.example@example.org">a.example@example.org</a></p>
    </div>
  </div>

  <div class="bottom">
    <p>© 2026 A. N. Example</p>
  </div>
</body>
</html>
`;

  const SEMANTIC_SOLUTION = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Dr A. N. Example</title>
</head>
<body>
  <header>
    <h1>Dr A. N. Example</h1>
    <nav>
      <a href="#about">About</a>
      <a href="#research">Research</a>
      <a href="#contact">Contact</a>
    </nav>
  </header>

  <main>
    <section id="about">
      <h2>About</h2>
      <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='96'%3E%3Ccircle cx='48' cy='48' r='46' fill='%23c7784c'/%3E%3C/svg%3E" alt="">
      <p>Physician in fellowship training, interested in recovery after acute illness.</p>
    </section>

    <section id="research">
      <h2>Research</h2>
      <p>I study readmission after hospital stays in older adults. <a href="#research">More about the current project</a>.</p>
    </section>

    <section id="contact">
      <h2>Contact</h2>
      <p>Email <a href="mailto:a.example@example.org">a.example@example.org</a></p>
    </section>
  </main>

  <footer>
    <p>© 2026 A. N. Example</p>
  </footer>
</body>
</html>
`;

  const SEMANTIC_BODY = `
  <header>
    <h1>Dr A. N. Example</h1>
    <nav>
      <ul>
        <li><a href="#about">About</a></li>
        <li><a href="#research">Research</a></li>
        <li><a href="#publications">Publications</a></li>
        <li><a href="#contact">Contact</a></li>
      </ul>
    </nav>
  </header>

  <main>
    <section id="about">
      <h2>About</h2>
      <p>I am a physician in fellowship training. I'm interested in how older adults recover after an admission to hospital, and in making research data easier to trust.</p>
    </section>

    <section id="research">
      <h2>Research</h2>
      <p>My current project asks whether starting mobilisation early changes readmission — and how much of the apparent benefit is really frailty.</p>
    </section>

    <section id="publications">
      <h2>Publications</h2>
      <div class="publications">
        <article class="card">
          <h3>Early mobility and readmission: a cohort study</h3>
          <p>Example AN, Colleague B. <em>Journal of Examples</em>, 2026.</p>
        </article>
        <article class="card">
          <h3>Measuring frailty on the ward</h3>
          <p>Colleague B, Example AN. <em>Journal of Examples</em>, 2025.</p>
        </article>
        <article class="card">
          <h3>Reproducible analysis of routine data</h3>
          <p>Example AN. <em>Methods in Examples</em>, 2025.</p>
        </article>
      </div>
    </section>

    <section id="contact">
      <h2>Contact</h2>
      <p>Email <a href="mailto:a.example@example.org">a.example@example.org</a></p>
    </section>
  </main>

  <footer>
    <p>© 2026 A. N. Example</p>
  </footer>
`;

  const CSS_STARTER = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Dr A. N. Example</title>
  <style>
    /* Your styles go here. Start with :root and body. */

  </style>
</head>
<body>${SEMANTIC_BODY}</body>
</html>
`;

  const CSS_SOLUTION = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Dr A. N. Example</title>
  <style>
    :root {
      --ink: #2c2318;
      --muted: #6f604e;
      --accent: #b5673d;
      --paper: #faf8f4;
    }
    body {
      margin: 0;
      font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
      color: var(--ink);
      background: var(--paper);
    }
    main, header, footer {
      max-width: 70ch;
      margin: 0 auto;
      padding: 0 1rem;
    }
    p, li {
      line-height: 1.6;
    }
    h1, h2 {
      font-family: Georgia, serif;
      font-weight: 500;
    }
    a {
      color: var(--accent);
    }
    footer {
      color: var(--muted);
      font-size: 0.9rem;
    }
  </style>
</head>
<body>${SEMANTIC_BODY}</body>
</html>
`;

  const LAYOUT_STARTER = CSS_SOLUTION.replace(`<meta charset="UTF-8">\n`, `<meta charset="UTF-8">\n  <!-- 1. The viewport meta tag goes here -->\n`)
    .replace(`    footer {\n      color: var(--muted);\n      font-size: 0.9rem;\n    }\n`, `    footer {\n      color: var(--muted);\n      font-size: 0.9rem;\n    }\n\n    /* 2. Make the nav's list a row */\n\n    /* 3. Make .publications a grid of cards */\n\n    /* 4. Keep images inside their container */\n\n    /* 5. Change something on small screens */\n\n    /* 6. Dark mode */\n`);

  const LAYOUT_SOLUTION = CSS_SOLUTION.replace(`<meta charset="UTF-8">\n`, `<meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n`)
    .replace(`    footer {\n      color: var(--muted);\n      font-size: 0.9rem;\n    }\n`, `    footer {
      color: var(--muted);
      font-size: 0.9rem;
    }
    nav ul {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
      list-style: none;
      padding: 0;
    }
    .publications {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1rem;
    }
    .card {
      padding: 1rem;
      border: 1px solid #e8e0d4;
      border-radius: 10px;
    }
    img {
      max-width: 100%;
      height: auto;
    }
    @media (max-width: 640px) {
      .publications {
        grid-template-columns: 1fr;
      }
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --ink: #f0e8dc;
        --muted: #b3a392;
        --accent: #e8a27c;
        --paper: #1a1612;
      }
    }
`);

  const DOM_STARTER = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>BMI calculator</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 30rem; margin: 2rem auto; padding: 0 1rem; }
    label { display: block; margin-top: 0.8rem; }
    input, button { font: inherit; padding: 0.3rem 0.5rem; }
    button { margin-top: 1rem; }
    output { display: block; margin-top: 1rem; font-weight: 600; }
  </style>
</head>
<body>
  <h1>BMI calculator</h1>

  <!-- 1. Give each input a <label for="..."> -->
  <input id="weight" type="number" min="1" step="0.1">
  <input id="height" type="number" min="1" step="0.1">

  <button id="calc" type="button">Calculate</button>
  <output id="result" aria-live="polite"></output>
  <p><small>For teaching only — not for clinical use.</small></p>

  <script>
    // 2. When #calc is clicked: read both inputs, work out the BMI
    //    (height is in centimetres!), and show "BMI 22.9 — normal" in #result.
    // 3. If either box is empty or not a positive number, say so instead.
  </script>
</body>
</html>
`;

  const DOM_SOLUTION = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>BMI calculator</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 30rem; margin: 2rem auto; padding: 0 1rem; }
    label { display: block; margin-top: 0.8rem; }
    input, button { font: inherit; padding: 0.3rem 0.5rem; }
    button { margin-top: 1rem; }
    output { display: block; margin-top: 1rem; font-weight: 600; }
  </style>
</head>
<body>
  <h1>BMI calculator</h1>

  <label for="weight">Weight (kg)</label>
  <input id="weight" type="number" min="1" step="0.1">
  <label for="height">Height (cm)</label>
  <input id="height" type="number" min="1" step="0.1">

  <button id="calc" type="button">Calculate</button>
  <output id="result" aria-live="polite"></output>
  <p><small>For teaching only — not for clinical use.</small></p>

  <script>
    function category(b) {
      if (b < 18.5) return "underweight";
      if (b < 25) return "normal";
      if (b < 30) return "overweight";
      return "obese";
    }

    document.getElementById("calc").addEventListener("click", () => {
      const kg = parseFloat(document.getElementById("weight").value);
      const cm = parseFloat(document.getElementById("height").value);
      const out = document.getElementById("result");
      if (!(kg > 0) || !(cm > 0)) {
        out.textContent = "Please enter a weight and a height.";
        return;
      }
      const m = cm / 100;
      const b = kg / (m * m);
      out.textContent = "BMI " + b.toFixed(1) + " — " + category(b);
    });
  </script>
</body>
</html>
`;

  const SITE_STARTER = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Your Name — physician and researcher</title>
  <meta name="description" content="TODO: one sentence about who you are and what you work on, for search results.">
  <style>
    :root {
      --ink: #2c2318;
      --muted: #6f604e;
      --accent: #b5673d;
      --paper: #faf8f4;
      --line: #e8e0d4;
    }
    @media (prefers-color-scheme: dark) {
      :root { --ink: #f0e8dc; --muted: #b3a392; --accent: #e8a27c; --paper: #1a1612; --line: #3d3630; }
    }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; line-height: 1.6; color: var(--ink); background: var(--paper); }
    header, main, footer { max-width: 72ch; margin: 0 auto; padding: 0 1.25rem; }
    header { padding-top: 3rem; }
    h1, h2, h3 { font-family: Georgia, "Times New Roman", serif; font-weight: 500; line-height: 1.2; }
    h1 { font-size: 2.4rem; margin: 0 0 0.3rem; }
    .role { color: var(--muted); margin: 0 0 1rem; }
    nav ul { display: flex; flex-wrap: wrap; gap: 0.4rem 1.2rem; list-style: none; padding: 0; margin: 1rem 0 2rem; }
    a { color: var(--accent); }
    section { padding: 1rem 0; border-top: 1px solid var(--line); }
    .pubs { list-style: none; padding: 0; }
    .pubs li { margin: 0 0 1rem; }
    .pubs .venue { color: var(--muted); }
    img { max-width: 100%; height: auto; border-radius: 50%; }
    footer { color: var(--muted); font-size: 0.9rem; padding-bottom: 3rem; }
    @media (max-width: 600px) { h1 { font-size: 1.9rem; } header { padding-top: 1.5rem; } }
  </style>
</head>
<body>
  <header>
    <h1>Your Name</h1>
    <p class="role">TODO: your role — e.g. Fellow in ___ at ___ Hospital</p>
    <nav aria-label="Sections">
      <ul>
        <li><a href="#about">About</a></li>
        <li><a href="#research">Research</a></li>
        <li><a href="#publications">Publications</a></li>
        <li><a href="#contact">Contact</a></li>
      </ul>
    </nav>
  </header>

  <main>
    <section id="about">
      <h2>About</h2>
      <p>TODO: two or three sentences — your training, your clinical interests, what you're working towards.</p>
    </section>

    <section id="research">
      <h2>Research</h2>
      <p>TODO: the question you're working on, in words a patient could follow.</p>
    </section>

    <section id="publications">
      <h2>Publications</h2>
      <ul class="pubs">
        <li><a href="https://doi.org/10.xxxx/xxxx">TODO: title of the paper</a><br><span class="venue">Authors. Journal, year.</span></li>
        <li><a href="https://doi.org/10.xxxx/xxxx">TODO: title of the paper</a><br><span class="venue">Authors. Journal, year.</span></li>
      </ul>
    </section>

    <section id="contact">
      <h2>Contact</h2>
      <p>TODO: <a href="mailto:you@example.org">you@example.org</a></p>
    </section>
  </main>

  <footer>
    <p>© 2026 Your Name. Nothing on this site is medical advice.</p>
  </footer>
</body>
</html>
`;

  const SITE_SOLUTION = SITE_STARTER
    .replace("<title>Your Name — physician and researcher</title>", "<title>Dr A. N. Example — physician and researcher</title>")
    .replace(`content="TODO: one sentence about who you are and what you work on, for search results."`, `content="Dr A. N. Example is a physician researching recovery and readmission in older adults after acute illness."`)
    .replace("<h1>Your Name</h1>", "<h1>Dr A. N. Example</h1>")
    .replace("TODO: your role — e.g. Fellow in ___ at ___ Hospital", "Fellow in General Medicine")
    .replace("TODO: two or three sentences — your training, your clinical interests, what you're working towards.", "I'm a physician in fellowship training. I look after older adults admitted with acute illness, and I'm interested in what helps them get home and stay there.")
    .replace("TODO: the question you're working on, in words a patient could follow.", "Does getting out of bed early in a hospital stay mean you're less likely to come back? My current study tries to answer that while taking account of how frail people were to begin with.")
    .replace(`<li><a href="https://doi.org/10.xxxx/xxxx">TODO: title of the paper</a><br><span class="venue">Authors. Journal, year.</span></li>\n        <li><a href="https://doi.org/10.xxxx/xxxx">TODO: title of the paper</a><br><span class="venue">Authors. Journal, year.</span></li>`,
      `<li><a href="https://doi.org/10.5555/example.0001">Early mobility and readmission: a cohort study</a><br><span class="venue">Example AN, Colleague B. Journal of Examples, 2026.</span></li>\n        <li><a href="https://doi.org/10.5555/example.0002">Measuring frailty on the ward</a><br><span class="venue">Colleague B, Example AN. Journal of Examples, 2025.</span></li>`)
    .replace(`TODO: <a href="mailto:you@example.org">you@example.org</a>`, `Email <a href="mailto:a.example@example.org">a.example@example.org</a> — I'm happy to hear about collaborations and teaching.`)
    .replace("© 2026 Your Name.", "© 2026 A. N. Example.");

  /* ---- numbers the Python checks compare against, from the same cohort --- */
  const S = CC.stats;
  const COHORT = S.makeCohort({ seed: S.SEED });
  const rate = (emp) => { const g = COHORT.filter((r) => r.emp === emp); return g.filter((r) => r.readmit30 === 1).length / g.length; };
  const AGES = COHORT.map((r) => r.age);

  CC.content.addTrack({
    id: "code",
    order: 1,
    icon: "{ }",
    title: "Coding",
    summary: "HTML, CSS and JavaScript — the three languages of every web page — then enough Python to analyse data. The HTML exercises build your own site.",
    outcome: "A finished, accessible, responsive personal website in one file, ready to publish — and the habits of reading errors, testing and checking units that make anyone's code, including AI's, safe to use.",
    lessons: [
      /* ============================================================ */
      {
        id: "code-html",
        title: "Your first page: HTML",
        minutes: 35,
        project: "website",
        summary: "Elements, tags and attributes — and the page that will become your website.",
        keywords: "html tags elements heading paragraph list link",
        objectives: [
          "Read and write the skeleton every web page has",
          "Use headings, paragraphs, lists and links",
          "Explain what the \`lang\` attribute and the \`<title>\` are for",
        ],
        blocks: [
          { md: `
            ## What HTML is for

            HTML says what things on a page **are**: this is the main heading, this is a paragraph, this is a list, this is a link. It doesn't say what they look like — that's CSS, two lessons from now. Keeping the two apart is why the same page can be read aloud by a screen reader, indexed by a search engine, and restyled without touching a word.

            A page is made of **elements**. Most have an opening tag and a closing tag, with content between:

            \`\`\`html
            <p>I look after older adults admitted with acute illness.</p>
            \`\`\`

            Some carry **attributes** — extra information in the opening tag. A link's destination is its \`href\`:

            \`\`\`html
            <a href="mailto:you@example.org">Email me</a>
            \`\`\`

            Elements nest, like a differential inside a working diagnosis: a list contains list items.

            \`\`\`html
            <ul>
              <li>Recovery after acute illness</li>
              <li>Frailty</li>
            </ul>
            \`\`\`

            ## The skeleton

            Every page has the same outline:

            \`\`\`html
            <!DOCTYPE html>
            <html lang="en">
            <head>
              <meta charset="UTF-8">
              <title>Shown in the browser tab and in search results</title>
            </head>
            <body>
              Everything visible goes here.
            </body>
            </html>
            \`\`\`

            - \`<!DOCTYPE html>\` tells the browser to use modern rules. Leave it off and it falls back to "quirks mode", reproducing the bugs of 1990s browsers.
            - \`lang="en"\` tells screen readers which pronunciation to use, and translation tools what they're translating. If your site is in Hindi, it's \`lang="hi"\`.
            - \`<head>\` holds information *about* the page; \`<body>\` holds the page.
            - \`<title>\` is what appears in the tab, in bookmarks and as the headline of a search result. It is not the same as the heading on the page.

            ## Headings are an outline

            \`<h1>\` to \`<h6>\` are levels of an outline, not sizes. One \`<h1>\` — the page's subject — then \`<h2>\` for its sections, \`<h3>\` within those. People using screen readers navigate by jumping between headings, so an outline that skips levels is like a discharge summary with the headings shuffled.
          ` },
          {
            type: "code", id: "about", lang: "html", title: "The first draft of your site",
            prompt: `
              Fill in the page below about **you** — it's the first draft of your website. You need:

              1. \`lang="en"\` (or your language) on the \`<html>\` tag, and a \`<title>\`
              2. One \`<h1>\` with your name
              3. A paragraph of at least 15 words about what you do
              4. A list of three or more research interests
              5. A link to reach you — \`<a href="mailto:...">\` works

              The preview updates when you run it. Ctrl/⌘ + Enter runs from the keyboard.
            `,
            starter: ABOUT_STARTER,
            solution: ABOUT_SOLUTION,
            hints: [
              "The language goes on the opening tag: `<html lang=\"en\">`.",
              "A list is `<ul>` with an `<li>` for each item inside it.",
              "An email link: `<a href=\"mailto:you@example.org\">you@example.org</a>` — the text between the tags is what people see.",
            ],
            tests: [
              { name: "The page says what language it's in", code: `$check(document.documentElement.lang, 'add lang="en" to the <html> tag');` },
              { name: "It has a title", code: `$check(document.title.trim().length > 0, "the <title> is empty");` },
              { name: "Exactly one main heading, with a name in it", code: `const h = $qa("h1"); $check(h.length === 1, "there should be exactly one <h1> (found " + h.length + ")"); const t = $text(h[0]); $check(t.length > 2 && !/your name/i.test(t), "put your name in the <h1>");` },
              { name: "A paragraph of at least 15 words", code: `const ok = $qa("p").map($text).some((p) => p.split(/\\s+/).filter(Boolean).length >= 15); $check(ok, "write at least one <p> of 15 words or more");` },
              { name: "A list of three or more interests", code: `const ok = $qa("ul, ol").some((l) => l.querySelectorAll(":scope > li").length >= 3); $check(ok, "a <ul> or <ol> with at least three <li> items");` },
              { name: "A way to reach you", code: `const ok = $qa("a[href]").some((a) => /^(mailto:|https?:)/i.test(a.getAttribute("href")) && $text(a).length > 0); $check(ok, 'add a link — <a href="mailto:...">your address</a> — with some text inside it');` },
            ],
            explain: "That's a real web page — save it as `index.html` and any browser opens it. Everything from here on adds to it.",
          },
          {
            type: "quiz", id: "q-title",
            question: "What's the difference between the `<title>` and the `<h1>`?",
            options: [
              "None — browsers show whichever comes first",
              "The `<title>` names the page in tabs, bookmarks and search results; the `<h1>` is the heading on the page itself",
              "The `<h1>` is for screen readers; the `<title>` is for everyone else",
            ],
            answer: 1,
            explain: "They often say similar things, but they live in different places. Search engines show your `<title>` as the link text, so make it say who you are: \"Dr A. N. Example — physician and researcher\".",
          },
        ],
      },

      /* ============================================================ */
      {
        id: "code-semantic",
        title: "Structure that machines can read",
        minutes: 30,
        project: "website",
        summary: "Semantic elements, alt text and honest links — accessibility as basic clinical-grade usability.",
        keywords: "semantic accessibility a11y header nav main section footer alt",
        objectives: [
          "Replace anonymous \`<div>\`s with \`<header>\`, \`<nav>\`, \`<main>\`, \`<section>\` and \`<footer>\`",
          "Write alt text that helps, and know when it should be empty",
          "Spot headings that skip levels and links that say \"click here\"",
        ],
        blocks: [
          { md: `
            ## Why structure matters

            A \`<div>\` is a box with no meaning. Pages built only from boxes look fine and are hard to use for anyone who isn't looking at them: screen reader users, people navigating by keyboard, search engines, and the tools that turn your page into a reading view.

            HTML has elements that say what a region **is**:

            | Element | Means | A screen reader offers it as |
            |---|---|---|
            | \`<header>\` | the introductory part — your name, the menu | a "banner" landmark |
            | \`<nav>\` | a set of navigation links | "navigation" |
            | \`<main>\` | the page's main content — once per page | "main" — the skip-to-content target |
            | \`<section>\` | a themed part, with its own heading | a region, when it has a heading |
            | \`<article>\` | a self-contained item: a post, a publication | "article" |
            | \`<footer>\` | closing information | "contentinfo" |

            ## Alt text

            Every \`<img>\` needs an \`alt\` attribute. It's read out instead of the image, and shown if the image fails to load.

            - If the image carries information, describe the information: \`alt="Kaplan–Meier curves: the programme group stays above usual care throughout the year"\`.
            - If it's decorative — a portrait next to your name, which is already on the page — use **empty** alt: \`alt=""\`. That tells assistive technology to skip it. *Missing* alt is different: a screen reader then reads out the file name.

            ## Links that say where they go

            Screen reader users often pull up a list of every link on a page. A list of "click here, click here, read more" is useless. Make the link text the destination: "the full protocol (PDF)", "my Google Scholar profile".

            > [!WHY] It's usability, not decoration
            > The standard is the Web Content Accessibility Guidelines (WCAG). Many institutions require level AA for anything public-facing. Beyond compliance: some of your colleagues and patients use screen readers, magnification or keyboard-only navigation. A page that works for them works better for everyone, the same way a well-structured referral letter is easier to read on a busy day.
          ` },
          {
            type: "code", id: "semantic", lang: "html", title: "Untangle the boxes",
            prompt: `
              This page works but means nothing to a machine. Rewrite it with semantic elements:

              - the top area in a \`<header>\`, and the menu in a \`<nav>\` whose links each point at a section that exists
              - the content in \`<main>\`, with each part a \`<section>\` starting with an \`<h2>\` (not \`<h3>\` — no skipping)
              - the bottom in a \`<footer>\`
              - alt text for the image (it's a decorative circle — so what kind of alt?)
              - a link text that makes sense out of context
            `,
            starter: SEMANTIC_STARTER,
            solution: SEMANTIC_SOLUTION,
            hints: [
              "Change the tag names, not the content: `<div class=\"top\">` becomes `<header>`, and its closing `</div>` becomes `</header>`.",
              "The circle is decoration — your name is already on the page — so it wants `alt=\"\"`, which tells screen readers to skip it.",
              "\"click here\" could become \"More about the current project\".",
            ],
            tests: [
              { name: "A <header> holds the name", code: `$check($q("header h1"), "wrap the top of the page — the <h1> and the menu — in <header>");` },
              { name: "The menu is a <nav>, and every link lands somewhere", code: `const nav = $q("nav"); $check(nav, "the menu should be a <nav>"); const links = Array.from(nav.querySelectorAll("a[href^='#']")); $check(links.length >= 3, "the <nav> should hold the three in-page links"); links.forEach((l) => $check(document.getElementById(l.getAttribute("href").slice(1)), "the link to " + l.getAttribute("href") + " points at nothing — is there an element with that id?"));` },
              { name: "Content in <main>, in sections with h2 headings", code: `const m = $q("main"); $check(m, "put the content in <main>"); const secs = m.querySelectorAll("section"); $check(secs.length >= 3, "use a <section> for each part (about, research, contact)"); secs.forEach((s) => $check(s.querySelector("h2"), "each <section> should start with an <h2>"));` },
              { name: "Headings don't skip a level", code: `const hs = $qa("h1,h2,h3,h4,h5,h6").map((h) => Number(h.tagName[1])); $check(hs[0] === 1, "start with an <h1>"); for (let i = 1; i < hs.length; i++) $check(hs[i] <= hs[i - 1] + 1, "a heading jumps from h" + hs[i - 1] + " to h" + hs[i]);` },
              { name: "The image has alt text", code: `$qa("img").forEach((i) => $check(i.hasAttribute("alt"), "every <img> needs an alt attribute — a description, or alt=\\"\\" if it's decoration"));` },
              { name: "Links make sense on their own", code: `$qa("a").forEach((a) => $check(!/^(click here|here|read more|link|more)$/i.test($text(a)), '"' + $text(a) + '" means nothing out of context — say where the link goes'));` },
              { name: "The bottom is a <footer>", code: `$check($q("footer"), "the bottom of the page should be a <footer>");` },
            ],
            explain: "The page looks identical — and now a screen reader can jump straight to the content, list the sections, and tell your visitor where each link goes.",
          },
        ],
      },

      /* ============================================================ */
      {
        id: "code-css",
        title: "Style: CSS",
        minutes: 40,
        project: "website",
        summary: "Selectors, the box model, readable type, and colours you can change in one place.",
        keywords: "css style selector box model font color variables custom properties",
        objectives: [
          "Write CSS rules: a selector, then properties and values",
          "Use the box model — margin, border, padding — and centre a column of text",
          "Keep colours in custom properties so the whole site changes from one place",
        ],
        blocks: [
          { md: `
            ## A rule

            CSS is a list of rules. Each picks some elements (the **selector**) and sets **properties** on them:

            \`\`\`css
            p {
              line-height: 1.6;
              color: #2c2318;
            }
            \`\`\`

            | Selector | Picks |
            |---|---|
            | \`p\` | every paragraph |
            | \`.card\` | everything with \`class="card"\` |
            | \`#contact\` | the one element with \`id="contact"\` |
            | \`nav a\` | links *inside* a nav |
            | \`h1, h2\` | both |

            When two rules disagree, the more specific selector wins (an id beats a class beats an element), and between equals the later one wins. That's the "cascade" in Cascading Style Sheets — and most "why won't my style apply?" moments are it.

            For a one-page site, the CSS can live in a \`<style>\` element in the \`<head>\`.

            ## The box model

            Every element is a box: content, then **padding** (space inside the border), the **border**, then **margin** (space outside). Two things worth knowing from day one:

            \`\`\`css
            * { box-sizing: border-box; }  /* width includes padding and border — far less arithmetic */
            main { max-width: 70ch; margin: 0 auto; }  /* a readable column, centred */
            \`\`\`

            \`70ch\` is seventy characters wide. Lines much longer than that are tiring to read, which is why journal pages use columns. \`margin: 0 auto\` means no margin above and below, and *equal automatic* margins left and right — which centres the box.

            ## Type that's easy to read

            - **Font:** \`font-family: system-ui, sans-serif;\` uses the operating system's own interface font — fast, clear, and nothing to download.
            - **Line height:** browsers default to about 1.2, cramped for paragraphs. 1.5–1.7 is comfortable.
            - **Units:** \`rem\` is relative to the reader's chosen font size, so people who set larger text get larger text. Prefer it to \`px\` for type.

            ## Colours in one place

            **Custom properties** (CSS variables) hold a value you can reuse:

            \`\`\`css
            :root {
              --accent: #b5673d;
            }
            a { color: var(--accent); }
            \`\`\`

            Change \`--accent\` and every use changes. The next lesson uses this to give the site a dark mode in five lines.

            > [!TIP] Contrast
            > Text needs enough contrast with its background to be read on a phone in daylight: WCAG asks for at least 4.5:1 for body text. Browser developer tools (right-click → Inspect) show the ratio when you click a colour.
          ` },
          {
            type: "code", id: "css", lang: "html", title: "Make it yours",
            prompt: `
              The page now has structure and no style. In the \`<style>\` element, add rules so that:

              1. \`body\` uses a sans-serif font (not the browser's default Times)
              2. paragraphs have a line height of at least 1.4
              3. \`main\` has a \`max-width\` and is centred with \`auto\` side margins
              4. at least one colour is defined as a custom property on \`:root\`
              5. links are your colour, not the default blue

              Pick colours you like — the checks don't mind which.
            `,
            starter: CSS_STARTER,
            solution: CSS_SOLUTION,
            hints: [
              "Start with `body { font-family: system-ui, sans-serif; }` and `p { line-height: 1.6; }`.",
              "`main { max-width: 70ch; margin: 0 auto; }` — the `auto` is what centres it.",
              "`:root { --accent: #b5673d; }` then `a { color: var(--accent); }`.",
            ],
            tests: [
              { name: "Body text isn't the browser's default font", code: `$check(!/times/i.test($style("body", "font-family")), "set font-family on body — try system-ui, sans-serif");` },
              { name: "Paragraphs have room to breathe", code: `const p = $q("p"); const lh = parseFloat($style(p, "line-height")); const fs = parseFloat($style(p, "font-size")); $check(lh / fs >= 1.4, "set line-height on p to about 1.5–1.7 (it's " + $style(p, "line-height") + ")");` },
              { name: "main is a readable column", code: `$check($style("main", "max-width") !== "none", "give main a max-width — around 70ch keeps lines readable");` },
              { name: "…centred with auto margins", code: `const ok = $rules().some((r) => r.selectorText && /(^|[\\s,>])main(?=$|[\\s,:.#[>])/.test(r.selectorText) && (r.style.marginLeft === "auto" || r.style.marginInlineStart === "auto")); $check(ok, "centre main with margin: 0 auto");` },
              { name: "Colours live in custom properties", code: `const ok = $rules().some((r) => r.selectorText === ":root" && Array.from(r.style).some((p) => p.startsWith("--"))); $check(ok, "define a colour on :root, e.g. --accent: #b5673d;");` },
              { name: "Links aren't the default blue", code: `$check($style("a", "color") !== "rgb(0, 0, 238)", "give links a colour — ideally var(--accent)");` },
            ],
          },
        ],
      },

      /* ============================================================ */
      {
        id: "code-layout",
        title: "Layout that works on a phone",
        minutes: 40,
        project: "website",
        summary: "Flexbox, grid, media queries and dark mode — most of your visitors will be on a phone.",
        keywords: "flexbox grid responsive media query viewport dark mode",
        objectives: [
          "Lay things out in a row with flexbox and in a grid with CSS grid",
          "Make the layout change on small screens with a media query",
          "Add a dark mode by redefining your custom properties",
        ],
        blocks: [
          { md: `
            ## The viewport tag

            Phones pretend to be desktop-wide screens unless a page tells them otherwise, then shrink everything to fit — that's why some sites appear as tiny text you have to pinch. One line in the \`<head>\` stops it:

            \`\`\`html
            <meta name="viewport" content="width=device-width, initial-scale=1">
            \`\`\`

            ## Flexbox: a row of things

            \`\`\`css
            nav ul {
              display: flex;      /* children sit side by side */
              flex-wrap: wrap;    /* …and wrap onto a new line when there's no room */
              gap: 1rem;          /* space between them */
              list-style: none;   /* no bullets */
              padding: 0;
            }
            \`\`\`

            ## Grid: rows and columns

            \`\`\`css
            .publications {
              display: grid;
              grid-template-columns: repeat(3, 1fr);  /* three equal columns */
              gap: 1rem;
            }
            \`\`\`

            \`1fr\` is "one share of the free space". (A grid that adapts by itself: \`repeat(auto-fit, minmax(14rem, 1fr))\` — as many columns of at least 14rem as fit.)

            ## Media queries: different rules for different screens

            \`\`\`css
            @media (max-width: 640px) {
              .publications { grid-template-columns: 1fr; }   /* one column on a phone */
            }
            \`\`\`

            The rules inside apply only when the condition is true. Use the preview's **Phone** button to watch it happen.

            ## Images that fit

            \`\`\`css
            img { max-width: 100%; height: auto; }
            \`\`\`

            An image never gets wider than its container, and keeps its proportions as it shrinks.

            ## Dark mode in five lines

            Because the colours are custom properties, a dark mode is a redefinition:

            \`\`\`css
            @media (prefers-color-scheme: dark) {
              :root { --ink: #f0e8dc; --paper: #1a1612; --accent: #e8a27c; }
            }
            \`\`\`

            The browser applies it when the visitor's device is set to dark.
          ` },
          {
            type: "code", id: "layout", lang: "html", title: "Make it work on a phone",
            prompt: `
              Your styled page has numbered comments where the layout goes. Add:

              1. the viewport \`<meta>\` tag
              2. \`nav ul\` as a flex row
              3. \`.publications\` as a grid, with a gap between the cards
              4. images limited to the width of their container
              5. an \`@media\` rule that changes something on small screens
              6. a dark mode with \`@media (prefers-color-scheme: dark)\`

              Then try the **Phone** and **Tablet** buttons on the preview.
            `,
            starter: LAYOUT_STARTER,
            solution: LAYOUT_SOLUTION,
            hints: [
              "The viewport tag: `<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">`, inside `<head>`.",
              "`.publications { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; }`",
              "Small screens: `@media (max-width: 640px) { .publications { grid-template-columns: 1fr; } }`",
            ],
            tests: [
              { name: "The page tells phones how wide it is", code: `const m = $q('meta[name="viewport"]'); $check(m && /width=device-width/.test(m.content), 'add <meta name="viewport" content="width=device-width, initial-scale=1"> to <head>');` },
              { name: "The menu is a row", code: `$check($style("nav ul", "display") === "flex", "make the nav's list display: flex");` },
              { name: "Publications are a grid…", code: `$check($style(".publications", "display") === "grid", "make .publications display: grid");` },
              { name: "…with space between the cards", code: `const g = $q(".publications"); $check(parseFloat($style(g, "row-gap")) > 0 || parseFloat($style(g, "column-gap")) > 0, "add a gap to the grid");` },
              { name: "Images can't overflow a phone", code: `const ok = $rules().some((r) => r.selectorText && /(^|[\\s,])img(?=$|[\\s,:.#[])/.test(r.selectorText) && r.style.maxWidth === "100%"); $check(ok, "img { max-width: 100%; } stops images spilling off small screens");` },
              { name: "The layout changes on small screens", code: `const ok = $rules().some((r) => r.media && /(max|min)-width/.test(r.conditionText || r.media.mediaText)); $check(ok, "add an @media rule, e.g. @media (max-width: 640px) { … }");` },
              { name: "There's a dark mode", code: `const ok = $rules().some((r) => r.media && /prefers-color-scheme:\\s*dark/.test(r.conditionText || r.media.mediaText)); $check(ok, "add @media (prefers-color-scheme: dark) and redefine your colour variables inside it");` },
            ],
          },
        ],
      },

      /* ============================================================ */
      {
        id: "code-js-basics",
        title: "JavaScript: values, variables, functions",
        minutes: 45,
        summary: "The language that makes pages do things — starting with clinical arithmetic you can check in your head.",
        keywords: "javascript variables functions if else numbers strings bmi map",
        objectives: [
          "Use numbers, strings and booleans, and store them with \`const\` and \`let\`",
          "Write functions that take inputs and \`return\` an answer",
          "Make decisions with \`if\` — and treat clinical thresholds as inputs, not constants",
        ],
        blocks: [
          { md: `
            ## Values and variables

            \`\`\`js
            const weightKg = 70;          // a number
            const unit = "kg";            // a string — text, in quotes
            const diabetic = true;        // a boolean: true or false
            let attempts = 0;             // let: a variable you'll change
            attempts = attempts + 1;
            \`\`\`

            Use \`const\` unless you need to reassign — it tells the reader "this won't change". Names are camelCase by convention, and worth making specific: \`heightM\` says its unit; \`h\` says nothing.

            \`console.log(...)\` prints, which is how you look inside a program while it runs. Your output appears under the editor.

            ## Arithmetic

            \`+ - * /\` as you'd expect; \`**\` is a power (\`1.75 ** 2\`); \`Math.round\`, \`Math.sqrt\`, \`Math.max\` and friends live on \`Math\`. Text joins with \`+\`, or with a *template literal* — backticks, with \`\${...}\` for values:

            \`\`\`js
            const bmi = 22.86;
            console.log(\`BMI \${bmi.toFixed(1)}\`);   // "BMI 22.9"
            \`\`\`

            ## Functions

            A function is a recipe with inputs (**parameters**) and an output (**return**):

            \`\`\`js
            function kgFromPounds(lb) {
              return lb * 0.45359237;
            }
            kgFromPounds(154);   // 69.85…
            \`\`\`

            A function without \`return\` gives back \`undefined\` — the most common first bug.

            ## Decisions

            \`\`\`js
            if (sbp >= 180) {
              level = "severe";
            } else if (sbp >= 140) {
              level = "raised";
            } else {
              level = "not raised";
            }
            \`\`\`

            Comparisons: \`<  <=  >  >=\`, equality \`===\`, inequality \`!==\`. (There's also \`==\`, which converts types first so that \`"5" == 5\` is true. Don't use it.) Combine with \`&&\` (and), \`||\` (or), \`!\` (not).

            > [!SAFETY] Clinical calculators
            > The formulas in these exercises are standard and simple on purpose. Software that informs individual patient care is often regulated as a medical device, and always needs validation against reference values and a clinical safety review. These are for learning to program, not for patients.
          ` },
          {
            type: "code", id: "bmi", lang: "js", title: "Body-mass index",
            prompt: "Finish `bmi(weightKg, heightM)` so it returns weight divided by height squared. Return the number itself — don't round it. Rounding is for showing to people, not for calculating with.",
            starter: `// Body-mass index: weight in kilograms divided by height in metres, squared.
function bmi(weightKg, heightM) {
  // your code here
}

console.log(bmi(70, 1.75)); // should print about 22.86
`,
            solution: `function bmi(weightKg, heightM) {
  return weightKg / (heightM * heightM);
}

console.log(bmi(70, 1.75));
`,
            hints: ["Height squared is `heightM * heightM` (or `heightM ** 2`).", "Don't forget the word `return` — without it the function gives back `undefined`."],
            tests: [
              { name: "bmi(70, 1.75) is about 22.86", code: `$near(bmi(70, 1.75), 22.857, 0.01, "bmi(70, 1.75)");` },
              { name: "bmi(95, 1.80) is about 29.32", code: `$near(bmi(95, 1.8), 29.321, 0.01, "bmi(95, 1.80)");` },
              { name: "It returns a number, not text", code: `$check(typeof bmi(60, 1.6) === "number", "return the number — toFixed() turns it into a string");` },
            ],
          },
          {
            type: "code", id: "map", lang: "js", title: "Mean arterial pressure",
            prompt: "Write `meanArterialPressure(sbp, dbp)` using the bedside estimate: diastolic plus a third of the pulse pressure (systolic − diastolic).",
            starter: `// MAP ≈ diastolic + (systolic − diastolic) / 3
function meanArterialPressure(sbp, dbp) {

}
`,
            solution: `function meanArterialPressure(sbp, dbp) {
  return dbp + (sbp - dbp) / 3;
}
`,
            hints: ["Brackets matter: `dbp + (sbp - dbp) / 3` is not the same as `(dbp + sbp - dbp) / 3`."],
            tests: [
              { name: "120/80 gives about 93.3", code: `$near(meanArterialPressure(120, 80), 93.333, 0.01);` },
              { name: "90/60 gives 70", code: `$near(meanArterialPressure(90, 60), 70, 1e-9);` },
              { name: "180/100 gives about 126.7", code: `$near(meanArterialPressure(180, 100), 126.667, 0.01);` },
            ],
          },
          {
            type: "code", id: "bmi-cat", lang: "js", title: "Categories with adjustable cut-offs",
            prompt: `
              Write \`bmiCategory(value, cutoffs)\`. By default the cut-offs are the WHO adult ones — below 18.5 is \`"underweight"\`, then \`"normal"\` up to (not including) 25, \`"overweight"\` up to 30, and \`"obese"\` from 30.

              Lower cut-offs are often used for South Asian adults — the WHO expert consultation of 2004 proposed action points at 23 and 27.5 — so the thresholds are a parameter, \`[18.5, 25, 30]\` unless someone passes others.
            `,
            starter: `function bmiCategory(value, cutoffs = [18.5, 25, 30]) {
  // Use cutoffs[0], cutoffs[1] and cutoffs[2] — not the numbers themselves.

}
`,
            solution: `function bmiCategory(value, cutoffs = [18.5, 25, 30]) {
  const [under, over, obese] = cutoffs;
  if (value < under) return "underweight";
  if (value < over) return "normal";
  if (value < obese) return "overweight";
  return "obese";
}
`,
            hints: ["Check from the bottom up: `if (value < cutoffs[0]) return \"underweight\";` then the next…", "25 itself is overweight, so the test is `value < 25` for normal — `<`, not `<=`."],
            tests: [
              { name: "17 is underweight", code: `$eq(bmiCategory(17), "underweight");` },
              { name: "18.5 and 22 are normal", code: `$eq(bmiCategory(18.5), "normal", "18.5"); $eq(bmiCategory(22), "normal", "22");` },
              { name: "25 exactly is overweight", code: `$eq(bmiCategory(25), "overweight", "25"); $eq(bmiCategory(29.9), "overweight", "29.9");` },
              { name: "30 and over is obese", code: `$eq(bmiCategory(30), "obese", "30"); $eq(bmiCategory(41), "obese", "41");` },
              { name: "Other cut-offs can be passed in", code: `$eq(bmiCategory(24, [18.5, 23, 27.5]), "overweight", "24 with Asian cut-offs"); $eq(bmiCategory(28, [18.5, 23, 27.5]), "obese", "28 with Asian cut-offs");` },
            ],
            explain: "Thresholds that live in one named place — a parameter, a settings file — can be changed and reviewed. Thresholds scattered through code as bare numbers are how a guideline update gets applied in three places and missed in a fourth.",
          },
          {
            type: "quiz", id: "q-float",
            question: "In JavaScript (and Python, and Excel), what does `0.1 + 0.2 === 0.3` give?",
            options: ["`true`", "`false`", "An error"],
            answer: 1,
            explain: "`0.1 + 0.2` is `0.30000000000000004`. Computers store most decimals as binary fractions that are very slightly off. It almost never matters in practice — but it means you compare calculated numbers with a tolerance (`Math.abs(a - b) < 1e-9`), and only round when you display a result.",
          },
        ],
      },

      /* ============================================================ */
      {
        id: "code-js-data",
        title: "Arrays, objects and loops",
        minutes: 45,
        project: "research",
        summary: "Lists of records — a ward list, a dataset — and the tools for counting, filtering and sorting them.",
        keywords: "arrays objects loops filter map reduce sort count",
        objectives: [
          "Represent a patient as an object and a cohort as an array of them",
          "Loop with \`for…of\`, and use \`filter\`, \`map\` and \`reduce\`",
          "Sort numbers correctly (the default sort doesn't)",
        ],
        blocks: [
          { md: `
            ## Objects: one record

            \`\`\`js
            const patient = { id: "A01", age: 67, sex: "F", sbp: 142, diabetes: true };
            patient.age;        // 67
            patient["sex"];     // "F" — the same thing, useful when the key is in a variable
            \`\`\`

            ## Arrays: a list

            \`\`\`js
            const ages = [67, 54, 81];
            ages.length;        // 3
            ages[0];            // 67 — counting starts at 0
            ages.push(73);      // add to the end
            \`\`\`

            A dataset is an array of objects — rows and columns, the same shape as a spreadsheet.

            ## Going through them

            \`\`\`js
            for (const p of PATIENTS) {
              if (p.diabetes) console.log(p.id);
            }
            \`\`\`

            And the three methods you'll use constantly:

            \`\`\`js
            const older = PATIENTS.filter((p) => p.age >= 75);     // keep some
            const sbps = PATIENTS.map((p) => p.sbp);                // transform each
            const total = sbps.reduce((sum, x) => sum + x, 0);      // combine into one
            \`\`\`

            \`(p) => p.age >= 75\` is an *arrow function* — a small function written inline. Read it as "given p, give back whether p.age is at least 75".

            ## Counting with an object

            \`\`\`js
            const counts = {};
            for (const p of PATIENTS) {
              counts[p.sex] = (counts[p.sex] || 0) + 1;
            }
            // { F: 7, M: 5 }
            \`\`\`

            Object keys are always strings — count by \`diabetes\` and you get keys \`"true"\` and \`"false"\`.

            ## The sorting trap

            \`\`\`js
            [10, 9, 100].sort();                 // [10, 100, 9] — sorted as TEXT
            [10, 9, 100].sort((a, b) => a - b);  // [9, 10, 100]
            \`\`\`

            Without a comparison function, \`sort\` compares as text. It also sorts the array *in place*, changing the original. Copy first — \`[...list]\` — when the original matters, as it does when it's your raw data.

            In these exercises a list called \`PATIENTS\` (twelve fictional people) already exists. Print it to have a look.
          ` },
          { type: "try", lang: "js", prelude: PATIENTS_JS, code: `console.log(PATIENTS.length, "patients");\nconsole.log(PATIENTS[0]);\nconsole.log(PATIENTS.filter((p) => p.age >= 80).map((p) => p.id));\n` },
          {
            type: "code", id: "avg-age", lang: "js", title: "Average age", prelude: PATIENTS_JS,
            prompt: "Write `averageAge(patients)`. If the list is empty, return `null` — the average age of nobody isn't 0, and pretending it is would quietly drag a pooled mean down.",
            starter: `function averageAge(patients) {

}

console.log(averageAge(PATIENTS));
`,
            solution: `function averageAge(patients) {
  if (patients.length === 0) return null;
  const total = patients.reduce((sum, p) => sum + p.age, 0);
  return total / patients.length;
}

console.log(averageAge(PATIENTS));
`,
            hints: ["Add the ages up — a `for…of` loop or `reduce` — then divide by `patients.length`.", "Check for the empty list first: `if (patients.length === 0) return null;`"],
            tests: [
              { name: "PATIENTS average about 69.08", code: `$near(averageAge(PATIENTS), 69.0833, 0.001);` },
              { name: "A list of two", code: `$near(averageAge([{ age: 50 }, { age: 70 }]), 60, 1e-9);` },
              { name: "An empty list gives null", code: `$eq(averageAge([]), null);` },
            ],
          },
          {
            type: "code", id: "count-by", lang: "js", title: "Count by any column", prelude: PATIENTS_JS,
            prompt: "Write `countBy(rows, key)` returning an object of counts — `countBy(PATIENTS, \"sex\")` gives `{ F: 7, M: 5 }`. It should work for any column.",
            starter: `function countBy(rows, key) {
  const counts = {};

  return counts;
}

console.log(countBy(PATIENTS, "sex"));
`,
            solution: `function countBy(rows, key) {
  const counts = {};
  for (const row of rows) {
    const value = row[key];
    counts[value] = (counts[value] || 0) + 1;
  }
  return counts;
}

console.log(countBy(PATIENTS, "sex"));
`,
            hints: ["Use `row[key]` — square brackets — because the column name is in a variable.", "`counts[value] = (counts[value] || 0) + 1;` starts at 0 the first time a value is seen."],
            tests: [
              { name: "By sex", code: `$eq(countBy(PATIENTS, "sex"), { F: 7, M: 5 });` },
              { name: "By diabetes (keys become strings)", code: `$eq(countBy(PATIENTS, "diabetes"), { true: 5, false: 7 });` },
              { name: "An empty list gives an empty object", code: `$eq(countBy([], "sex"), {});` },
            ],
          },
          {
            type: "code", id: "oldest", lang: "js", title: "Sort without damage", prelude: PATIENTS_JS,
            prompt: "Write `oldestFirst(patients)` returning a **new** array sorted by age, oldest first — without changing the order of the array you were given.",
            starter: `function oldestFirst(patients) {
  return patients.sort();
}
`,
            solution: `function oldestFirst(patients) {
  return [...patients].sort((a, b) => b.age - a.age);
}
`,
            hints: ["`[...patients]` makes a copy you can sort freely.", "For oldest first, the comparison is `(a, b) => b.age - a.age`."],
            tests: [
              { name: "The oldest comes first", code: `$eq(oldestFirst(PATIENTS)[0].id, "A06");` },
              { name: "The youngest comes last", code: `const s = oldestFirst(PATIENTS); $eq(s[s.length - 1].id, "A05");` },
              { name: "The original list is untouched", code: `oldestFirst(PATIENTS); $eq(PATIENTS.map((p) => p.id).join(","), "A01,A02,A03,A04,A05,A06,A07,A08,A09,A10,A11,A12");` },
            ],
            explain: "Never modify the data you were handed. In analysis code that rule has a name — raw data is read-only — and the research track returns to it.",
          },
        ],
      },

      /* ============================================================ */
      {
        id: "code-js-safety",
        title: "Units, edge cases and tests",
        minutes: 40,
        summary: "Where clinical code goes wrong — units, missing values, impossible inputs — and writing the tests that catch it.",
        keywords: "units edge cases validation testing errors throw calcium anion gap",
        objectives: [
          "Refuse impossible input loudly with \`throw\`, rather than return a plausible wrong number",
          "Convert between units with the factor written down once",
          "Write a test that tells a right implementation from wrong ones",
        ],
        blocks: [
          { md: `
            ## Fail loudly

            A function given nonsense has two choices: return *something*, or refuse. For anything near patient care, refuse:

            \`\`\`js
            function egfrCategory(egfr) {
              if (typeof egfr !== "number" || !Number.isFinite(egfr) || egfr < 0) {
                throw new Error(\`eGFR must be a non-negative number, got \${egfr}\`);
              }
              // …
            }
            \`\`\`

            A thrown error stops the program and says why. A silently wrong number travels on into a decision. \`Number.isFinite\` rejects \`NaN\` and \`Infinity\`, which is what you get from dividing by an empty field.

            ## Units

            The same calcium is \`2.5\` in mmol/L and \`10.0\` in mg/dL. A formula written for one and fed the other is wrong by a factor of four, and nothing in the arithmetic will tell you. Habits that help:

            - Put the unit in the name: \`calciumMmolL\`, \`heightCm\`.
            - Write each conversion factor once, as a named constant, with where it came from.
            - Convert at the edges — when data comes in — and work in one unit inside.

            Calcium's factor comes from its molar mass, 40.08 g/mol: 1 mmol/L is 40.08 mg/L, which is **4.008 mg/dL**.

            ## Tests

            A test is a small program that checks another one: call it with inputs where you know the answer, compare. The checks under each exercise here are exactly that. You can write them yourself, and the last exercise asks you to.

            > [!NOTE] About corrected calcium
            > The albumin-corrected calcium formula is everywhere and widely criticised — it agrees poorly with ionised calcium, which is the better test when you can get it. It's here because it's simple to code, not as a recommendation.
          ` },
          {
            type: "code", id: "ca-corr", lang: "js", title: "Corrected calcium, defensively",
            prompt: `
              Write \`correctedCalcium(caMgDl, albuminGdl)\` = calcium + 0.8 × (4 − albumin), in mg/dL and g/dL.

              It must **throw an Error** if either input isn't a finite number, or if either is zero or negative.
            `,
            starter: `function correctedCalcium(caMgDl, albuminGdl) {
  return caMgDl + 0.8 * (4 - albuminGdl);
}
`,
            solution: `function correctedCalcium(caMgDl, albuminGdl) {
  for (const [name, x] of [["calcium", caMgDl], ["albumin", albuminGdl]]) {
    if (typeof x !== "number" || !Number.isFinite(x) || x <= 0) {
      throw new Error(name + " must be a positive number, got " + x);
    }
  }
  return caMgDl + 0.8 * (4 - albuminGdl);
}
`,
            hints: ["Check each input first: `if (typeof albuminGdl !== \"number\" || !Number.isFinite(albuminGdl) || albuminGdl <= 0) throw new Error(\"…\");`", "A string like \"8\" is `typeof` \"string\" — that check catches it."],
            tests: [
              { name: "8.0 with albumin 2.0 gives 9.6", code: `$near(correctedCalcium(8.0, 2.0), 9.6, 1e-9);` },
              { name: "Normal albumin changes nothing", code: `$near(correctedCalcium(9.0, 4.0), 9.0, 1e-9);` },
              { name: "Albumin of 0 is refused", code: `await $throws(() => correctedCalcium(8, 0), "albumin 0 should throw");` },
              { name: "A string is refused", code: `await $throws(() => correctedCalcium("8", 2), "the text \\"8\\" should throw");` },
              { name: "NaN is refused", code: `await $throws(() => correctedCalcium(8, NaN), "NaN should throw");` },
            ],
          },
          {
            type: "code", id: "ca-units", lang: "js", title: "One conversion factor, written once",
            prompt: "Write `calciumMgDl(mmolL)` that converts calcium from mmol/L to mg/dL. Put the factor in a named constant above the function.",
            starter: `// 1 mmol/L of calcium is ___ mg/dL (molar mass 40.08 g/mol)

function calciumMgDl(mmolL) {

}
`,
            solution: `// 1 mmol/L of calcium is 4.008 mg/dL (molar mass 40.08 g/mol)
const CALCIUM_MGDL_PER_MMOLL = 4.008;

function calciumMgDl(mmolL) {
  return mmolL * CALCIUM_MGDL_PER_MMOLL;
}
`,
            hints: ["40.08 mg per mmol, per litre, is 40.08 mg/L; a decilitre is a tenth of a litre."],
            tests: [
              { name: "2.5 mmol/L is 10.02 mg/dL", code: `$near(calciumMgDl(2.5), 10.02, 1e-9);` },
              { name: "2.2 mmol/L is about 8.82 mg/dL", code: `$near(calciumMgDl(2.2), 8.8176, 1e-9);` },
            ],
          },
          {
            type: "code", id: "test-ag", lang: "js", title: "Write the test",
            prompt: `
              Anion gap = Na − (Cl + HCO₃), all in mmol/L. Write \`checkAnionGap(fn)\`: call \`fn(na, cl, hco3)\` on cases where you know the answer, and return \`true\` only if it gets every one right.

              The checks hand your function a correct implementation and several broken ones — one forgets bicarbonate, one adds it, one returns text, one rounds to the nearest 10. Yours must pass the right one and catch every wrong one.
            `,
            starter: `function checkAnionGap(fn) {
  // e.g. fn(140, 104, 24) should be 12
  return true;
}
`,
            solution: `function checkAnionGap(fn) {
  const cases = [
    [140, 104, 24, 12],
    [135, 100, 20, 15],
    [145, 98, 10, 37],
  ];
  return cases.every(([na, cl, hco3, expected]) => fn(na, cl, hco3) === expected);
}
`,
            hints: ["Make a few cases with known answers: `[140, 104, 24, 12]` means Na 140, Cl 104, HCO₃ 24 → 12.", "`===` also catches the version that returns text: `\"12\" === 12` is false.", "One case can be passed by luck — the rounding bug gets 140/104/24 \"right\" only if the true answer is a multiple of 10. Use several."],
            tests: [
              { name: "Passes a correct implementation", code: `$check(checkAnionGap((na, cl, hco3) => na - (cl + hco3)) === true, "a correct anion gap should pass");` },
              { name: "…and one written differently but still correct", code: `$check(checkAnionGap((na, cl, hco3) => na - cl - hco3) === true, "na - cl - hco3 is also correct");` },
              { name: "Catches the forgotten bicarbonate", code: `$check(checkAnionGap((na, cl) => na - cl) === false, "na - cl should fail");` },
              { name: "Catches the sign error", code: `$check(checkAnionGap((na, cl, hco3) => na - cl + hco3) === false, "na - cl + hco3 should fail");` },
              { name: "Catches text instead of a number", code: `$check(checkAnionGap((na, cl, hco3) => String(na - (cl + hco3))) === false, "returning a string should fail");` },
              { name: "Catches rounding to the nearest 10", code: `$check(checkAnionGap((na, cl, hco3) => Math.round((na - (cl + hco3)) / 10) * 10) === false, "rounding should fail");` },
            ],
            explain: "That's how you check AI-written code too: decide what right looks like *before* you read its version, and test against cases you worked out yourself.",
          },
        ],
      },

      /* ============================================================ */
      {
        id: "code-regex",
        title: "Text and patterns: scrubbing identifiers",
        minutes: 40,
        project: "research",
        summary: "Strings and regular expressions — by writing a scrubber for the identifiers that turn up in clinical text.",
        keywords: "regex regular expressions strings redact phi identifiers",
        objectives: [
          "Search and replace text with regular expressions",
          "Use character classes, quantifiers, groups and the \`g\` and \`i\` flags",
          "Explain why a scrubber is a safety net and not de-identification",
        ],
        blocks: [
          { md: `
            ## Regular expressions

            A regular expression (regex) describes a *shape* of text. \`/\\d{4}-\\d{2}-\\d{2}/\` matches anything shaped like 2024-11-03.

            | Piece | Matches |
            |---|---|
            | \`\\d\` | a digit |
            | \`\\w\` | a letter, digit or underscore |
            | \`\\s\` | whitespace |
            | \`[6-9]\` | one of 6, 7, 8, 9 |
            | \`[/.-]\` | a slash, dot or hyphen |
            | \`x?\` | x, optionally |
            | \`x+\` / \`x*\` | one or more / zero or more |
            | \`x{4}\` / \`x{1,2}\` | exactly four / one or two |
            | \`(a\\|b)\` | a or b |
            | \`\\b\` | a word boundary — the edge of a word |
            | \`.\` | any character (so a literal dot is \`\\.\`) |

            Flags go after the closing slash: \`g\` finds *every* match rather than the first, \`i\` ignores case.

            \`\`\`js
            "Seen 03/11/2024 and 05/11/2024".replace(/\\d{2}\\/\\d{2}\\/\\d{4}/g, "[DATE]");
            // "Seen [DATE] and [DATE]"
            \`\`\`

            The \`\\b\` boundaries earn their keep: without them, a phone-number pattern happily matches the middle of a longer number.

            ## Why this lesson uses identifiers

            Text you might paste into a prompt, an email or a spreadsheet often carries identifiers you didn't mean to share. A scrubber that catches the structured ones — emails, dates, record numbers, phone numbers — is a useful **last line of defence**. It is not de-identification, and the agentic-AI track explains why at length. The short version: no pattern can find a name with no title in front of it, or "the only 102-year-old on the ward".
          ` },
          {
            type: "code", id: "redact", lang: "js", title: "Write a scrubber",
            prompt: `
              Write \`redact(text)\` that replaces:

              - **email addresses** with \`[EMAIL]\`
              - **record numbers** — \`MRN\` or \`UHID\`, an optional colon, then digits, slashes or hyphens — with \`[ID]\` (the label goes too)
              - **dates** written \`DD/MM/YYYY\` (with \`/\`, \`.\` or \`-\`) or \`YYYY-MM-DD\` with \`[DATE]\`
              - **Indian mobile numbers** — ten digits starting 6–9, optionally \`+91\` in front and a space after the fifth digit — with \`[PHONE]\`

              …and leaves clinical numbers like \`Na 140\` or \`BP 140/90\` alone. The text is fictional.
            `,
            starter: `function redact(text) {
  return text
    .replace(/[\\w.+-]+@[\\w-]+(\\.[\\w-]+)+/g, "[EMAIL]");   // emails are done — add the rest
}

console.log(redact("Seen 03/11/2024, MRN: 00123456, call 98765 43210 or a.k@example.com"));
`,
            solution: `function redact(text) {
  return text
    .replace(/[\\w.+-]+@[\\w-]+(\\.[\\w-]+)+/g, "[EMAIL]")
    .replace(/\\b(MRN|UHID):?\\s*[\\d/-]+/g, "[ID]")
    .replace(/\\b\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{4}\\b|\\b\\d{4}-\\d{2}-\\d{2}\\b/g, "[DATE]")
    .replace(/(\\+91[\\s-]?)?\\b[6-9]\\d{4}\\s?\\d{5}\\b/g, "[PHONE]");
}

console.log(redact("Seen 03/11/2024, MRN: 00123456, call 98765 43210 or a.k@example.com"));
`,
            hints: [
              "Record numbers first, before the date and phone patterns get a chance at their digits: `/\\b(MRN|UHID):?\\s*[\\d/-]+/g`.",
              "Two date shapes, joined with `|`: `\\b\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{4}\\b` and `\\b\\d{4}-\\d{2}-\\d{2}\\b`.",
              "The phone: an optional `(\\+91[\\s-]?)?`, then `\\b[6-9]\\d{4}\\s?\\d{5}\\b`.",
            ],
            tests: [
              { name: "Emails", code: `$eq(redact("Contact a.k@example.com today"), "Contact [EMAIL] today");` },
              { name: "Both date styles", code: `$eq(redact("Admitted 03/11/2024, seen 2024-11-05."), "Admitted [DATE], seen [DATE].");` },
              { name: "Record numbers, label and all", code: `$eq(redact("MRN: 00123456 and UHID 2024/118734"), "[ID] and [ID]");` },
              { name: "Mobile numbers, with and without +91", code: `$eq(redact("Call 9876543210 or +91 98765 43210."), "Call [PHONE] or [PHONE].");` },
              { name: "Leaves clinical numbers alone", code: `const t = "Na 140, K 4.2, Hb 9.8 g/dL, BP 140/90"; $eq(redact(t), t);` },
              { name: "Several on one line", code: `$eq(redact("x@y.org 01/02/2023 MRN 77 9876543210"), "[EMAIL] [DATE] [ID] [PHONE]");` },
            ],
            explain: "Order matters in a chain of replacements: each step sees the output of the last. Claim the most specific shapes (record numbers) before the general ones (any date, any long number) get a chance to take them apart.",
          },
          {
            type: "quiz", id: "q-scrub",
            question: "Your scrubber passes every check. Is text that has been through it safe to paste into an AI tool your hospital hasn't approved?",
            options: [
              "Yes — the identifiers have been removed",
              "No — it can't catch names without titles, rare conditions, or combinations that point to one person",
              "Yes, as long as the text is short",
            ],
            answer: 1,
            explain: "\"The 34-year-old interpreter admitted on Christmas Day with Takayasu arteritis\" contains no email, date pattern or number, and identifies someone. Scrubbers lower risk; approved tools and proper de-identification are what make it acceptable.",
          },
        ],
      },

      /* ============================================================ */
      {
        id: "code-dom",
        title: "Make the page do something",
        minutes: 45,
        project: "website",
        summary: "The DOM, events and forms — a working calculator for your site, built safely.",
        keywords: "dom events click input textContent innerHTML xss form",
        objectives: [
          "Find elements on the page and change what they say",
          "Respond to clicks and typing with event listeners",
          "Explain why \`textContent\` is safe and \`innerHTML\` with user input isn't",
        ],
        blocks: [
          { md: `
            ## The DOM

            When a browser reads your HTML it builds a tree of objects — the Document Object Model. JavaScript can find any element in it and change it:

            \`\`\`js
            const out = document.getElementById("result");     // by id
            const firstCard = document.querySelector(".card");  // by any CSS selector
            out.textContent = "BMI 22.9";                       // change the text
            \`\`\`

            ## Events

            Pages react to things people do. You attach a function — a *listener* — to an element for a kind of event:

            \`\`\`js
            document.getElementById("calc").addEventListener("click", () => {
              const kg = parseFloat(document.getElementById("weight").value);
              // …
            });
            \`\`\`

            \`.value\` of an input is always **text**, even for \`type="number"\`. \`parseFloat\` turns it into a number — or \`NaN\` if the box is empty, which is why a calculator must check before it calculates.

            ## Forms

            A \`<form>\` with a submit button *reloads the page* when submitted, unless you stop it — \`event.preventDefault()\` in a \`submit\` listener. For a calculator, a plain \`<button type="button">\` with a click listener is simpler, and that's what the exercise uses.

            Every input needs a \`<label for="its-id">\`. Clicking the label focuses the input, and a screen reader announces it — a box with no label is a box with no name.

            ## textContent, not innerHTML

            \`innerHTML\` parses what you give it as HTML. Give it anything a person typed, or anything from the internet, and they can put a script on your page — the attack called cross-site scripting (XSS). \`textContent\` puts text in as text, always.

            > [!SAFETY] The rule
            > Anything that didn't come from you — a form field, a URL, an API response, a model's answer — goes in with \`textContent\`. Every page in this repository builds its elements that way, for this reason.
          ` },
          {
            type: "code", id: "bmi-calc", lang: "html", title: "A calculator for your site",
            prompt: `
              Finish the calculator:

              1. a \`<label>\` for each input — "Weight (kg)" and "Height (cm)"
              2. clicking **Calculate** shows \`BMI 22.9 — normal\` in \`#result\` for 70 kg and 175 cm (one decimal place; height arrives in centimetres)
              3. an empty or non-positive box shows a message instead of \`NaN\`

              The checks type into your boxes and press the button.
            `,
            starter: DOM_STARTER,
            solution: DOM_SOLUTION,
            hints: [
              "`<label for=\"weight\">Weight (kg)</label>` just before the weight input.",
              "Read with `parseFloat(document.getElementById(\"weight\").value)`, convert cm to m by dividing by 100, and show with `out.textContent = \"BMI \" + b.toFixed(1) + \" — \" + category(b);`",
              "`if (!(kg > 0) || !(cm > 0))` is true for an empty box (NaN), zero and negatives alike.",
            ],
            tests: [
              { name: "Each input has a label", code: `["weight", "height"].forEach((id) => $check($q('label[for="' + id + '"]'), 'add <label for="' + id + '">'));` },
              { name: "70 kg and 175 cm give 22.9", code: `$type("#weight", "70"); $type("#height", "175"); $click("#calc"); await $sleep(60); $check(/22\\.9/.test($text("#result")), 'for 70 kg and 175 cm, #result should show 22.9 — it shows "' + $text("#result") + '"');` },
              { name: "…and name the category", code: `$type("#weight", "70"); $type("#height", "175"); $click("#calc"); await $sleep(60); $check(/normal/i.test($text("#result")), 'add the category — "normal" for 22.9');` },
              { name: "Other values work too", code: `$type("#weight", "95"); $type("#height", "180"); $click("#calc"); await $sleep(60); $check(/29\\.3/.test($text("#result")) && /overweight/i.test($text("#result")), '95 kg, 180 cm should show 29.3 — overweight; it shows "' + $text("#result") + '"');` },
              { name: "An empty box gets a message, not NaN", code: `$type("#weight", ""); $type("#height", "175"); $click("#calc"); await $sleep(60); const t = $text("#result"); $check(t.length > 0 && !/NaN|Infinity|undefined/.test(t), 'with a box empty, show a message — it shows "' + t + '"');` },
            ],
            explain: "That's a feature you could put on your site: copy the label, input, button and output elements, and the script, into your page.",
          },
        ],
      },

      /* ============================================================ */
      {
        id: "code-json",
        title: "Data in and out: JSON and CSV",
        minutes: 40,
        project: "research",
        summary: "The two text formats data travels in, and the traps in each — including what Excel does to them.",
        keywords: "json csv parse excel fetch async data formats",
        objectives: [
          "Convert between objects and JSON text",
          "Parse CSV properly — quoted commas, doubled quotes, Windows line endings",
          "Name the ways spreadsheets quietly corrupt research data",
        ],
        blocks: [
          { md: `
            ## JSON

            JSON is JavaScript's object and array notation, used as a text format almost everywhere — APIs, settings files, this course's export file.

            \`\`\`js
            const text = JSON.stringify({ id: "A01", age: 67 });   // '{"id":"A01","age":67}'
            const back = JSON.parse(text);                          // an object again
            \`\`\`

            Your repository runs on it: \`agents/data/agents.json\` defines the agents, \`goals.json\` your goals.

            ## CSV

            Comma-separated values: a header line, then one line per row. Simple until it isn't:

            \`\`\`
            id,diagnosis,note
            1,"Fracture, neck of femur","said ""no"" twice"
            \`\`\`

            - A field containing a comma is wrapped in double quotes.
            - A double quote inside a quoted field is written twice.
            - Windows ends lines with \`\\r\\n\`, others with \`\\n\`.
            - A field can be empty: \`1,,3\`.

            So \`line.split(",")\` — the first thing anyone writes — breaks on real files. The exercise is the parser that doesn't.

            ## What spreadsheets do to data

            > [!WARNING] Before a dataset goes anywhere near Excel
            > - **Gene names become dates.** SEPT2 and MARCH1 were converted to dates in so many published supplementary files that the HUGO committee renamed the genes.
            > - **Leading zeros vanish.** A record number 00123 becomes 123 — and no longer matches anything.
            > - **Long numbers lose digits.** Anything over 15 digits is rounded.
            > - **Dates guess their format.** 03/11/2024 is March or November depending on the computer.
            >
            > Keep raw data as CSV, read it with code, and never save over the original.

            ## Getting data from elsewhere: fetch

            Pages load data with \`fetch\`, which takes time, so it's *asynchronous* — you \`await\` the answer:

            \`\`\`js
            async function loadPublications() {
              const res = await fetch("publications.json");
              if (!res.ok) throw new Error("couldn't load publications: HTTP " + res.status);
              return res.json();
            }
            \`\`\`

            The agentic-AI track uses exactly this to call PubMed and Claude.
          ` },
          {
            type: "code", id: "csv", lang: "js", title: "A CSV parser that survives real files",
            prompt: `
              The starter is the naive split-on-commas parser. Rewrite \`parseCSV(text)\` so it returns an array of objects keyed by the header, and handles: quoted fields containing commas, doubled quotes inside quotes, \`\\r\\n\` line endings, empty fields, and a trailing newline.

              Go character by character, remembering whether you're inside quotes.
            `,
            starter: `function parseCSV(text) {
  const lines = text.trim().split("\\n");
  const head = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    const row = {};
    head.forEach((h, i) => { row[h] = cells[i]; });
    return row;
  });
}
`,
            solution: `function parseCSV(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(cell); cell = "";
    } else if (ch === "\\n" || ch === "\\r") {
      if (ch === "\\r" && text[i + 1] === "\\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.length > 1 || r[0] !== "");
  return body.map((r) => {
    const obj = {};
    head.forEach((h, i) => { obj[h] = r[i] === undefined ? "" : r[i]; });
    return obj;
  });
}
`,
            hints: [
              "Keep three things as you walk the text: the current `cell`, the current `row` (an array), and a `quoted` flag.",
              "Inside quotes, a `\"` followed by another `\"` is a literal quote; a lone `\"` ends the quoted part. Outside quotes, `,` ends a cell and a newline ends a row.",
              "Treat `\\r` followed by `\\n` as one line ending: when you see `\\r`, skip the next character if it's `\\n`.",
            ],
            tests: [
              { name: "A simple file", code: `$eq(parseCSV("id,age\\nA,70\\nB,65"), [{ id: "A", age: "70" }, { id: "B", age: "65" }]);` },
              { name: "A quoted comma stays in its field", code: `$eq(parseCSV('id,diagnosis\\n1,"Fracture, neck of femur"'), [{ id: "1", diagnosis: "Fracture, neck of femur" }]);` },
              { name: "Doubled quotes become one", code: `$eq(parseCSV('id,note\\n1,"said ""no"" twice"'), [{ id: "1", note: 'said "no" twice' }]);` },
              { name: "Windows line endings", code: `$eq(parseCSV("id,age\\r\\nA,70\\r\\n"), [{ id: "A", age: "70" }]);` },
              { name: "Empty fields", code: `$eq(parseCSV("a,b,c\\n1,,3"), [{ a: "1", b: "", c: "3" }]);` },
            ],
            explain: "You've written a small state machine — the same technique real parsers use. In practice you'd reach for a library (Papa Parse in JavaScript, \`csv\` or pandas in Python); now you know what it's doing, and what to test it with.",
          },
        ],
      },

      /* ============================================================ */
      {
        id: "code-python-1",
        title: "Python, side by side",
        minutes: 40,
        project: "research",
        summary: "The language research runs on — learned by comparison with the JavaScript you now know.",
        keywords: "python syntax functions lists dicts pyodide",
        objectives: [
          "Read and write Python functions, lists and dictionaries",
          "Translate a JavaScript function into Python",
          "Know what pandas, statsmodels, lifelines and R are for",
        ],
        blocks: [
          { md: `
            ## Why Python as well

            JavaScript runs your website. For analysing data, research mostly uses **Python** or **R**: they have the libraries — pandas for tables, statsmodels for regression, lifelines for survival analysis in Python; the tidyverse and survival packages in R — and the tutorials, and the colleagues who'll review your code. When you ask Claude to write analysis code, it will usually be one of the two.

            The Python here runs in your browser through Pyodide, a full Python compiled for the web. The first run downloads it (around 12 MB, then cached), so give it a few seconds.

            ## Side by side

            | | JavaScript | Python |
            |---|---|---|
            | A variable | \`const age = 67;\` | \`age = 67\` |
            | Text with a value | \`"BMI " + b\` | \`f"BMI {b}"\` |
            | A list | \`[67, 54, 81]\` | \`[67, 54, 81]\` |
            | A record | \`{ id: "A01", age: 67 }\` | \`{"id": "A01", "age": 67}\` |
            | A field | \`p.age\` | \`p["age"]\` |
            | Nothing | \`null\` / \`undefined\` | \`None\` |
            | True / false | \`true\` / \`false\` | \`True\` / \`False\` |
            | And, or, not | \`&&\`, \`\\|\\|\`, \`!\` | \`and\`, \`or\`, \`not\` |
            | Length | \`list.length\` | \`len(list)\` |
            | Print | \`console.log(x)\` | \`print(x)\` |

            The big difference: Python uses **indentation** instead of braces. The indented lines after a \`:\` *are* the block:

            \`\`\`python
            def bmi(weight_kg, height_m):
                return weight_kg / height_m ** 2

            for p in PATIENTS:
                if p["age"] >= 80:
                    print(p["id"])
            \`\`\`

            Mixing tabs and spaces, or indenting by different amounts, is a syntax error. The editor indents four spaces for you after a colon.

            Python names use snake_case (\`weight_kg\`), and a list comprehension builds a list in one line: \`[p["age"] for p in PATIENTS]\`.
          ` },
          { type: "try", lang: "python", prelude: PATIENTS_PY, code: `print(len(PATIENTS), "patients")\nages = [p["age"] for p in PATIENTS]\nprint("oldest:", max(ages))\nprint([p["id"] for p in PATIENTS if p["diabetes"]])\n` },
          {
            type: "code", id: "py-basics", lang: "python", title: "Your first Python functions", prelude: PATIENTS_PY,
            prompt: `
              \`PATIENTS\` exists here too, as a list of dictionaries. Write:

              - \`bmi(weight_kg, height_m)\`
              - \`mean_age(patients)\` — returning \`None\` for an empty list
              - \`count_by(patients, key)\` — returning a dictionary of counts, like \`{"F": 7, "M": 5}\`
            `,
            starter: `def bmi(weight_kg, height_m):
    pass


def mean_age(patients):
    pass


def count_by(patients, key):
    counts = {}
    return counts


print(mean_age(PATIENTS))
`,
            solution: `def bmi(weight_kg, height_m):
    return weight_kg / height_m ** 2


def mean_age(patients):
    if not patients:
        return None
    return sum(p["age"] for p in patients) / len(patients)


def count_by(patients, key):
    counts = {}
    for p in patients:
        value = p[key]
        counts[value] = counts.get(value, 0) + 1
    return counts


print(mean_age(PATIENTS))
`,
            hints: [
              "`pass` means \"do nothing\" — replace it with a `return`.",
              "`if not patients:` is true for an empty list. `sum(p[\"age\"] for p in patients)` adds the ages.",
              "`counts.get(value, 0)` gives the count so far, or 0 the first time.",
            ],
            tests: [
              { name: "bmi(70, 1.75) is about 22.86", code: `_near(bmi(70, 1.75), 22.857, 0.01, "bmi(70, 1.75)")` },
              { name: "mean_age(PATIENTS) is about 69.08", code: `_near(mean_age(PATIENTS), 69.0833, 0.001, "mean_age")` },
              { name: "mean_age([]) is None", code: `_eq(mean_age([]), None, "mean_age([])")` },
              { name: "count_by(PATIENTS, \"sex\")", code: `_eq(count_by(PATIENTS, "sex"), {"F": 7, "M": 5})` },
            ],
          },
        ],
      },

      /* ============================================================ */
      {
        id: "code-python-2",
        title: "Python for data: csv and statistics",
        minutes: 45,
        project: "research",
        summary: "Reading a dataset and summarising it with Python's standard library — and what the same looks like in pandas.",
        keywords: "python csv statistics pandas mean median stdev cohort",
        objectives: [
          "Summarise a column with Python's \`statistics\` module",
          "Filter a cohort and calculate a proportion",
          "Recognise the pandas version of what you've written by hand",
        ],
        blocks: [
          { md: `
            ## The cohort

            From here on the research exercises use **MOVE-EARLY**, a simulated cohort of 600 adults admitted to medical wards. Nobody in it exists. Each row is a dictionary:

            | Field | Meaning |
            |---|---|
            | \`id\` | P001 … P600 |
            | \`age\` | years |
            | \`sex\` | "F" or "M" |
            | \`cfs\` | Clinical Frailty Scale, 1–8 |
            | \`diabetes\` | 1 or 0 |
            | \`emp\` | 1 if they got the early mobility programme, 0 for usual care |
            | \`los\` | length of stay, days |
            | \`readmit30\` | 1 if readmitted within 30 days |
            | \`time\`, \`event\` | days to death or readmission (\`event\` 1), or to the end of follow-up (\`event\` 0) |

            In Python it's a list called \`COHORT\`.

            ## The standard library

            Python ships with \`statistics\`:

            \`\`\`python
            import statistics

            ages = [r["age"] for r in COHORT]
            statistics.mean(ages)
            statistics.stdev(ages)    # sample SD — divides by n − 1, as papers do
            statistics.median(ages)
            \`\`\`

            ## What pandas looks like

            On your own machine you'd load the same data into a pandas *DataFrame* — a table with named columns — and the exercise below collapses to a line or two:

            \`\`\`python
            import pandas as pd

            df = pd.read_csv("move-early.csv")
            df.groupby("emp")["readmit30"].mean()   # readmission rate in each group
            df["age"].describe()                    # count, mean, std, min, quartiles, max
            \`\`\`

            Writing it by hand first means you'll know what \`groupby\` is doing — and be able to check it when the answer looks too good.
          ` },
          {
            type: "code", id: "py-cohort", lang: "python", title: "Summarise the cohort", uses: ["cohort"],
            prompt: `
              Using \`COHORT\`, write:

              - \`readmission_rate(rows, emp)\` — the proportion of rows with that \`emp\` value (1 or 0) who have \`readmit30 == 1\`
              - \`age_summary(rows)\` — a dictionary with \`"mean"\`, \`"sd"\` and \`"median"\` of age, from the \`statistics\` module
            `,
            starter: `import statistics


def readmission_rate(rows, emp):
    pass


def age_summary(rows):
    pass


print(readmission_rate(COHORT, 1), readmission_rate(COHORT, 0))
`,
            solution: `import statistics


def readmission_rate(rows, emp):
    group = [r for r in rows if r["emp"] == emp]
    return sum(r["readmit30"] for r in group) / len(group)


def age_summary(rows):
    ages = [r["age"] for r in rows]
    return {
        "mean": statistics.mean(ages),
        "sd": statistics.stdev(ages),
        "median": statistics.median(ages),
    }


print(readmission_rate(COHORT, 1), readmission_rate(COHORT, 0))
`,
            hints: [
              "`[r for r in rows if r[\"emp\"] == emp]` keeps one group. `readmit30` is 1 or 0, so summing it counts the readmissions.",
              "`statistics.stdev` is the sample standard deviation — the one you want.",
            ],
            tests: [
              { name: "Readmission with the programme", code: `_near(readmission_rate(COHORT, 1), ${rate(1)}, 1e-9, "emp = 1")` },
              { name: "Readmission with usual care", code: `_near(readmission_rate(COHORT, 0), ${rate(0)}, 1e-9, "emp = 0")` },
              { name: "Age: mean, SD and median", code: `s = age_summary(COHORT)\n_near(s["mean"], ${S.mean(AGES)}, 1e-9, "mean")\n_near(s["sd"], ${S.sd(AGES)}, 1e-9, "sd")\n_near(s["median"], ${S.median(AGES)}, 1e-9, "median")` },
            ],
            explain: `Readmission was ${(rate(1) * 100).toFixed(1)}% with the programme and ${(rate(0) * 100).toFixed(1)}% without. Before you believe that difference, the research track has a question for you: who got the programme?`,
          },
        ],
      },

      /* ============================================================ */
      {
        id: "code-site",
        title: "Capstone: assemble your website",
        minutes: 60,
        project: "website",
        summary: "One file, everything you've learned, your details — downloaded and ready to publish.",
        keywords: "website capstone portfolio academic site publications contact",
        objectives: [
          "Produce a complete, accessible, responsive personal website",
          "Decide what belongs on a doctor's website — and what never does",
          "Download it, ready for the deployment track",
        ],
        blocks: [
          { md: `
            ## What goes on it

            A good academic or clinical-academic site answers four questions fast: **who are you, what do you work on, what have you published, how do I reach you.** Everything else is optional.

            - **About.** Training stage, specialty, where you work (if you're comfortable saying), what you're interested in. Two or three sentences.
            - **Research.** Your question in words a patient could follow, then a sentence for specialists.
            - **Publications.** Title, authors, journal, year — each linked to its DOI (https://doi.org/…) or PubMed page. Link your ORCID and Google Scholar profiles too; they keep themselves up to date.
            - **Contact.** A professional email. (Hiding addresses from spam-harvesting bots doesn't really work any more; a good spam filter does.)

            ## What never goes on it

            > [!SAFETY] A public page is public forever
            > - **No patient stories, images or case details**, however anonymised they seem. Patients recognise themselves; so do their families and neighbours. Published cases need written consent, through a journal's process.
            > - **No individual medical advice.** Say so in the footer.
            > - **No home address, personal phone number or rota.**
            > - **Your regulator's rules on doctors' websites apply** — they cover advertising, claims and testimonials. Read your medical council's current code before you add anything that promotes a practice.

            ## The exercise

            The template below is a complete, styled, responsive site — with \`TODO\`s where your details go. Replace them all, add or remove sections as you like, and run it. When the checks pass, **download index.html**: the deployment track publishes it.

            Your draft is saved in this browser as you type, so you can come back to it.
          ` },
          {
            type: "code", id: "site", lang: "html", title: "Your website", download: "index.html",
            prompt: "Replace every `TODO`, `Your Name` and placeholder link with your own details. Two publications at least — if you don't have papers yet, link posters, abstracts or theses, or make the section \"Work in progress\" with two things you're working on (then adjust the publication check by linking to a DOI or PubMed when you have them).",
            starter: SITE_STARTER,
            solution: SITE_SOLUTION,
            timeoutMs: 8000,
            hints: [
              "Use the preview's Phone button: every section should read cleanly at that width.",
              "Each publication link should go to `https://doi.org/` followed by the paper's DOI, or to its `pubmed.ncbi.nlm.nih.gov` page.",
              "The description `<meta>` is what search engines show under your title — one plain sentence.",
            ],
            tests: [
              { name: "Language, title, description and viewport", code: `$check(document.documentElement.lang, "set lang on <html>"); $check(document.title.trim() && !/your name/i.test(document.title), "put your name in the <title>"); const d = $q('meta[name="description"]'); $check(d && d.content.trim().length >= 40 && !/TODO/.test(d.content), "write a one-sentence description in the description <meta>"); $check($q('meta[name="viewport"]'), "keep the viewport <meta>");` },
              { name: "One h1, and the landmarks", code: `$eq($qa("h1").length, 1, "number of <h1>s"); ["header", "nav", "main", "footer"].forEach((t) => $check($q(t), "keep a <" + t + ">"));` },
              { name: "About, research, publications and contact sections", code: `["about", "research", "publications", "contact"].forEach((id) => { const s = document.getElementById(id); $check(s && s.tagName === "SECTION", 'keep a <section id="' + id + '">'); });` },
              { name: "The menu reaches every section", code: `["about", "research", "publications", "contact"].forEach((id) => $check($q('nav a[href="#' + id + '"]'), "add a nav link to #" + id));` },
              { name: "At least two publications, each linked", code: `const items = $qa("#publications li"); $check(items.length >= 2, "list at least two publications"); items.forEach((li) => $check(li.querySelector("a[href*='doi.org'], a[href*='pubmed.ncbi.nlm.nih.gov']"), "link each publication to its DOI or PubMed page"));` },
              { name: "Images have alt text; links have words", code: `$qa("img").forEach((i) => $check(i.hasAttribute("alt"), "an <img> has no alt")); $qa("a").forEach((a) => $check($text(a) || a.getAttribute("aria-label"), "a link has no text"));` },
              { name: "A way to contact you", code: `$check($q("#contact a[href^='mailto:'], #contact a[href^='http']"), "put an email link (or a contact link) in #contact");` },
              { name: "Responsive and themeable", code: `$check($rules().some((r) => r.media), "keep at least one @media rule"); $check($rules().some((r) => r.selectorText === ":root" && Array.from(r.style).some((p) => p.startsWith("--"))), "keep your colour variables on :root");` },
              { name: "Nothing left from the template", code: `const page = document.body.cloneNode(true); page.querySelectorAll("script, style").forEach((n) => n.remove()); const t = page.textContent + " " + $qa("a").map((a) => a.getAttribute("href")).join(" "); const left = (t.match(/TODO|Your Name|xxxx|you@example\\.org|Lorem/gi) || []); $check(left.length === 0, "still in the page: " + Array.from(new Set(left)).join(", "));` },
            ],
            explain: "Download it with the button above the checks. That file is your website; the deployment track takes it from your Downloads folder to the internet.",
          },
        ],
      },
    ],
  });
})(window.CC);
