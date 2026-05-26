"use client";

import { DataTable } from "@/components/ui/data-table";
import { formatMoney, formatPercent } from "@/lib/money";
import { salesRepPerformance } from "@/lib/metrics/retention-metrics";
import type { LifecycleClient } from "@/lib/types";

export function SalesRepTable({ rows }: { rows: LifecycleClient[] }) {
  const data = salesRepPerformance(rows);
  const top = data.filter((row) => row.rep !== "Unassigned").sort((a, b) => b.retainedPct - a.retainedPct)[0];
  const needs = data.filter((row) => row.rep !== "Unassigned" && row.cancelPct > 30).sort((a, b) => b.cancelPct - a.cancelPct)[0];
  const unassigned = data.find((row) => row.rep === "Unassigned")?.total ?? 0;

  return (
    <div className="grid gap-4">
      <DataTable title="Sales Rep Performance" rows={data} columns={[
        { key: "rep", label: "Sales Rep" },
        { key: "total", label: "Total" },
        { key: "active", label: "Active" },
        { key: "noPayCancel", label: "No-pay Cancel" },
        { key: "earlyCancel", label: "Early Cancel" },
        { key: "lateCancel", label: "Late Cancel" },
        { key: "graduated", label: "Graduated" },
        { key: "cancelPct", label: "Cancel %", render: (row) => formatPercent(Number(row.cancelPct)) },
        { key: "avgMonths", label: "Avg Months", render: (row) => Number(row.avgMonths).toFixed(1) },
        { key: "debt", label: "Debt Managed", render: (row) => formatMoney(row.debt) },
        { key: "retainedPct", label: "Debt Retained %", render: (row) => formatPercent(Number(row.retainedPct)) }
      ]} />
      <section className="card-pad grid gap-2 text-sm text-neutral-300">
        <p>Top performer: {top ? `${top.rep} - ${formatPercent(top.retainedPct)} retention, ${formatMoney(top.debt)} managed` : "-"}</p>
        <p>Needs attention: {needs ? `${needs.rep} - ${formatPercent(needs.cancelPct)} cancel rate` : "No rep above 30% cancel rate"}</p>
        <p>{unassigned} clients have no assigned sales rep.</p>
      </section>
    </div>
  );
}
