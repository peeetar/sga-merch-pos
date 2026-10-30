import { DbDown } from "@/components/hub/bits";
import { currentTerm, ensureSchema, sql } from "@/lib/db";
import { blobConfigured } from "@/lib/files";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, loadEntries, periodRange, summarise, tillPayouts, type Period } from "@/lib/finance";
import FinanceBoard from "./FinanceBoard";

export const metadata = { title: "Finance · SGA Hub" };

export default async function Finance({ searchParams }: { searchParams: Promise<{ term?: string; period?: string }> }) {
  try {
    await ensureSchema();
    const current = await currentTerm();
    const sp = await searchParams;
    const term = sp.term && /^\d{4}-\d{2}$/.test(sp.term) ? sp.term : current;
    const period: Period = sp.period === "fall" || sp.period === "spring" ? sp.period : "year";
    const [from, to] = periodRange(term, period);
    const [entries, payouts, people, cats] = await Promise.all([
      loadEntries(from, to),
      tillPayouts(from, to),
      sql()`SELECT DISTINCT name FROM hub_people ORDER BY name`.then((r) => (r as { name: string }[]).map((x) => x.name)),
      sql()`SELECT DISTINCT category, kind FROM hub_ledger`.then((r) => r as { category: string; kind: string }[]),
    ]);
    const y = Number(current.slice(0, 4));
    const terms = [...new Set([current, term, `${y - 1}-${String(y % 100).padStart(2, "0")}`])].sort().reverse();
    return (
      <FinanceBoard term={term} period={period} terms={terms} entries={entries} summary={summarise(entries)} payouts={payouts}
        people={people} blobReady={blobConfigured()}
        incomeCats={[...new Set([...INCOME_CATEGORIES.filter((c) => c === "Other income"), ...cats.filter((c) => c.kind === "income").map((c) => c.category)])]}
        expenseCats={[...new Set([...EXPENSE_CATEGORIES, ...cats.filter((c) => c.kind === "expense").map((c) => c.category)])]} />
    );
  } catch (err) {
    return <main className="hubpage"><header className="hubpage__head"><h1>Finance</h1></header><DbDown err={err} /></main>;
  }
}
