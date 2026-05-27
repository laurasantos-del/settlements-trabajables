"use client";

import { Bars } from "@/components/ui/charts";
import type { LifecycleClient } from "@/lib/types";

const buckets = [
  { label: "0-1 mo", min: 0, max: 1 },
  { label: "1-2 mo", min: 1, max: 2 },
  { label: "2-3 mo", min: 2, max: 3 },
  { label: "3-6 mo", min: 3, max: 6 },
  { label: "6-12 mo", min: 6, max: 12 },
  { label: "1-2 yrs", min: 12, max: 24 },
  { label: "2+ yrs", min: 24, max: Infinity }
];

export function CancellationsTenureChart({ rows }: { rows: LifecycleClient[] }) {
  const cancelled = rows.filter((row) => row._segment.includes("cancelled"));
  const data = buckets.map((bucket) => ({
    label: bucket.label,
    value: cancelled.filter((row) => Number(row._monthsInProgram ?? 0) >= bucket.min && Number(row._monthsInProgram ?? 0) < bucket.max).length,
    color: bucket.min < 3 ? "#E24B4A" : bucket.min < 12 ? "#F09595" : "#6b7280"
  }));
  const early = data.slice(0, 3).reduce((sum, item) => sum + item.value, 0);

  return (
    <section className="card-pad">
      <h2 className="font-semibold text-white">Time in Program Before Cancelling</h2>
      <Bars data={data} horizontal />
      <p className="text-sm text-muted">{cancelled.length ? Math.round((early / cancelled.length) * 100) : 0}% of cancellations happen in the first 3 months.</p>
    </section>
  );
}
