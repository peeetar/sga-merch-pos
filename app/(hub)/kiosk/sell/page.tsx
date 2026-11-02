import { after } from "next/server";
import { DbDown } from "@/components/hub/bits";
import { requireBoard } from "@/lib/auth";
import { flushSell, loadSell, priceList, refreshPriceList } from "@/lib/sell";
import { PiDown } from "../PiDown";
import { SellBoard } from "./SellBoard";

export const metadata = { title: "Sell coffee · SGA Hub" };

export default async function Sell() {
  const me = await requireBoard();
  let body: React.ReactNode;
  try {
    const [state, prices] = await Promise.all([loadSell(), priceList(me.email)]);
    // Never make the page wait on the Pi.
    after(async () => { await flushSell(me.email).catch(() => null); await refreshPriceList(me.email).catch(() => null); });
    body = prices ? <SellBoard {...state} prices={prices} me={me.email} />
      : <PiDown err={{ ok: false, kind: "offline", message: "" }} />;
  } catch (err) {
    body = <DbDown err={err} />;
  }
  return (
    <main className="hubpage">
      <header className="hubpage__head"><h1>Sell coffee</h1></header>
      {body}
    </main>
  );
}
