// What the hub needs from its environment, checked by name only: values are
// never read back or shown.
export type Check = { key: string; label: string; ok: boolean; required: boolean; help: string };

const has = (k: string) => !!process.env[k];

export function setupChecks(): Check[] {
  return [
    { key: "DATABASE_URL", label: "Database", ok: has("DATABASE_URL"), required: true,
      help: "Vercel → Storage → add Neon. Use the same database the old merch till used, so its sales and stock carry over." },
    { key: "HUB_SECRET", label: "Session secret", ok: (process.env.HUB_SECRET || "").length >= 32, required: true,
      help: "A random string of 32+ characters (e.g. `openssl rand -base64 48`). Changing it signs everyone out." },
    { key: "RESEND_API_KEY", label: "Email sign-in", ok: has("RESEND_API_KEY") && has("HUB_EMAIL_FROM"), required: true,
      help: "Resend account on the SGA mailbox. Set RESEND_API_KEY and HUB_EMAIL_FROM, e.g. `SGA Hub <hub@yourdomain>`; without a verified domain Resend only delivers to the account's own address." },
    { key: "HUB_BOOTSTRAP_EMAILS", label: "First sign-in", ok: has("HUB_BOOTSTRAP_EMAILS"), required: false,
      help: "Comma-separated emails that may sign in before anyone is on the People page. Clear it once People is filled in." },
    { key: "HUB_PASSWORD", label: "Shared fallback password", ok: (process.env.HUB_PASSWORD || "").length >= 12, required: false,
      help: "Optional, 12+ characters. Lets the board in when email is down. Keep it in the SGA password manager." },
    { key: "POS_PASSWORD", label: "Till password", ok: has("POS_PASSWORD"), required: true,
      help: "The password sellers type on the tablet. Shared with volunteers, so it's separate from the board login." },
    { key: "NTFY_TOPIC", label: "ntfy alerts", ok: has("NTFY_TOPIC"), required: true,
      help: "A long, hard-to-guess topic name (anyone who knows it can read it). Optional NTFY_URL for a self-hosted server and NTFY_TOKEN for a protected topic." },
  ];
}
