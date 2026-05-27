"use client";

import { SEGMENTS } from "@/lib/metrics/retention-metrics";
import { formatMoney, parseMoney } from "@/lib/money";
import type { LifecycleClient, LifecycleSegment } from "@/lib/types";

export function DebtCompositionBar({ rows }: { rows: LifecycleClient[] }) {
  const items = (Object.keys(SEGMENTS) as LifecycleSegment[]).map((segment) => {
    const value = rows.filter((row) => row._segment === segment).reduce((sum, row) => sum + parseMoney(row["Total Enrolled Debt"]), 0);
    return { segment, value, ...SEGMENTS[segment] };
  }).filter((item) => item.value > 0);
  const total = items.reduce((sum, item) => sum + item.value, 0);

  return (
    <section className="card-pad">
      <h2 className="font-semibold text-white">Debt Composition</h2>
      <div className="mt-5 flex h-6 overflow-hidden rounded-full bg-neutral-900">
        {items.map((item) => <div key={item.segment} title={`${item.label}: ${formatMoney(item.value)}`} style={{ width: `${total ? (item.value / total) * 100 : 0}%`, background: item.color }} />)}
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-3">
        {items.map((item) => (
          <div key={item.segment} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2 text-neutral-300"><span className="h-2.5 w-2.5 rounded-full" style={{ background: item.color }} />{item.label}</span>
            <span className="text-muted">{formatMoney(item.value)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
