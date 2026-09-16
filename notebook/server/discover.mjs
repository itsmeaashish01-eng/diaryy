/* ================================================
   MARGINALIA — server/discover.mjs
   Going and getting the paper.

   The notebook can only answer from what is in it, so the most useful
   thing it can do when it doesn't know something is say where to look
   — and then fetch it. Four open catalogues, none of which needs a key
   or an account:

     arXiv        preprints, with the PDF right there
     Crossref     the DOI registry: almost everything published
     OpenAlex     the same works, plus which of them are free to read
     PubMed       medicine and biology, with PMC's open archive

   Two ways in. `search()` is a question typed by a person. `references()`
   reads the bibliography out of a paper already in the notebook, looks
   each entry up, and hands back the ones that can be fetched — which
   turns "this cites something interesting" into a source in two clicks.

   Nothing here runs on its own. Every call is something the person
   pressed, because a study tool that quietly phones out is not a local
   study tool. The one courtesy paid is a contact address in the user
   agent when MARGINALIA_CONTACT is set: Crossref and OpenAlex give
   politely-identified callers a faster pool, and it costs nothing.
   ================================================ */

const CONTACT = process.env.MARGINALIA_CONTACT || "";
const AGENT = `Marginalia/1 (local research notebook${CONTACT ? `; mailto:${CONTACT}` : ""})`;

/* Overridable so the self-test can point them at a stub, and so anyone
   behind a mirror or a proxy can redirect them. */
const HOSTS = {
  arxiv: process.env.MARGINALIA_ARXIV || "http://export.arxiv.org",
  crossref: process.env.MARGINALIA_CROSSREF || "https://api.crossref.org",
  openalex: process.env.MARGINALIA_OPENALEX || "https://api.openalex.org",
  pubmed: process.env.MARGINALIA_PUBMED || "https://eutils.ncbi.nlm.nih.gov",
};

export const PROVIDERS = [
  { id: "arxiv", label: "arXiv", note: "preprints, full text always free" },
  { id: "crossref", label: "Crossref", note: "the DOI registry — almost everything published" },
  { id: "openalex", label: "OpenAlex", note: "wide coverage, and says what is free to read" },
  { id: "pubmed", label: "PubMed", note: "medicine and biology" },
];

const TIMEOUT = 20000;

async function getJSON(url, signal) {
  const res = await fetchWithTimeout(url, signal, { accept: "application/json" });
  return res.json();
}

async function getText(url, signal) {
  const res = await fetchWithTimeout(url, signal, { accept: "application/xml,text/xml,*/*" });
  return res.text();
}

async function fetchWithTimeout(url, signal, headers = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT);
  if (signal) signal.addEventListener("abort", () => ac.abort(), { once: true });
  try {
    const res = await fetch(url, { signal: ac.signal, headers: { "user-agent": AGENT, ...headers } });
    if (!res.ok) {
      const e = new Error(`${new URL(url).host} answered ${res.status}`);
      e.status = res.status === 429 ? 429 : 502;
      throw e;
    }
    return res;
  } catch (e) {
    if (e.name === "AbortError") { const t = new Error(`${new URL(url).host} did not answer in time`); t.status = 504; throw t; }
    if (e instanceof TypeError) { const t = new Error(`could not reach ${new URL(url).host} — is this machine online?`); t.status = 503; throw t; }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/* ---- the shape everything is normalised into ------------------------ */
/*
   One record per work, whatever found it. `pdfUrl` is the thing that
   matters: it is what makes a result addable rather than merely
   interesting, and it is only ever set when the catalogue says the
   file is openly available.
*/

const record = (r) => ({
  title: clean(r.title),
  authors: (r.authors || []).filter(Boolean).slice(0, 12),
  year: r.year || null,
  venue: clean(r.venue || ""),
  doi: (r.doi || "").replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").toLowerCase() || null,
  arxivId: r.arxivId || null,
  abstract: clean(r.abstract || "").slice(0, 1200),
  url: r.url || (r.doi ? `https://doi.org/${r.doi}` : null),
  pdfUrl: r.pdfUrl || null,
  openAccess: Boolean(r.pdfUrl),
  citedBy: r.citedBy ?? null,
  from: [r.from],
});

const clean = (s) =>
  String(s || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

const normaliseTitle = (t) => clean(t).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/* ---- arXiv ----------------------------------------------------------- */
/*
   Atom, not JSON. Rather than take a dependency for four fields, the
   entries are pulled out with a regex and unescaped — which is the
   right trade for a feed whose shape has not changed in fifteen years.
*/

const tag = (xml, name) => {
  const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`).exec(xml);
  return m ? clean(m[1]) : "";
};

async function searchArxiv(query, limit, signal) {
  const url = `${HOSTS.arxiv}/api/query?search_query=${encodeURIComponent(`all:${query}`)}&start=0&max_results=${limit}&sortBy=relevance`;
  const xml = await getText(url, signal);
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) || [];
  return entries.map((entry) => {
    const id = tag(entry, "id");
    const arxivId = (/(\d{4}\.\d{4,5})(v\d+)?/.exec(id) || [])[1] || null;
    const authors = [...entry.matchAll(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/g)].map((m) => clean(m[1]));
    const published = tag(entry, "published");
    return record({
      from: "arxiv",
      title: tag(entry, "title"),
      authors,
      year: published ? Number(published.slice(0, 4)) : null,
      venue: "arXiv",
      arxivId,
      doi: tag(entry, "arxiv:doi"),
      abstract: tag(entry, "summary"),
      url: id,
      pdfUrl: arxivId ? `${HOSTS.arxiv}/pdf/${arxivId}` : null,
    });
  });
}

/* ---- Crossref -------------------------------------------------------- */

async function searchCrossref(query, limit, signal) {
  const url = `${HOSTS.crossref}/works?query=${encodeURIComponent(query)}&rows=${limit}&select=DOI,title,author,issued,container-title,abstract,link,is-referenced-by-count,URL`;
  const data = await getJSON(url + (CONTACT ? `&mailto=${encodeURIComponent(CONTACT)}` : ""), signal);
  return (data.message && data.message.items ? data.message.items : []).map(fromCrossref);
}

const fromCrossref = (item) => {
  const pdfLink = (item.link || []).find((l) => /pdf/i.test(l["content-type"] || "") && /vor|am|tdm|unspecified/i.test(l["intended-application"] || "unspecified"));
  return record({
    from: "crossref",
    title: Array.isArray(item.title) ? item.title[0] : item.title,
    authors: (item.author || []).map((a) => clean(`${a.given || ""} ${a.family || ""}`)),
    year: item.issued && item.issued["date-parts"] && item.issued["date-parts"][0] ? item.issued["date-parts"][0][0] : null,
    venue: Array.isArray(item["container-title"]) ? item["container-title"][0] : item["container-title"],
    doi: item.DOI,
    abstract: item.abstract,
    url: item.URL,
    /* Crossref links are frequently behind a paywall even when they are
       listed; only trust the ones marked as text mining or similar. */
    pdfUrl: pdfLink ? pdfLink.URL : null,
    citedBy: item["is-referenced-by-count"],
  });
};

/* ---- OpenAlex -------------------------------------------------------- */
/*
   The one that actually answers "can I read this?". Its abstracts come
   as an inverted index — a map of word to positions — which has to be
   turned back into a sentence.
*/

async function searchOpenAlex(query, limit, signal) {
  const url = `${HOSTS.openalex}/works?search=${encodeURIComponent(query)}&per-page=${limit}` +
    (CONTACT ? `&mailto=${encodeURIComponent(CONTACT)}` : "");
  const data = await getJSON(url, signal);
  return (data.results || []).map(fromOpenAlex);
}

const fromOpenAlex = (w) => {
  const oa = w.open_access || {};
  const primary = w.primary_location || {};
  const best = w.best_oa_location || {};
  return record({
    from: "openalex",
    title: w.display_name || w.title,
    authors: (w.authorships || []).map((a) => clean(a.author && a.author.display_name)),
    year: w.publication_year || null,
    venue: (primary.source && primary.source.display_name) || "",
    doi: w.doi,
    abstract: uninvert(w.abstract_inverted_index),
    url: w.doi || (primary.landing_page_url || null),
    pdfUrl: best.pdf_url || primary.pdf_url || (oa.oa_url && /\.pdf($|\?)/i.test(oa.oa_url) ? oa.oa_url : null),
    citedBy: w.cited_by_count,
  });
};

function uninvert(index) {
  if (!index || typeof index !== "object") return "";
  const words = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const p of positions) words[p] = word;
  }
  return words.filter(Boolean).join(" ");
}

/* ---- PubMed ---------------------------------------------------------- */

async function searchPubMed(query, limit, signal) {
  const search = await getJSON(
    `${HOSTS.pubmed}/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&retmax=${limit}&term=${encodeURIComponent(query)}`,
    signal
  );
  const ids = (search.esearchresult && search.esearchresult.idlist) || [];
  if (!ids.length) return [];
  const summary = await getJSON(
    `${HOSTS.pubmed}/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(",")}`,
    signal
  );
  const result = summary.result || {};
  return ids.map((id) => result[id]).filter(Boolean).map((doc) => {
    const ids2 = doc.articleids || [];
    const doi = (ids2.find((a) => a.idtype === "doi") || {}).value || null;
    const pmc = (ids2.find((a) => a.idtype === "pmcid") || {}).value || null;
    return record({
      from: "pubmed",
      title: doc.title,
      authors: (doc.authors || []).map((a) => clean(a.name)),
      year: doc.pubdate ? Number(String(doc.pubdate).slice(0, 4)) : null,
      venue: doc.fulljournalname || doc.source,
      doi,
      url: doi ? `https://doi.org/${doi}` : `https://pubmed.ncbi.nlm.nih.gov/${doc.uid}/`,
      /* PMC keeps an open archive; when a paper is in it, the PDF is
         fetchable without a subscription. */
      pdfUrl: pmc ? `https://www.ncbi.nlm.nih.gov/pmc/articles/${String(pmc).replace(/^PMC/, "PMC")}/pdf/` : null,
    });
  });
}

/* ---- search ---------------------------------------------------------- */
/*
   Ask several catalogues at once, merge what comes back, and keep the
   best version of each work: the same paper from three sources becomes
   one row that knows its DOI from Crossref, its citation count from
   OpenAlex and its PDF from arXiv. A catalogue that is down or slow is
   reported beside the results rather than sinking the search.
*/

const SEARCHERS = { arxiv: searchArxiv, crossref: searchCrossref, openalex: searchOpenAlex, pubmed: searchPubMed };

export async function search(query, { providers = ["arxiv", "openalex", "crossref"], limit = 8, signal } = {}) {
  const q = String(query || "").trim();
  if (!q) { const e = new Error("search for what?"); e.status = 400; throw e; }

  const chosen = providers.filter((p) => SEARCHERS[p]);
  const settled = await Promise.allSettled(chosen.map((p) => SEARCHERS[p](q, limit, signal)));

  const merged = new Map();          // key -> record
  const byTitle = new Map();         // normalised title -> the key it landed under
  const problems = [];

  /* Matching on the DOI alone is not enough: a preprint on arXiv
     usually has no DOI and the published version does, so the two would
     stay separate and the reader would be offered the same paper twice
     — once readable, once not. Title is the second key, and it is what
     joins the free copy to the record that knows where it appeared. */
  settled.forEach((outcome, i) => {
    if (outcome.status === "rejected") {
      problems.push({ provider: chosen[i], error: outcome.reason.message });
      return;
    }
    for (const item of outcome.value) {
      if (!item.title) continue;
      const title = normaliseTitle(item.title);
      const doiKey = item.doi ? `d:${item.doi}` : null;
      const key = (doiKey && merged.has(doiKey) && doiKey) || byTitle.get(title) || doiKey || `t:${title}`;
      const existing = merged.get(key);
      merged.set(key, existing ? absorb(existing, item) : item);
      byTitle.set(title, key);
      if (doiKey) byTitle.set(doiKey, key);
    }
  });

  /* Readable first, then well cited, then recent. Someone searching
     their own notebook wants the thing they can read tonight. */
  const results = [...merged.values()].sort((a, b) =>
    Number(b.openAccess) - Number(a.openAccess) ||
    (b.citedBy || 0) - (a.citedBy || 0) ||
    (b.year || 0) - (a.year || 0)
  );

  return { query: q, results: results.slice(0, limit * 2), problems, providers: chosen };
}

/* Keep the better half of each field. "Better" is longer for text,
   present-over-absent for identifiers, and readable-over-not for the
   link, because that is the one the person is going to press. */
const absorb = (a, b) => ({
  ...a,
  title: a.title.length >= b.title.length ? a.title : b.title,
  doi: a.doi || b.doi,
  arxivId: a.arxivId || b.arxivId,
  venue: a.venue || b.venue,
  year: a.year || b.year,
  abstract: a.abstract.length >= b.abstract.length ? a.abstract : b.abstract,
  authors: a.authors.length >= b.authors.length ? a.authors : b.authors,
  pdfUrl: a.pdfUrl || b.pdfUrl,
  openAccess: Boolean(a.pdfUrl || b.pdfUrl),
  url: a.url || b.url,
  citedBy: Math.max(a.citedBy ?? 0, b.citedBy ?? 0) || (a.citedBy ?? b.citedBy ?? null),
  from: [...new Set([...a.from, ...b.from])],
});

/* Fetch the file itself. Separate from search on purpose: searching is
   metadata, fetching is a download the person asked for. */
export async function fetchPaper(result, { signal } = {}) {
  const url = result.pdfUrl || (result.arxivId ? `${HOSTS.arxiv}/pdf/${result.arxivId}` : null);
  if (!url) {
    const e = new Error("no open copy of this one — the catalogues only have the record, not the file");
    e.status = 404;
    throw e;
  }
  const res = await fetchWithTimeout(url, signal, { accept: "application/pdf,*/*" });
  const buffer = Buffer.from(await res.arrayBuffer());
  const type = res.headers.get("content-type") || "";
  if (!/pdf/i.test(type) && buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
    const e = new Error("that link gave back a web page rather than a PDF — the publisher may want a login");
    e.status = 415;
    throw e;
  }
  const stem = (result.arxivId || result.doi || result.title || "paper").replace(/[^A-Za-z0-9.-]+/g, "-").slice(0, 60);
  return { buffer, filename: `${stem}.pdf`, url };
}

/* ---- the bibliography of something already here --------------------- */
/*
   Reference lists are formatted a hundred ways, and none of them is
   machine-readable. Three things are reliably extractable: a DOI, an
   arXiv identifier, and — with less confidence — a title. Whatever is
   found is looked up, so a shaky guess is corrected by the catalogue
   or dropped for want of a match.
*/

const DOI_RE = /\b10\.\d{4,9}\/[^\s"'<>,;)\]]+/g;
const ARXIV_RE = /arXiv[:\s]*(\d{4}\.\d{4,5})(v\d+)?/gi;

export function referenceEntries(text) {
  const body = String(text || "");
  /* Take everything from the last References heading onwards — "last"
     because a paper may mention the word before it gets there. */
  const heads = [...body.matchAll(/^\s*(references|bibliography|works cited|literature cited)\s*$/gim)];
  const start = heads.length ? heads[heads.length - 1].index : -1;
  const section = start >= 0 ? body.slice(start) : body;

  /* Numbered lists ([1] or 1.) are the common case; failing that, a
     blank line between entries. */
  const numbered = section.split(/\n(?=\s*(?:\[\d{1,3}\]|\(\d{1,3}\)|\d{1,3}\.\s+[A-Z]))/);
  const pieces = numbered.length > 3 ? numbered : section.split(/\n\s*\n/);

  const entries = [];
  for (const piece of pieces) {
    const raw = clean(piece).replace(/^\[?\d{1,3}[\].)]\s*/, "");
    if (raw.length < 30 || raw.length > 600) continue;
    if (/^(references|bibliography)\b/i.test(raw)) continue;
    const doi = (raw.match(DOI_RE) || [])[0] || null;
    ARXIV_RE.lastIndex = 0;
    const arxiv = ARXIV_RE.exec(raw);
    entries.push({
      raw,
      doi: doi ? doi.replace(/[.,;]$/, "").toLowerCase() : null,
      arxivId: arxiv ? arxiv[1] : null,
      title: guessTitle(raw),
    });
  }
  return entries.slice(0, 200);
}

/* The title is usually the longest sentence-like run that isn't the
   author list and isn't the journal. Quoted titles are a gift. */
function guessTitle(entry) {
  const quoted = /[“"]([^”"]{12,200})[”"]/.exec(entry);
  if (quoted) return clean(quoted[1]);
  const withoutAuthors = entry.replace(/^(?:[A-Z][A-Za-z'’-]+,?\s+(?:[A-Z]\.\s*)+(?:,|and|&|;|\s)+\s*){1,12}/, "");
  const parts = withoutAuthors.split(/\.\s+/).map(clean).filter((p) => p.length > 12);
  const candidate = parts.find((p) => /\s/.test(p) && !/^\d/.test(p) && !/^(in|proceedings|journal|arxiv|vol)\b/i.test(p));
  return candidate ? candidate.replace(/\.$/, "").slice(0, 200) : "";
}

/* Look each entry up, best identifier first. Runs a few at a time:
   these are free services and hammering them is both rude and
   counter-productive. */
export async function resolveReferences(entries, { limit = 25, concurrency = 4, signal } = {}) {
  const queue = entries.slice(0, limit);
  const out = [];
  let at = 0;

  const worker = async () => {
    for (;;) {
      const i = at++;
      if (i >= queue.length) return;
      const entry = queue[i];
      try {
        out[i] = { ...entry, match: await resolveOne(entry, signal) };
      } catch (e) {
        out[i] = { ...entry, match: null, error: e.message };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
  return out.filter(Boolean);
}

async function resolveOne(entry, signal) {
  if (entry.arxivId) {
    const xml = await getText(`${HOSTS.arxiv}/api/query?id_list=${entry.arxivId}`, signal);
    const first = (xml.match(/<entry>[\s\S]*?<\/entry>/) || [])[0];
    if (first) {
      return record({
        from: "arxiv",
        title: tag(first, "title"),
        authors: [...first.matchAll(/<name>([\s\S]*?)<\/name>/g)].map((m) => clean(m[1])),
        year: Number(tag(first, "published").slice(0, 4)) || null,
        venue: "arXiv",
        arxivId: entry.arxivId,
        abstract: tag(first, "summary"),
        url: tag(first, "id"),
        pdfUrl: `${HOSTS.arxiv}/pdf/${entry.arxivId}`,
      });
    }
  }
  if (entry.doi) {
    const data = await getJSON(`${HOSTS.openalex}/works/https://doi.org/${entry.doi}`, signal).catch(() => null);
    if (data && (data.display_name || data.title)) return fromOpenAlex(data);
    const cr = await getJSON(`${HOSTS.crossref}/works/${encodeURIComponent(entry.doi)}`, signal).catch(() => null);
    if (cr && cr.message) return fromCrossref(cr.message);
  }
  if (entry.title && entry.title.length > 15) {
    const found = await search(entry.title, { providers: ["openalex"], limit: 3, signal }).catch(() => null);
    const best = found && found.results.find((r) => similar(r.title, entry.title));
    if (best) return best;
  }
  return null;
}

/* Two titles match when nearly all of the shorter one's words appear in
   the longer. Catalogue titles differ in punctuation and subtitles more
   often than in words. */
function similar(a, b) {
  const wa = new Set(normaliseTitle(a).split(" ").filter((w) => w.length > 2));
  const wb = new Set(normaliseTitle(b).split(" ").filter((w) => w.length > 2));
  if (!wa.size || !wb.size) return false;
  const [small, large] = wa.size <= wb.size ? [wa, wb] : [wb, wa];
  let hits = 0;
  for (const w of small) if (large.has(w)) hits++;
  return hits / small.size >= 0.75;
}

export const hosts = HOSTS;
