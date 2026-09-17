/* ================================================
   AGENTS — core/notify.mjs
   Getting a sentence to your phone.

   Same two channels Price Watch uses, so one set of secrets covers both:
   ntfy (free, no account — subscribe to a topic in the app) and a plain
   webhook for Discord, Slack, or anything that takes JSON.
   ================================================ */

const PRIORITY = { quiet: 2, notable: 3, urgent: 5 };
const TAGS = { quiet: ["information_source"], notable: ["bell"], urgent: ["rotating_light"] };

/* Where the topic can come from, in order:

     NTFY_TOPIC            an environment variable, which on GitHub means
                           a repository secret
     settings.notify       a value committed in agents.json

   The second only exists because setting a repository secret is a real
   obstacle for someone who doesn't live in GitHub's settings pages, and
   an alerting system nobody can finish configuring alerts nobody.

   It is safe ONLY in a private repository. An ntfy topic is a password:
   anyone holding the string can read every alert. In a public repo a
   committed topic is a password published to the internet, so the runner
   checks and refuses rather than trusting you to remember. */
let configured = { ntfyTopic: "" };

export function configure(settings) {
  configured = {
    ntfyTopic: String((settings && settings.ntfyTopic) || "").trim(),
  };
}

const topicFromEnv = () => String(process.env.NTFY_TOPIC || "").trim();

/* Set by the runner once it knows whether a committed topic is usable. */
let committedTopicAllowed = true;
export function allowCommittedTopic(ok) { committedTopicAllowed = ok; }

function ntfyTopic() {
  const env = topicFromEnv();
  if (env) return env;
  if (configured.ntfyTopic && committedTopicAllowed) return configured.ntfyTopic;
  return "";
}

export const canNotify = () => Boolean(ntfyTopic() || process.env.WEBHOOK_URL);

/* True when a topic is only available because it was committed — the
   runner uses this to decide whether the public-repo check matters. */
export const usingCommittedTopic = () => Boolean(!topicFromEnv() && configured.ntfyTopic);

async function pushNtfy(title, message, level) {
  const topic = ntfyTopic();
  if (!topic) return "no topic configured";
  const server = (process.env.NTFY_SERVER || "https://ntfy.sh").replace(/\/+$/, "");
  const res = await fetch(server, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      topic, title, message,
      priority: PRIORITY[level] || 3,
      tags: TAGS[level] || ["bell"],
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`ntfy responded ${res.status}`);
  return "sent";
}

async function pushWebhook(title, message) {
  const url = process.env.WEBHOOK_URL;
  if (!url) return "no webhook configured";
  const style = process.env.WEBHOOK_STYLE || "discord";
  const payload =
    style === "slack" ? { text: `*${title}*\n${message}` }
    : style === "plain" ? { title, message, at: new Date().toISOString() }
    : { content: `**${title}**\n${message}` };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Webhook responded ${res.status}`);
  return "sent";
}

/* Returns one result per channel: { name, sent, detail }. `sent` is the
   one that matters — the runner only marks a finding as reported once at
   least one channel actually took it. A finding that went nowhere has not
   been reported, whatever the log says. */
export async function deliver(title, message, level) {
  const out = [];
  for (const [name, fn] of [["ntfy", pushNtfy], ["webhook", pushWebhook]]) {
    try {
      const detail = await fn(title, message, level);
      out.push({ name, sent: detail === "sent", detail });
    } catch (e) {
      out.push({ name, sent: false, detail: `FAILED — ${e.message}` });
    }
  }
  return out;
}

export const anySent = (results) => results.some((r) => r.sent);
export const describeDelivery = (results) => results.map((r) => `${r.name}: ${r.detail}`);
