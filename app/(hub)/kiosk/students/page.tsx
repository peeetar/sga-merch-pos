import Link from "next/link";
import { Panel, ago } from "@/components/hub/bits";
import { requireBoard } from "@/lib/auth";
import { piGet, type PiConfig, type PiStudent } from "@/lib/pi";
import { PiDown } from "../PiDown";
import { NewStudent } from "./NewStudent";

export const metadata = { title: "Students · SGA Hub" };

type Flags = { locked: { student_id: string }[]; lockouts_24h: unknown[]; mismatches: { student_id: string }[] };

export default async function Students({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const me = await requireBoard();
  const q = ((await searchParams).q || "").trim().slice(0, 40);
  const [list, flags, cfg] = await Promise.all([
    piGet<{ students: PiStudent[] }>(`/students${q ? `?q=${encodeURIComponent(q)}` : ""}`, me.email),
    piGet<Flags>("/students/flags", me.email),
    piGet<PiConfig>("/config", me.email),
  ]);
  return (
    <main className="hubpage">
      <header className="hubpage__head">
        <h1>Students</h1>
        {cfg.ok && <NewStudent bundles={cfg.bundles} length={cfg.student_id_length} />}
      </header>
      {!list.ok ? <PiDown err={list} /> : (
        <>
          {flags.ok && (flags.locked.length > 0 || flags.mismatches.length > 0) && (
            <div className="notice notice--warn">
              {flags.locked.length > 0 && <p><strong>Locked out:</strong> {flags.locked.map((s) => <Link key={s.student_id} href={`/kiosk/students/${s.student_id}`}>{s.student_id} </Link>)}</p>}
              {flags.mismatches.length > 0 && <p><strong>Balance doesn&apos;t match history:</strong> {flags.mismatches.map((s) => <Link key={s.student_id} href={`/kiosk/students/${s.student_id}`}>{s.student_id} </Link>)}</p>}
            </div>
          )}
          <form className="row row--tight" method="get" role="search">
            <input className="field field--sm" name="q" defaultValue={q} inputMode="search" autoFocus placeholder="Student ID, or part of it" aria-label="Search students" />
            <button className="btn btn--sm btn--primary">Search</button>
            {q && <Link className="btn btn--sm" href="/kiosk/students">Clear</Link>}
          </form>
          <Panel title={q ? `Results for ${q}` : "Most recent"}>
            {list.students.length === 0 ? <p className="muted">Nobody found.</p> : (
              <table className="tbl">
                <thead><tr><th>ID</th><th className="num">Coffees</th><th>PIN</th><th>Last seen</th></tr></thead>
                <tbody>
                  {list.students.map((s) => (
                    <tr key={s.student_id}>
                      <td><Link href={`/kiosk/students/${encodeURIComponent(s.student_id)}`}>{s.student_id}</Link> {s.kind === "staff" && <span className="pill pill--warn">staff</span>}</td>
                      <td className="num">{s.credits}</td>
                      <td>{s.locked_for > 0 ? <span className="pill pill--bad">locked</span> : s.has_pin ? "set" : <span className="muted">not yet</span>}</td>
                      <td className="muted">{ago(s.last_seen_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        </>
      )}
    </main>
  );
}
