// Small server-rendered pieces shared by the hub pages.
import Link from "next/link";

export function Stat({ label, value, sub, href }: { label: string; value: React.ReactNode; sub?: React.ReactNode; href?: string }) {
  const body = (
    <>
      <span className="stat__label">{label}</span>
      <strong className="stat__value">{value}</strong>
      {sub && <span className="stat__sub">{sub}</span>}
    </>
  );
  return href ? <Link href={href} className="stat stat--link">{body}</Link> : <div className="stat">{body}</div>;
}

export function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="panel">
      <header className="panel__head"><h2>{title}</h2>{action}</header>
      {children}
    </section>
  );
}

/** Shown instead of a page's data when the database can't be reached, so a
 *  missing DATABASE_URL reads as a setup step, not a crash. */
export function DbDown({ err }: { err: unknown }) {
  const missing = err instanceof Error && /DATABASE_URL/.test(err.message);
  return (
    <div className="notice notice--bad">
      <strong>{missing ? "No database yet." : "The database didn't answer."}</strong>{" "}
      {missing
        ? "Add Neon to the Vercel project (Storage → Neon), which sets DATABASE_URL, then redeploy."
        : "Try again in a minute. The till keeps selling offline in the meantime."}
    </div>
  );
}

export const ago = (iso: string | null | undefined) => {
  if (!iso) return "never";
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 90) return "just now";
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 129600) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
};
