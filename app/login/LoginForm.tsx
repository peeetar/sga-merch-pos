"use client";

import { useState } from "react";
import { PasswordForm } from "@/components/ui";

const MESSAGES: Record<string, string> = {
  invalid: "That doesn't look like an email address.",
  rate_limited: "Too many tries. Wait a few minutes.",
  not_on_board: "That email isn't on this year's board list. Ask a board member to add you on the People page.",
  email_not_configured: "Email sign-in isn't set up on the server yet (RESEND_API_KEY / HUB_EMAIL_FROM).",
  email_failed: "The email couldn't be sent. Try again, or use the shared password.",
  server: "Something went wrong on the server. Try again in a minute.",
};

export default function LoginForm({ initialError, passwordEnabled }: { initialError: string | null; passwordEnabled: boolean }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");
  const [error, setError] = useState<string | null>(initialError);
  const [usePassword, setUsePassword] = useState(false);

  if (state === "sent") {
    return (
      <div className="stack">
        <h1>Check your email</h1>
        <p className="muted">A sign-in link is on its way to <strong>{email}</strong>. It works once, for 15 minutes.</p>
        <button className="linkbtn" onClick={() => setState("idle")}>Use a different email</button>
      </div>
    );
  }

  if (usePassword) {
    return (
      <div className="stack">
        <p className="muted">The shared board password, for when email isn&apos;t working.</p>
        <PasswordForm submitLabel="Sign in" onSubmit={async (password) => {
          const res = await fetch("/api/auth/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) }).catch(() => null);
          if (res?.ok) { location.href = "/"; return null; }
          return res?.status === 429 ? MESSAGES.rate_limited : res ? "Wrong password." : "No connection.";
        }} />
        <button className="linkbtn" onClick={() => setUsePassword(false)}>Email me a link instead</button>
      </div>
    );
  }

  return (
    <form className="stack" onSubmit={async (e) => {
      e.preventDefault();
      setState("busy");
      setError(null);
      const res = await fetch("/api/auth/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) }).catch(() => null);
      if (res?.ok) return setState("sent");
      const body = await res?.json().catch(() => null);
      setError(res ? MESSAGES[body?.code] || MESSAGES.server : "No connection.");
      setState("idle");
    }}>
      <p className="muted">Board members sign in with their ACT email.</p>
      <input type="email" required autoFocus autoComplete="email" placeholder="you@act.edu" className="field"
        value={email} onChange={(e) => setEmail(e.target.value)} />
      {error && <p className="error">{error}</p>}
      <button className="btn btn--primary" disabled={state === "busy" || !email}>{state === "busy" ? "Sending…" : "Email me a sign-in link"}</button>
      {passwordEnabled && <button type="button" className="linkbtn" onClick={() => setUsePassword(true)}>Use the shared password</button>}
    </form>
  );
}
