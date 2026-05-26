"use client";

import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { SEGMENTS } from "@/lib/metrics/retention-metrics";
import { formatMoney } from "@/lib/money";
import type { LifecycleClient } from "@/lib/types";

export function ClientDetailTable({ rows }: { rows: LifecycleClient[] }) {
  return (
    <DataTable title="Client Detail" rows={rows} columns={[
      { key: "Name", label: "Name", render: (row) => `${row["First Name"] ?? ""} ${row["Last Name"] ?? ""}`.trim() },
      { key: "Client Status", label: "Status", render: (row) => <Badge tone={String(row["Client Status"]).includes("Cancel") ? "danger" : String(row["Client Status"]).includes("Graduated") ? "info" : "positive"}>{String(row["Client Status"] ?? "-")}</Badge> },
      { key: "_segment", label: "Segment", render: (row) => <span className="rounded-full px-2.5 py-1 text-xs font-semibold text-neutral-950" style={{ background: SEGMENTS[row._segment as keyof typeof SEGMENTS]?.color ?? "#6b7280" }}>{SEGMENTS[row._segment as keyof typeof SEGMENTS]?.label ?? row._segment}</span> },
      { key: "Enrollment Date", label: "Enrolled Date" },
      { key: "Payment Months Completed", label: "Payments Completed" },
      { key: "Total Enrolled Debt", label: "Debt", render: (row) => formatMoney(row["Total Enrolled Debt"]) },
      { key: "Sales Rep", label: "Sales Rep" },
      { key: "State", label: "State" },
      { key: "Program", label: "Program" }
    ]} />
  );
}
