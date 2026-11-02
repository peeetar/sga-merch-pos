import { Panel, Stat, ago } from "@/components/hub/bits";
import { requireBoard } from "@/lib/auth";
import { piGet } from "@/lib/pi";
import { PiDown } from "../PiDown";

export const metadata = { title: "Kiosk system · SGA Hub" };

type System = {
  app: { version: string; db_bytes: number };
  network: { internet_ok: boolean | null; ssid: string | null; signal_dbm: number | null; ip: string | null; tailscale: unknown };
  resources: { cpu_temp: number | null; mem_used_mb: number; mem_total_mb: number; uptime_s: number };
  sd: { verdict: string; why: string; free_mb: number; errors_since_boot: number };
  services: { name: string; state: string | null }[];
};
type Backups = { local: { at?: string } | string | null; drill_days_ago: number | null; targets: { name: string; configured: boolean; last_ok: string | null }[] };
type Deploys = { current: { sha: string; message: string; at: string } | null; behind: boolean; paused: boolean };

const yes = (v: boolean | null) => (v === null ? "unknown" : v ? "yes" : "no");

export default async function SystemPage() {
  const me = await requireBoard();
  const [s, b, d] = await Promise.all([
    piGet<System>("/system", me.email), piGet<Backups>("/backups", me.email), piGet<Deploys>("/deploys", me.email),
  ]);
  return (
    <main className="hubpage">
      <header className="hubpage__head"><h1>Kiosk system</h1></header>
      {!s.ok ? <PiDown err={s} /> : (
        <>
          <div className="stats">
            <Stat label="SD card" value={s.sd.verdict} sub={s.sd.why} />
            <Stat label="Free space" value={`${(s.sd.free_mb / 1024).toFixed(1)} GB`} sub={`${s.sd.errors_since_boot} errors since boot`} />
            <Stat label="Temperature" value={s.resources.cpu_temp === null ? "–" : `${Math.round(s.resources.cpu_temp)}°C`} sub={`up ${Math.round(s.resources.uptime_s / 3600)} h`} />
            <Stat label="Memory" value={`${s.resources.mem_used_mb} MB`} sub={`of ${s.resources.mem_total_mb} MB`} />
          </div>
          <div className="cols">
            <Panel title="Network">
              <table className="tbl"><tbody>
                <tr><td>Internet</td><td className="num">{yes(s.network.internet_ok)}</td></tr>
                <tr><td>WiFi</td><td className="num">{s.network.ssid || "–"}{s.network.signal_dbm !== null ? ` (${s.network.signal_dbm} dBm)` : ""}</td></tr>
                <tr><td>Address</td><td className="num">{s.network.ip || "–"}</td></tr>
              </tbody></table>
            </Panel>
            <Panel title="Services">
              <ul className="list">{s.services.map((v) => <li key={v.name}><span>{v.name.replace(/\.(service|timer)$/, "")}</span><span className={"pill " + (v.state === "active" ? "pill--ok" : v.state ? "pill--bad" : "")}>{v.state || "unknown"}</span></li>)}</ul>
            </Panel>
            <Panel title="Backups">
              {!b.ok ? <p className="muted">Didn&apos;t load.</p> : (
                <ul className="list">
                  {b.targets.map((t) => <li key={t.name}><span>{t.name}</span>{!t.configured ? <span className="pill pill--warn">not set up</span> : <span className="muted small">{ago(t.last_ok)}</span>}</li>)}
                  <li><span>Last restore drill</span><span className="muted small">{b.drill_days_ago === null ? "never" : `${b.drill_days_ago} days ago`}</span></li>
                </ul>
              )}
            </Panel>
            <Panel title="Software">
              {!d.ok || !d.current ? <p className="muted">Didn&apos;t load.</p> : (
                <>
                  <p><code>{d.current.sha.slice(0, 7)}</code> {d.current.message}</p>
                  <p className="muted small">{ago(d.current.at)}{d.behind ? " · a newer release is waiting" : ""}{d.paused ? " · updates paused" : ""}</p>
                </>
              )}
            </Panel>
          </div>
          <p className="muted small">Restarts, deploys, backups, hardware tests and logs stay on the Pi, over SSH, so they can&apos;t be reached from the internet.</p>
        </>
      )}
    </main>
  );
}
