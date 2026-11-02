"use client";

import { useState, useTransition } from "react";
import type { Outcome } from "./live-actions";

/** Runs one server action at a time and keeps its result on screen. */
export function useAct() {
  const [busy, start] = useTransition();
  const [last, setLast] = useState<Outcome | null>(null);
  const run = (fn: () => Promise<Outcome>, then?: (o: Outcome) => void) => start(async () => {
    const o = await fn();
    setLast(o);
    then?.(o);
  });
  const note = last && <p className={"small " + (last.ok ? "pos" : "error")} role="status">{last.message}</p>;
  return { busy, run, note, last };
}
