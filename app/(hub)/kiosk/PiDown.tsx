import type { PiFailure } from "@/lib/pi";

/** Why a live page has nothing to show. */
export function PiDown({ err }: { err: PiFailure }) {
  if (err.kind === "unset") return (
    <div className="notice"><strong>The hub isn&apos;t connected to the Pi yet.</strong> Set PI_API_URL and PI_API_TOKEN (Settings shows what&apos;s missing).</div>
  );
  if (err.kind === "offline") return (
    <div className="notice notice--warn"><strong>The kiosk isn&apos;t answering.</strong> This needs the Pi online. The machine keeps vending on its own, and <a href="/kiosk">Status</a> shows its last report.</div>
  );
  return <div className="notice notice--bad"><strong>The kiosk refused this.</strong> {err.message}</div>;
}
