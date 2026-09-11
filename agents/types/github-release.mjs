/* ================================================
   AGENTS — types/github-release.mjs
   New releases or tags on a GitHub repository.

   config:
     repo             "owner/name"
     includePrerelease  default false
     source           "releases" (default) or "tags", for projects that
                      tag but never cut a release

   Runs unauthenticated at 60 requests an hour per IP, which is plenty
   hourly. Set GITHUB_TOKEN and it uses it — inside Actions that raises
   the limit and costs nothing.
   ================================================ */

import { getJSON } from "../core/net.mjs";

const API = "https://api.github.com";

function auth() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  return {
    accept: "application/vnd.github+json",
    headers: {
      "X-GitHub-Api-Version": "2022-11-28",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };
}

export default {
  id: "github-release",
  label: "GitHub release",
  summary: "A repository published a release or tag",

  validate(agent) {
    const repo = agent.config && agent.config.repo;
    if (!repo) return ["needs config.repo, as owner/name"];
    return /^[\w.-]+\/[\w.-]+$/.test(repo) ? [] : [`config.repo "${repo}" is not owner/name`];
  },

  async run(agent) {
    const c = agent.config;
    const useTags = c.source === "tags";
    const url = useTags
      ? `${API}/repos/${c.repo}/tags?per_page=10`
      : `${API}/repos/${c.repo}/releases?per_page=10`;

    const list = await getJSON(url, auth());
    if (!Array.isArray(list)) throw new Error("GitHub returned something unexpected");

    const observations = useTags
      ? list.map((t) => ({
          key: `tag:${t.name}`,
          title: `${c.repo} ${t.name}`,
          detail: "",
          url: `https://github.com/${c.repo}/releases/tag/${encodeURIComponent(t.name)}`,
          at: Date.now(),
        }))
      : list
          .filter((r) => !r.draft && (c.includePrerelease || !r.prerelease))
          .map((r) => ({
            key: `rel:${r.id}`,
            title: `${c.repo} ${r.tag_name}${r.prerelease ? " (pre-release)" : ""}`,
            detail: String(r.body || "").split("\n").slice(0, 6).join("\n").slice(0, 400),
            url: r.html_url,
            at: Date.parse(r.published_at || r.created_at) || Date.now(),
          }));

    const latest = observations[0];
    return {
      observations,
      metric: null,
      facts: { latest: latest ? latest.title : null, counted: observations.length },
      line: latest ? `latest is ${latest.title}` : "no releases published yet",
    };
  },

  describe(agent, fresh) {
    return fresh
      .slice(0, 3)
      .map((o) => `${o.title}\n${o.url}${o.detail ? `\n\n${o.detail}` : ""}`)
      .join("\n\n");
  },
};
