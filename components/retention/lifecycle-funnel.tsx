"use client";

import { formatMoney, parseMoney } from "@/lib/money";
import type { LifecycleClient } from "@/lib/types";

function node(label: string, rows: LifecycleClient[]) {
  return {
    label,
    count: rows.length,
    debt: rows.reduce((sum, row) => sum + parseMoney(row["Total Enrolled Debt"]), 0)
  };
}

export function LifecycleFunnel({ rows }: { rows: LifecycleClient[] }) {
  const nodes = [
    node("Enrolled", rows),
    node("Never Paid", rows.filter((row) => row._segment === "no_pay_cancelled" || row._segment === "no_pay_active")),
    node("Paid", rows.filter((row) => !["no_pay_cancelled", "no_pay_active"].includes(row._segment))),
    node("Active", rows.filter((row) => row._segment === "active_paying")),
    node("Cancelled", rows.filter((row) => row._segment.includes("cancelled"))),
    node("Graduated", rows.filter((row) => row._segment === "graduated"))
  ];

  return (
    <section className="card-pad">
      <h2 className="font-semibold text-white">Lifecycle Funnel</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {nodes.map((item) => (
          <article key={item.label} className="rounded-xl border border-border bg-neutral-950 p-4">
            <p className="label">{item.label}</p>
            <div className="mt-2 text-2xl font-bold text-white">{item.count}</div>
            <p className="mt-1 text-xs text-muted">{formatMoney(item.debt)}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
