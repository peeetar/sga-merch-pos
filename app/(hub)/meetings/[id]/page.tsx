import Link from "next/link";
import { notFound } from "next/navigation";
import { DbDown, Panel } from "@/components/hub/bits";
import { KINDS, STEP_LABEL, getMeeting } from "@/lib/meetings";
import MeetingActions from "./MeetingActions";

export const metadata = { title: "Meeting · SGA Hub" };

export default async function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let m;
  try { m = await getMeeting(id); } catch (err) {
    return <main className="hubpage"><DbDown err={err} /></main>;
  }
  if (!m) notFound();
  const n = m.notes;
  return (
    <main className="hubpage">
      <p><Link href="/meetings" className="linkbtn">← Meetings</Link></p>
      <header className="hubpage__head">
        <h1>{m.title}</h1>
        {m.notion_url && <a className="btn btn--sm btn--primary" href={m.notion_url} target="_blank" rel="noreferrer">Open in Notion ↗</a>}
      </header>
      <p className="muted">{KINDS[m.kind]} · {new Date(m.held_on + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · {m.start_time}</p>

      {m.error && (
        <div className="notice notice--bad">
          <strong>Stopped at “{STEP_LABEL[m.status]}”.</strong> {m.error}
          <p className="small">Fix the cause (often a missing key in Settings, or Gemini&apos;s free-tier limit; wait a minute), then press Try again.</p>
        </div>
      )}
      {m.status !== "done" && !m.error && <div className="notice">Working on it: {STEP_LABEL[m.status]}. Open <Link href="/meetings">Meetings</Link> to keep it moving.</div>}

      <MeetingActions id={m.id} status={m.status} hasError={!!m.error} hasAudio={!!m.audio_path} hasNotes={!!n} filed={!!m.notion_url} />

      {n && (
        <>
          <Panel title="Summary"><p>{n.summary}</p></Panel>
          <Panel title="Notes">
            <p><strong>Attendees:</strong> {n.attendees_line}</p>
            <p><strong>Main decisions:</strong> {n.main_decisions}</p>
            {n.sections.map((s, i) => (
              <section key={i} className="notes-section">
                <h3>{i + 1}. {s.title}</h3>
                <ul>{s.bullets.map((b, j) => <li key={j}>{b.label && <strong>{b.label}: </strong>}{b.text}</li>)}</ul>
              </section>
            ))}
            <h3>{n.sections.length + 1}. Action items</h3>
            <table className="tbl">
              <thead><tr><th>Task</th><th>Owner</th><th>Due</th><th>Status</th></tr></thead>
              <tbody>{n.action_items.map((a, i) => <tr key={i}><td>{a.task}</td><td>{a.owner}</td><td>{a.due}</td><td>{a.status}</td></tr>)}</tbody>
            </table>
            {n.next_meeting.date && <p><strong>Next meeting:</strong> {n.next_meeting.date} {n.next_meeting.time}</p>}
          </Panel>
          {(n.unclear.length > 0 || n.assumptions.length > 0) && (
            <Panel title="Check these">
              {n.assumptions.length > 0 && <><h3 className="h3">Assumed, not heard</h3><ul>{n.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul></>}
              {n.unclear.length > 0 && <><h3 className="h3">Unclear in the recording</h3><ul>{n.unclear.map((a, i) => <li key={i}>{a}</li>)}</ul></>}
            </Panel>
          )}
        </>
      )}
      {m.transcript && (
        <Panel title="Transcript">
          <details><summary className="linkbtn">Show the transcript</summary><pre className="transcript">{m.transcript}</pre></details>
        </Panel>
      )}
    </main>
  );
}
