"use client";

import { formatMoney, parseMoney } from "@/lib/money";
import type { LifecycleClient } from "@/lib/types";

export function KeyInsights({ rows }: { rows: LifecycleClient[] }) {
  const cancelled = rows.filter((row) => row._segment.includes("cancelled"));
  const noPay = rows.filter((row) => row._segment === "no_pay_cancelled").length;
  const early = rows.filter((row) => row._segment === "paid_1_2_cancelled").length;
  const earlyDebt = rows.filter((row) => ["no_pay_cancelled", "paid_1_2_cancelled"].includes(row._segment)).reduce((sum, row) => sum + parseMoney(row["Total Enrolled Debt"]), 0);
  const byReason = new Map<string, number>();
  const byState = new Map<string, { total: number; cancelled: number }>();
  for (const row of rows) {
    const state = String(row.State ?? "Unknown");
    const status = byState.get(state) ?? { total: 0, cancelled: 0 };
    status.total += 1;
    status.cancelled += row._segment.includes("cancelled") ? 1 : 0;
    byState.set(state, status);
    if (row._segment.includes("cancelled")) {
      const reason = String(row["Cancellation Reasons"] ?? "Unknown") || "Unknown";
      byReason.set(reason, (byReason.get(reason) ?? 0) + 1);
    }
  }
  const topReason = Array.from(byReason.entries()).sort((a, b) => b[1] - a[1])[0] ?? ["-", 0];
  const topState = Array.from(byState.entries()).sort((a, b) => (b[1].cancelled / b[1].total) - (a[1].cancelled / a[1].total))[0];

  return (
    <section className="card-pad">
      <h2 className="font-semibold text-white">Key Insights</h2>
      <ul className="mt-4 grid gap-2 text-sm text-neutral-300">
        <li>{rows.length ? Math.round((noPay / rows.length) * 100) : 0}% of clients cancel without making a single payment.</li>
        <li>{cancelled.length ? Math.round(((noPay + early) / cancelled.length) * 100) : 0}% of cancellations happen in the first 2 months.</li>
        <li>{formatMoney(earlyDebt)} in enrolled debt was lost to early cancellations.</li>
        <li>Top cancellation reason: {topReason[0]} ({topReason[1]} clients).</li>
        <li>State with highest cancel rate: {topState ? `${topState[0]} (${Math.round((topState[1].cancelled / topState[1].total) * 100)}%)` : "-"}.</li>
      </ul>
    </section>
  );
}
