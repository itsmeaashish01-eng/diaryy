/* ================================================
   AGENTS — core/notify.mjs
   Getting a sentence to your phone.

   Same two channels Price Watch uses, so one set of secrets covers both:
   ntfy (free, no account — subscribe to a topic in the app) and a plain
   webhook for Discord, Slack, or anything that takes JSON.
   ================================================ */

const PRIORITY = { quiet: 2, notable: 3, urgent: 5 };
const TAGS = { quiet: ["information_source"], notable: ["bell"], urgent: ["rotating_light"] };

export const canNotify = () => Boolean(process.env.NTFY_TOPIC || process.env.WEBHOOK_URL);

async function pushNtfy(title, message, level) {
  const topic = process.env.NTFY_TOPIC;
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

export async function deliver(title, message, level) {
  const out = [];
  for (const [name, fn] of [["ntfy", pushNtfy], ["webhook", pushWebhook]]) {
    try { out.push(`${name}: ${await fn(title, message, level)}`); }
    catch (e) { out.push(`${name}: FAILED — ${e.message}`); }
  }
  return out;
}
