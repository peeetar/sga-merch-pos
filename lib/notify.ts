// Server only. Outgoing messages: sign-in emails through Resend, and board
// alerts through ntfy (everyone on the board subscribes to one topic).

export async function sendLoginEmail(to: string, link: string, minutes: number): Promise<"sent" | "not_configured" | "failed"> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.HUB_EMAIL_FROM;
  if (!key || !from) return "not_configured";
  const text = `Sign in to the SGA Hub:\n\n${link}\n\nThe link works once and for ${minutes} minutes. If you didn't ask for it, ignore this email.`;
  const html = `<p>Sign in to the SGA Hub:</p><p><a href="${link}" style="display:inline-block;padding:12px 20px;background:#8B1A1A;color:#fff;border-radius:10px;text-decoration:none;font-weight:700">Sign in</a></p><p style="color:#6B6F76">The link works once and for ${minutes} minutes. If you didn't ask for it, ignore this email.</p>`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject: "Your SGA Hub sign-in link", text, html }),
    });
    if (!res.ok) console.error("resend", res.status, await res.text().catch(() => ""));
    return res.ok ? "sent" : "failed";
  } catch (err) {
    console.error("resend", err);
    return "failed";
  }
}

export type Alert = {
  title: string;
  message: string;
  priority?: 1 | 2 | 3 | 4 | 5; // ntfy: 3 is default, 5 is urgent
  tags?: string[];              // ntfy emoji shortcodes, e.g. "warning"
  click?: string;               // opened when the notification is tapped
};

export const ntfyConfigured = () => !!process.env.NTFY_TOPIC;

/** Fire and forget: an alert that can't be sent is logged, never thrown, so
 *  it can't break the request that raised it. */
export async function notify(a: Alert): Promise<boolean> {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) return false;
  const base = (process.env.NTFY_URL || "https://ntfy.sh").replace(/\/$/, "");
  const headers: Record<string, string> = {};
  if (process.env.NTFY_TOKEN) headers.Authorization = `Bearer ${process.env.NTFY_TOKEN}`;
  try {
    // JSON publishing keeps titles with non-ASCII characters intact.
    const res = await fetch(base, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ topic, title: a.title, message: a.message, priority: a.priority ?? 3, tags: a.tags ?? [], click: a.click }),
    });
    if (!res.ok) console.error("ntfy", res.status, await res.text().catch(() => ""));
    return res.ok;
  } catch (err) {
    console.error("ntfy", err);
    return false;
  }
}

export function appUrl(path = "/") {
  const base = process.env.HUB_URL
    || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");
  return base.replace(/\/$/, "") + path;
}
