"use client";

import { useMemo, useState } from "react";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Bars } from "@/components/ui/charts";
import { DataTable } from "@/components/ui/data-table";
import { ApiStatus } from "@/components/ui/api-status";
import { DateRangePicker, formatDateRange, thisMonthRange } from "@/components/ui/date-range-picker";
import { useReports } from "@/lib/data-store";
import { parseMoney, formatMoney } from "@/lib/money";
import { clientStatus, isInDateRange } from "@/lib/utils";
import { Header } from "./client-deposit-dashboard";

export function RevenueDashboard() {
  const { store, loading, error, reload } = useReports();
  const [defaultStart, defaultEnd] = useMemo(() => thisMonthRange(), []);
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const showing = `Showing: ${formatDateRange(startDate, endDate)}`;
  const currentMonth = new Date().toISOString().slice(0, 7);

  const activeInteractions = (store.clientInteractions ?? []).filter((row) => clientStatus(row) === "Active");
  const paymentsCleared = store.paymentsCleared ?? [];
  const clearedInRange = paymentsCleared.filter((row) => isInDateRange(String(row["Date Cleared"] ?? ""), startDate, endDate));
  const clearedThisMonth = paymentsCleared.filter((row) => String(row["Date Cleared"] ?? "").startsWith(currentMonth));

  const scheduledFees = activeInteractions.reduce((sum, row) => sum + parseMoney(row["Settlement Fee"]), 0);
  const collectedFees = paymentsCleared.reduce((sum, row) => sum + parseMoney(row["Service Fee Amount"] ?? row["Service Fee"]), 0);
  const clearedMonthAmount = clearedThisMonth.reduce((sum, row) => sum + parseMoney(row["Draft Amount"]), 0);

  return (
    <div className="grid gap-6">
      <section className="grid gap-4 xl:grid-cols-[1fr_auto]">
        <Header title="Revenue" subtitle="Fees scheduled, fees cleared and payment clearing activity." />
        <DateRangePicker startDate={startDate} endDate={endDate} defaultStartDate={defaultStart} defaultEndDate={defaultEnd} onChange={(start, end) => { setStartDate(start); setEndDate(end); }} />
      </section>
      <ApiStatus loading={loading} error={error} retry={reload} />

      <section className="rounded-xl border border-yellow-700 bg-yellow-950/40 p-4 text-sm text-yellow-100">
        ⚠️ Reporte de Commissions no disponible para el usuario actual (comm plan is invalid). Contacta al administrador de DebtManager.
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <KpiCard kpi={{ title: "Fees Agendados (por cobrar)", value: scheduledFees, subtitle: `${activeInteractions.length} clientes Active`, tone: "warning" }} />
        <KpiCard kpi={{ title: "Fees Cobrados (cleared)", value: collectedFees, subtitle: "Service Fee Amount", tone: "positive" }} />
        <KpiCard kpi={{ title: "Pagos Cleared este mes", value: clearedMonthAmount, subtitle: `${clearedThisMonth.length} pagos · ${currentMonth}`, tone: "info" }} />
      </div>

      <div className="card-pad">
        <h2 className="font-semibold text-white">Scheduled vs Cleared Fees</h2>
        <Bars data={[{ label: "Scheduled", value: scheduledFees, color: "#f97316" }, { label: "Cleared", value: collectedFees, color: "#22c55e" }]} />
      </div>

      <DataTable title="Payments Cleared" subtitle={showing} rows={clearedInRange} columns={[
        { key: "Name", label: "Name" },
        { key: "Draft Amount", label: "Draft Amount", render: (row) => formatMoney(row["Draft Amount"] ?? row.Amount) },
        { key: "Service Fee Amount", label: "Service Fee", render: (row) => formatMoney(row["Service Fee Amount"] ?? row["Service Fee"]) },
        { key: "Date Cleared", label: "Date Cleared" },
        { key: "Client Status", label: "Client Status" }
      ]} />
    </div>
  );
}
