"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Dialog } from "@/components/ui";
import { euros } from "@/lib/types";
import { createStudent } from "../live-actions";
import { useAct } from "../useAct";

export function NewStudent({ bundles, length }: { bundles: { cents: number; coffees: number }[]; length: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [id, setId] = useState("");
  const { busy, run, note } = useAct();
  const ready = id.length === length;
  const go = (cents: number | null) => run(() => createStudent(id, cents), (o) => { if (o.ok) router.push(`/kiosk/students/${id}`); });
  return (
    <>
      <button className="btn btn--sm btn--primary" onClick={() => setOpen(true)}>+ New student</button>
      {open && (
        <Dialog title="New student" onClose={() => setOpen(false)}>
          <p className="muted">For someone who has never used the kiosk. They choose a PIN on their first visit.</p>
          <input className="field" autoFocus inputMode="numeric" placeholder={`${length}-digit student ID`} value={id}
            onChange={(e) => setId(e.target.value.replace(/\D/g, "").slice(0, length))} aria-label="Student ID" />
          <div className="row">
            {bundles.map((b) => <button key={b.cents} className="btn btn--sm btn--primary" disabled={busy || !ready} onClick={() => go(b.cents)}>Took {euros(b.cents, true)}: {b.coffees} coffees</button>)}
            <button className="btn btn--sm" disabled={busy || !ready} onClick={() => go(null)}>No top-up</button>
          </div>
          {note}
        </Dialog>
      )}
    </>
  );
}
