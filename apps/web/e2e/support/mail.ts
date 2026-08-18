/**
 * Reads one-time codes from the local Supabase mail sink. Supabase CLI ≥ 2.x ships Mailpit
 * (`/api/v1/...`); older stacks ship Inbucket (`/api/v1/mailbox/...`). Both are tried.
 */
const mailUrl = (process.env.E2E_MAIL_URL ?? "http://127.0.0.1:54324").replace(/\/$/, "");

type MailpitSummary = {ID: string; To?: Array<{Address?: string}>; Created?: string};
type MailpitMessage = {Text?: string; HTML?: string};
type InbucketSummary = {id: string; date?: string};
type InbucketMessage = {body?: {text?: string; html?: string}};

const codePattern = /(?<!\d)(\d{6})(?!\d)/;

function extractCode(...parts: Array<string | undefined>) {
  for (const part of parts) {
    if (!part) continue;
    // Strip tags so a code split across markup is still found; the template renders it as a single text node.
    const match = part.replace(/<[^>]+>/g, " ").match(codePattern);
    if (match) return match[1];
  }
  return null;
}

async function fromMailpit(email: string): Promise<string | null> {
  const list = await fetch(`${mailUrl}/api/v1/messages?limit=50`).catch(() => null);
  if (!list?.ok) return null;
  const payload = await list.json() as {messages?: MailpitSummary[]};
  const candidates = (payload.messages ?? [])
    .filter((message) => (message.To ?? []).some((to) => (to.Address ?? "").toLowerCase() === email.toLowerCase()))
    .sort((a, b) => (b.Created ?? "").localeCompare(a.Created ?? ""));
  for (const summary of candidates) {
    const detail = await fetch(`${mailUrl}/api/v1/message/${summary.ID}`);
    if (!detail.ok) continue;
    const message = await detail.json() as MailpitMessage;
    const code = extractCode(message.Text, message.HTML);
    if (code) return code;
  }
  return null;
}

async function fromInbucket(email: string): Promise<string | null> {
  const mailbox = email.split("@")[0] ?? email;
  const list = await fetch(`${mailUrl}/api/v1/mailbox/${encodeURIComponent(mailbox)}`).catch(() => null);
  if (!list?.ok) return null;
  const summaries = (await list.json() as InbucketSummary[]).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  for (const summary of summaries) {
    const detail = await fetch(`${mailUrl}/api/v1/mailbox/${encodeURIComponent(mailbox)}/${summary.id}`);
    if (!detail.ok) continue;
    const message = await detail.json() as InbucketMessage;
    const code = extractCode(message.body?.text, message.body?.html);
    if (code) return code;
  }
  return null;
}

/** Polls the mail sink until a 6-digit code addressed to `email` appears (newest message wins). */
export async function waitForOneTimeCode(email: string, options: {timeoutMs?: number; after?: number} = {}) {
  const deadline = Date.now() + (options.timeoutMs ?? 45_000);
  let lastError: unknown = null;
  while (Date.now() < deadline) {
    try {
      const code = (await fromMailpit(email)) ?? (await fromInbucket(email));
      if (code) return code;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }
  throw new Error(`No one-time code for ${email} at ${mailUrl} within the timeout${lastError ? ` (${String(lastError)})` : ""}`);
}
