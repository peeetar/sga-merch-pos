"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import Uploader, { type Uploaded } from "@/components/hub/Uploader";
import { Dialog } from "@/components/ui";
import { createMeeting, saveMeetingSettings } from "./actions";

type Kind = "board" | "dean" | "other";
type Row = { id: string; title: string; kind: Kind; held_on: string; status: string; error: string | null; running_since: string | null; notion_url: string | null };
type Person = { id: string; name: string; role: string | null; notion_user_id: string | null };

const KINDS: Record<Kind, string> = { board: "SGA board meeting", dean: "Meeting with the Dean", other: "Other meeting" };
const STEP: Record<string, string> = { upload: "Sending to Gemini", transcribe: "Transcribing", notes: "Writing the notes", notion: "Filing in Notion", done: "Done" };
const ORDER = ["upload", "transcribe", "notes", "notion", "done"];

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Athens" }).format(new Date());
const ordinal = (n: number) => n + (n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th");
const shortDate = (day: string) => {
  const d = new Date(day + "T12:00:00Z");
  return `${ordinal(d.getUTCDate())} ${d.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" })}`;
};

/** "SGA Meeting #5 - 29th Oct", numbered on from the last board meeting. */
function suggestTitle(kind: Kind, day: string, meetings: Row[]) {
  if (kind === "dean") return `Dean Meeting - ${shortDate(day)}`;
  if (kind === "other") return `Meeting - ${shortDate(day)}`;
  const n = Math.max(0, ...meetings.map((m) => Number(m.title.match(/#(\d+)/)?.[1] || 0)));
  return `SGA Meeting #${n + 1} - ${shortDate(day)}`;
}

export default function MeetingsBoard({ meetings, people, context, fixes, ready }: {
  meetings: Row[]; people: Person[]; context: string; fixes: string;
  ready: { blob: boolean; gemini: boolean; notion: boolean; model: string };
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [tuning, setTuning] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const stop = useRef(false);

  // While this page is open, push every unfinished meeting through its steps,
  // one step per request. Closing the page pauses; opening it again resumes.
  const pending = meetings.filter((m) => m.status !== "done" && !m.error);
  useEffect(() => {
    stop.current = false;
    if (running || !pending.length) return;
    const m = pending[0];
    (async () => {
      setRunning(m.id);
      try {
        const res = await fetch(`/api/meetings/${m.id}/step`, { method: "POST" });
        if (res.status === 409) await new Promise((r) => setTimeout(r, 15000)); // another tab has it
      } catch { await new Promise((r) => setTimeout(r, 10000)); }
      if (!stop.current) { setRunning(null); router.refresh(); }
    })();
    return () => { stop.current = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetings, running]);

  const setup = [!ready.blob && "file storage (Blob)", !ready.gemini && "GEMINI_API_KEY", !ready.notion && "Notion (NOTION_TOKEN, NOTION_MEETINGS_DATA_SOURCE)"].filter(Boolean);

  return (
    <main className="hubpage">
      <header className="hubpage__head">
        <h1>Meetings</h1>
        <div className="row">
          <button className="btn btn--sm" onClick={() => setTuning(true)}>Names &amp; fixes</button>
          <button className="btn btn--sm btn--primary" disabled={!ready.blob || !ready.gemini} onClick={() => setAdding(true)}>+ New recording</button>
        </div>
      </header>
      {setup.length > 0 && <div className="notice notice--warn"><strong>Not fully set up:</strong> {setup.join(", ")}. See Settings.</div>}
      <p className="muted small">Upload a voice memo; Gemini ({ready.model}) transcribes it and writes the notes, and they&apos;re filed in the Notion Meetings database with the transcript at the bottom. Keep this page open while it works (a few minutes for an hour of audio). The recording is deleted from the hub once it&apos;s filed.</p>

      {meetings.length === 0 ? <p className="muted">No meetings yet.</p> : (
        <ul className="meetings">
          {meetings.map((m) => {
            const at = ORDER.indexOf(m.status);
            return (
              <li key={m.id} className="meeting">
                <Link href={`/meetings/${m.id}`} className="meeting__title">{m.title}</Link>
                <span className="muted small">{KINDS[m.kind]} · {new Date(m.held_on + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span>
                {m.status === "done" ? (
                  m.notion_url ? <a className="pill pill--ok" href={m.notion_url} target="_blank" rel="noreferrer">In Notion ↗</a> : <span className="pill pill--ok">done</span>
                ) : m.error ? (
                  <span className="meeting__err"><span className="pill pill--bad">stopped at: {STEP[m.status]}</span> <Link className="linkbtn" href={`/meetings/${m.id}`}>see why</Link></span>
                ) : (
                  <span className="steps" aria-label={STEP[m.status]}>
                    {ORDER.slice(0, 4).map((s, i) => <i key={s} className={i < at ? "is-done" : i === at ? (running === m.id ? "is-now" : "is-next") : ""} title={STEP[s]} />)}
                    <span className="small">{running === m.id ? `${STEP[m.status]}…` : `waiting: ${STEP[m.status]}`}</span>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {adding && <NewMeeting people={people} meetings={meetings} onClose={() => setAdding(false)} onCreated={() => { setAdding(false); router.refresh(); }} />}
      {tuning && <Tuning context={context} fixes={fixes} onClose={() => setTuning(false)} />}
    </main>
  );
}

function NewMeeting({ people, meetings, onClose, onCreated }: { people: Person[]; meetings: Row[]; onClose: () => void; onCreated: () => void }) {
  const [kind, setKind] = useState<Kind>("board");
  const [day, setDay] = useState(today());
  const [time, setTime] = useState("14:00");
  const [title, setTitle] = useState<string | null>(null);
  const [attendees, setAttendees] = useState<string[]>(people.map((p) => p.id));
  const [others, setOthers] = useState("");
  const [audio, setAudio] = useState<Uploaded | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const shownTitle = title ?? suggestTitle(kind, day, meetings);
  const toggle = (id: string) => setAttendees(attendees.includes(id) ? attendees.filter((x) => x !== id) : [...attendees, id]);

  return (
    <Dialog title="New meeting recording" onClose={onClose} wide>
      <div className="editor">
        <div className="stack">
          <div className="seg seg--3">
            {(Object.keys(KINDS) as Kind[]).map((k) => <button key={k} className={kind === k ? "is-on" : ""} onClick={() => { setKind(k); if (k === "dean") setTime("13:00"); }}>{k === "board" ? "Board" : k === "dean" ? "Dean" : "Other"}</button>)}
          </div>
          <div className="row row--tight">
            <label className="lbl grow">Date<input type="date" className="field field--sm" value={day} onChange={(e) => setDay(e.target.value)} /></label>
            <label className="lbl">Start<input type="time" className="field field--sm" value={time} onChange={(e) => setTime(e.target.value)} /></label>
          </div>
          <label className="lbl">Title<input className="field field--sm" value={shownTitle} onChange={(e) => setTitle(e.target.value)} /></label>
          <label className="lbl">Others present (not on People)<input className="field field--sm" value={others} onChange={(e) => setOthers(e.target.value)} placeholder="e.g. the SGA advisor, the Dean" /></label>
          <div className="row">
            <Uploader area="meetings" accept="audio/*,.m4a,.mp3,.wav,.aac,.ogg,video/mp4,video/quicktime" label={audio ? "Replace recording" : "Choose the recording"} onUploaded={(f) => setAudio(f[0])} />
            {audio && <span className="muted small">✓ {audio.name} · {(audio.size / 1024 / 1024).toFixed(1)} MB</span>}
          </div>
        </div>
        <div className="stack">
          <p className="lbl">Who was there <span className="muted small">(tagged as attendees in Notion; names help the transcript)</span></p>
          <div className="checklist">
            {people.map((p) => (
              <label key={p.id} className="toggle">
                <input type="checkbox" checked={attendees.includes(p.id)} onChange={() => toggle(p.id)} />
                {p.name} <span className="muted small">{p.role || ""}{p.notion_user_id ? "" : " · not linked to Notion"}</span>
              </label>
            ))}
            {people.length === 0 && <p className="muted small">Add the board on People first.</p>}
          </div>
        </div>
      </div>
      {err && <p className="error">{err}</p>}
      <div className="row">
        <span className="grow" />
        <button className="btn btn--sm" onClick={onClose}>Cancel</button>
        <button className="btn btn--sm btn--primary" disabled={!audio || busy} onClick={() => start(async () => {
          const r = await createMeeting({ title: shownTitle, kind, held_on: day, start_time: time, attendees, others, audio_path: audio!.pathname });
          if (r.error) setErr(r.error); else onCreated();
        })}>{busy ? "Starting…" : "Transcribe and file"}</button>
      </div>
    </Dialog>
  );
}

function Tuning({ context, fixes, onClose }: { context: string; fixes: string; onClose: () => void }) {
  const [c, setC] = useState(context);
  const [f, setF] = useState(fixes);
  const [busy, start] = useTransition();
  return (
    <Dialog title="Names and fixes" onClose={onClose} wide>
      <label className="lbl">Who&apos;s who and terms <span className="muted small">(given to Gemini for spelling and for working out who said what)</span>
        <textarea className="field field--sm" rows={8} value={c} onChange={(e) => setC(e.target.value)}
          placeholder={"<advisor name>: SGA advisor and Head of Student Activities.\n<Dean name>: the Dean; the board meets them every few weeks.\nIPO: International Programmes Office."} />
      </label>
      <label className="lbl">Fixes <span className="muted small">(one per line, <code>{"heard => right"}</code>; several heard spellings separated by commas)</span>
        <textarea className="field field--sm mono" rows={8} value={f} onChange={(e) => setF(e.target.value)}
          placeholder={"Sweden government, Swim government => Student Government\nmerge sale => merch sale"} />
      </label>
      <div className="row">
        <span className="grow" />
        <button className="btn btn--sm" onClick={onClose}>Cancel</button>
        <button className="btn btn--sm btn--primary" disabled={busy} onClick={() => start(async () => { await saveMeetingSettings(c, f); onClose(); })}>Save</button>
      </div>
    </Dialog>
  );
}
