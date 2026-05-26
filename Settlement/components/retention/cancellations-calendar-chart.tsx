"use client";

import { Bars } from "@/components/ui/charts";
import type { LifecycleClient } from "@/lib/types";

export function CancellationsCalendarChart({ rows }: { rows: LifecycleClient[] }) {
  const cancelled = rows.filter((row) => row._segment.includes("cancelled") && row._cancellationDate);
  const counts = new Map<string, number>();
  for (const row of cancelled) {
    const key = String(row._cancellationDate).slice(0, 7);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const data = Array.from(counts.entries()).sort(([a], [b]) => a.localeCompare(b)).slice(-24).map(([label, value]) => ({ label, value }));
  const peak = data.reduce((best, item) => item.value > best.value ? item : best, { label: "-", value: 0 });

  return (
    <section className="card-pad">
      <h2 className="font-semibold text-white">Cancellations by Calendar Month</h2>
      <Bars data={data} />
      <p className="text-sm text-muted">Peak month: {peak.label} had the most cancellations ({peak.value}).</p>
    </section>
  );
}
