"use client";

import { useMemo, useState } from "react";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { DataTable } from "@/components/ui/data-table";
import { ApiStatus } from "@/components/ui/api-status";
import { DateRangePicker, formatDateRange, lastMonthsRange } from "@/components/ui/date-range-picker";
import { useReports } from "@/lib/data-store";
import { reconciliationAlerts } from "@/lib/metrics/finance-metrics";
import { formatMoney } from "@/lib/money";
import { isInDateRange } from "@/lib/utils";
import { Header } from "./client-deposit-dashboard";

export function ReconciliationAlerts() {
  const { store, loading, error, reload } = useReports();
  const [defaultStart, defaultEnd] = useMemo(() => lastMonthsRange(3), []);
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const showing = `Showing: ${formatDateRange(startDate, endDate)}`;
  const alerts = reconciliationAlerts((store.settlementPayments ?? []).filter((row) => isInDateRange(String(row["Due Date"] ?? ""), startDate, endDate)));
  return (
    <div className="grid gap-6">
      <section className="grid gap-4 xl:grid-cols-[1fr_auto]">
        <Header title="Alertas de Reconciliación" subtitle="Creditor payments that are too long without Y." />
        <DateRangePicker startDate={startDate} endDate={endDate} defaultStartDate={defaultStart} defaultEndDate={defaultEnd} onChange={(start, end) => { setStartDate(start); setEndDate(end); }} />
      </section>
      <ApiStatus loading={loading} error={error} retry={reload} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard kpi={{ title: "Total Alerts", value: alerts.length, subtitle: showing, tone: "danger" }} />
        <KpiCard kpi={{ title: "Alerta Media", value: alerts.filter((r) => r.category.startsWith("Alerta")).length, subtitle: showing, tone: "warning" }} />
        <KpiCard kpi={{ title: "Posible Broken", value: alerts.filter((r) => r.category.startsWith("Posible")).length, subtitle: showing, tone: "warning" }} />
        <KpiCard kpi={{ title: "Broken Settlements", value: alerts.filter((r) => r.category.startsWith("Broken")).length, subtitle: showing, tone: "danger" }} />
      </div>
      <DataTable title="Reconciliation Alerts" subtitle={showing} rows={alerts} columns={[
        { key: "Client ID", label: "Cliente" },
        { key: "Current Creditor", label: "Acreedor" },
        { key: "Due Date", label: "Fecha pago" },
        { key: "days", label: "Días sin Y" },
        { key: "Amount", label: "Amount", render: (row) => formatMoney(row.Amount) },
        { key: "category", label: "Categoría" }
      ]} />
    </div>
  );
}
