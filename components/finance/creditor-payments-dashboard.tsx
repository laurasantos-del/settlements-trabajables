"use client";

import { useMemo, useState } from "react";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Bars } from "@/components/ui/charts";
import { DataTable } from "@/components/ui/data-table";
import { ApiStatus } from "@/components/ui/api-status";
import { DateRangePicker, formatDateRange, thisMonthRange } from "@/components/ui/date-range-picker";
import { useReports } from "@/lib/data-store";
import { activeSettlementsCount } from "@/lib/metrics/finance-metrics";
import { formatMoney, parseMoney } from "@/lib/money";
import { isInDateRange } from "@/lib/utils";
import { Header } from "./client-deposit-dashboard";

export function CreditorPaymentsDashboard() {
  const { store, loading, error, reload } = useReports();
  const [defaultStart, defaultEnd] = useMemo(() => thisMonthRange(), []);
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const showing = `Showing: ${formatDateRange(startDate, endDate)}`;
  const rows = (store.settlementPayments ?? []).filter((row) => isInDateRange(String(row["Due Date"] ?? ""), startDate, endDate));
  const currentOrPrevious = rows;
  const legal = rows.filter((row) => /legal|attorney|litigation|law/i.test(String(row["Current Creditor"] ?? row.Status ?? "")));

  return (
    <div className="grid gap-6">
      <section className="grid gap-4 xl:grid-cols-[1fr_auto]">
        <Header title="Pagos al Acreedor" subtitle="Active settlements, outbound money and legal exposure." />
        <DateRangePicker startDate={startDate} endDate={endDate} defaultStartDate={defaultStart} defaultEndDate={defaultEnd} onChange={(start, end) => { setStartDate(start); setEndDate(end); }} />
      </section>
      <ApiStatus loading={loading} error={error} retry={reload} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard kpi={{ title: "Active Settlements", value: activeSettlementsCount(rows), subtitle: showing, tone: "positive" }} />
        <KpiCard kpi={{ title: "Money Going Out", value: currentOrPrevious.reduce((s, r) => s + Math.abs(parseMoney(r.Amount)), 0), subtitle: showing, tone: "warning" }} />
        <KpiCard kpi={{ title: "Creditor Payments", value: rows.length, subtitle: `${formatMoney(rows.reduce((s, r) => s + Math.abs(parseMoney(r.Amount)), 0))} · ${showing}`, tone: "warning" }} />
        <KpiCard kpi={{ title: "Legal Accounts", value: legal.length, subtitle: `${formatMoney(legal.reduce((s, r) => s + parseMoney(r["Total Debt"]), 0))} · ${showing}`, tone: "danger" }} />
      </div>
      <div className="card-pad"><h2 className="font-semibold text-white">Payments by status</h2><Bars data={[{ label: "Paid/Y", value: rows.filter((r) => r["Payment Status"] === "Y").length }, { label: "Scheduled/N", value: rows.filter((r) => r["Payment Status"] !== "Y").length }]} /></div>
      <DataTable title="Creditor Payment Schedule" subtitle={showing} rows={rows} columns={[
        { key: "Client ID", label: "Client" },
        { key: "Current Creditor", label: "Creditor" },
        { key: "Due Date", label: "Due Date" },
        { key: "Amount", label: "Amount", render: (row) => formatMoney(Math.abs(parseMoney(row.Amount))) },
        { key: "Payment Status", label: "Status" }
      ]} />
    </div>
  );
}
