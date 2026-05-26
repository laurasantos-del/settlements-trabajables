"use client";

import { useMemo, useState } from "react";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Bars, DonutChart } from "@/components/ui/charts";
import { DataTable } from "@/components/ui/data-table";
import { ApiStatus } from "@/components/ui/api-status";
import { DateRangePicker, formatDateRange, todayRange } from "@/components/ui/date-range-picker";
import { useReports } from "@/lib/data-store";
import { dashboardKpis, clientStatusCounts } from "@/lib/metrics/dashboard-metrics";
import { formatMoney } from "@/lib/money";
import { isInDateRange } from "@/lib/utils";

export function DashboardOverview() {
  const { store, loading, error, reload } = useReports();
  const [defaultStart, defaultEnd] = useMemo(() => todayRange(), []);
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const range = { start: startDate, end: endDate };
  const showing = `Showing: ${formatDateRange(startDate, endDate)}`;
  const kpis = dashboardKpis(store, range).map((kpi) => ({ ...kpi, subtitle: kpi.subtitle ? `${kpi.subtitle} · ${showing}` : showing }));
  const statuses = clientStatusCounts(store.clientInteractions ?? []);
  const deposits = (store.expectedClientPayments ?? []).filter((row) => isInDateRange(String(row["Scheduled Draft Date"] ?? ""), startDate, endDate)).slice(0, 10);
  const creditorPayments = (store.settlementPayments ?? []).filter((row) => isInDateRange(String(row["Due Date"] ?? ""), startDate, endDate)).slice(0, 10);

  return (
    <div className="grid gap-6">
      <section className="grid gap-4 xl:grid-cols-[1fr_auto]">
        <div>
          <p className="label">Executive view</p>
          <h1 className="mt-2 text-3xl font-bold text-white">Dashboard</h1>
          <p className="mt-2 text-muted">Operational snapshot across enrollment, payments, settlements and lifecycle.</p>
        </div>
        <DateRangePicker startDate={startDate} endDate={endDate} defaultStartDate={defaultStart} defaultEndDate={defaultEnd} onChange={(start, end) => { setStartDate(start); setEndDate(end); }} />
      </section>
      <ApiStatus loading={loading} error={error} retry={reload} />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        {kpis.map((kpi) => <KpiCard key={kpi.title} kpi={kpi} />)}
      </section>
      <section className="grid gap-4 xl:grid-cols-[1fr_1.15fr]">
        <div className="card-pad">
          <h2 className="font-semibold text-white">Clients by Status</h2>
          <DonutChart data={statuses.map((row) => ({ ...row, color: row.label === "Active" ? "#22c55e" : row.label.includes("Cancelled") ? "#ef4444" : "#f97316" }))} />
        </div>
        <div className="card-pad">
          <h2 className="font-semibold text-white">Status Distribution</h2>
          <Bars data={statuses.slice(0, 10)} horizontal />
        </div>
      </section>
      <section className="grid gap-4 xl:grid-cols-2">
        <DataTable title="Client Deposits" subtitle={showing} rows={deposits} columns={[
          { key: "First Name", label: "Client", render: (row) => `${row["First Name"] ?? ""} ${row["Last Name"] ?? ""}`.trim() || "-" },
          { key: "Scheduled Draft Date", label: "Date" },
          { key: "Amount", label: "Amount", render: (row) => formatMoney(row.Amount) },
          { key: "Payment Status", label: "Status" }
        ]} />
        <DataTable title="Creditor Payments" subtitle={showing} rows={creditorPayments} columns={[
          { key: "Firstname", label: "Client", render: (row) => `${row.Firstname ?? ""} ${row.Lastname ?? ""}`.trim() || "-" },
          { key: "Current Creditor", label: "Creditor" },
          { key: "Due Date", label: "Date" },
          { key: "Amount", label: "Amount", render: (row) => formatMoney(row.Amount) }
        ]} />
      </section>
    </div>
  );
}
