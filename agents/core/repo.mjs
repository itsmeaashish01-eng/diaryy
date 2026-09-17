/* ================================================
   AGENTS — core/repo.mjs
   Is the repository this is running in public?

   Two things depend on the answer, and both get it wrong in the
   dangerous direction if they guess:

     the committed ntfy topic   a password, published if the repo is public
     the personal agents        their findings are committed hourly, so a
                                public repo publishes your goals, your
                                reading, your training and your positions

   Asked once per run and cached, because it cannot change mid-pass.
   ================================================ */

let cached = null;

/* Returns { onGitHub, known, isPublic, why }.

   `known` false means the question could not be answered — which is not
   the same as "private", and callers must treat it as the unsafe case.
   Off GitHub there is no repository to judge: it is someone's own
   machine, and nothing is being published by running there. */
export async function repoVisibility() {
  if (cached) return cached;

  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) {
    return (cached = { onGitHub: false, known: true, isPublic: false, why: "not running on GitHub" });
  }

  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) {
    return (cached = {
      onGitHub: true, known: false, isPublic: null,
      why: `cannot check whether ${repo} is public without a GITHUB_TOKEN`,
    });
  }

  try {
    const res = await fetch(`https://api.github.com/repos/${repo}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      return (cached = {
        onGitHub: true, known: false, isPublic: null,
        why: `GitHub answered ${res.status} when asked if ${repo} is private`,
      });
    }
    const json = await res.json();
    return (cached = {
      onGitHub: true, known: true, isPublic: !json.private,
      why: json.private ? `${repo} is private` : `${repo} is PUBLIC`,
    });
  } catch (e) {
    return (cached = {
      onGitHub: true, known: false, isPublic: null,
      why: `could not check whether ${repo} is public (${e.message})`,
    });
  }
}

/* Only these read a file about you and write what they found back into
   the repository. The rest watch the outside world and leak nothing. */
export const PERSONAL_TYPES = new Set(["goals", "reading", "exercise", "portfolio", "diary", "study"]);

export const personalAgents = (agents) =>
  agents.filter((a) => a && a.active !== false && PERSONAL_TYPES.has(a.type));

/* Exposed so tests can drive the callers without a network. */
export function __setVisibilityForTests(v) { cached = v; }
