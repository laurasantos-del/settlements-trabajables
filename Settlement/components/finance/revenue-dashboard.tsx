"use client";

import { useMemo, useState } from "react";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Bars } from "@/components/ui/charts";
import { DataTable } from "@/components/ui/data-table";
import { ApiStatus } from "@/components/ui/api-status";
import { DateRangePicker, formatDateRange, thisMonthRange } from "@/components/ui/date-range-picker";
import { useReports } from "@/lib/data-store";
import { parseMoney, formatMoney } from "@/lib/money";
import { isInDateRange } from "@/lib/utils";
import { Header } from "./client-deposit-dashboard";

export function RevenueDashboard() {
  const { store, loading, error, reload } = useReports();
  const [defaultStart, defaultEnd] = useMemo(() => thisMonthRange(), []);
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const showing = `Showing: ${formatDateRange(startDate, endDate)}`;
  const cleared = (store.paymentsCleared ?? []).filter((row) => isInDateRange(String(row["Date Cleared"] ?? ""), startDate, endDate));
  const activeInteractions = (store.clientInteractions ?? []).filter((row) => String(row["Client Status"]).toLowerCase() === "active");
  const expected = activeInteractions.reduce((s, r) => s + parseMoney(r["Settlement Fee"]), 0);
  const received = cleared.reduce((s, r) => s + parseMoney(r["Draft Amount"] ?? r.Amount), 0);
  const difference = received - expected;
  const rate = expected ? (received / expected) * 100 : 0;
  return (
    <div className="grid gap-6">
      <section className="grid gap-4 xl:grid-cols-[1fr_auto]">
        <Header title="Revenue" subtitle="Received revenue vs expected revenue and collection variance." />
        <DateRangePicker startDate={startDate} endDate={endDate} defaultStartDate={defaultStart} defaultEndDate={defaultEnd} onChange={(start, end) => { setStartDate(start); setEndDate(end); }} />
      </section>
      <ApiStatus loading={loading} error={error} retry={reload} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard kpi={{ title: "Total Expected", value: expected, subtitle: showing, tone: "info" }} />
        <KpiCard kpi={{ title: "Total Received", value: received, subtitle: showing, tone: "positive" }} />
        <KpiCard kpi={{ title: "Difference", value: difference, subtitle: showing, tone: difference >= 0 ? "positive" : "danger" }} />
        <KpiCard kpi={{ title: "Collection Rate", value: `${Math.round(rate)}%`, subtitle: showing, tone: rate >= 80 ? "positive" : "warning" }} />
      </div>
      <div className="card-pad"><h2 className="font-semibold text-white">Expected vs Received</h2><Bars data={[{ label: "Expected", value: expected }, { label: "Received", value: received }]} /></div>
      <DataTable title="Payments Cleared" subtitle={showing} rows={cleared} columns={[
        { key: "Name", label: "Name" },
        { key: "Draft Amount", label: "Draft Amount", render: (row) => formatMoney(row["Draft Amount"] ?? row.Amount) },
        { key: "Retainer Amount", label: "Retainer", render: (row) => formatMoney(row["Retainer Amount"]) },
        { key: "Service Fee", label: "Service Fee", render: (row) => formatMoney(row["Service Fee"]) },
        { key: "Date Cleared", label: "Date Cleared" }
      ]} />
    </div>
  );
}
