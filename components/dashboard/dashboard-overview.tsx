"use client";

import { useMemo, useState } from "react";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { DonutChart, GroupedBars } from "@/components/ui/charts";
import { DataTable } from "@/components/ui/data-table";
import { ApiStatus } from "@/components/ui/api-status";
import { DateRangePicker, formatDateRange, todayRange } from "@/components/ui/date-range-picker";
import { Badge } from "@/components/ui/badge";
import { useReports } from "@/lib/data-store";
import { dateKey, daysBetween } from "@/lib/dates";
import { negotiableAccountsCount } from "@/lib/metrics/settlement-metrics";
import { formatMoney, parseMoney } from "@/lib/money";
import type { RawRecord } from "@/lib/types";
import { clientStatus, isInDateRange, reconciliationCategory, reconciliationTone } from "@/lib/utils";

const noPossibleStatuses = new Set(["S40_Account Ineligible", "S50_Offer Reject", "REMOVEPEND", "ADDPEND", "VOIDED"]);

function statusColor(status: string): string {
  if (status === "Active") return "#22c55e";
  if (/cancel/i.test(status)) return "#ef4444";
  if (/nsf/i.test(status)) return "#f97316";
  if (/graduated/i.test(status)) return "#3b82f6";
  if (/on hold/i.test(status)) return "#eab308";
  return "#6b7280";
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short" }).format(new Date(year, month - 1, 1));
}

function lastSixMonths(): string[] {
  const now = new Date();
  return Array.from({ length: 6 }, (_, index) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
    return monthKey(d);
  });
}

function fullName(row: RawRecord): string {
  return `${row.Firstname ?? row["First Name"] ?? ""} ${row.Lastname ?? row["Last Name"] ?? ""}`.trim() || String(row["Client ID"] ?? row.Client_ID ?? "-");
}

export function DashboardOverview() {
  const { store, loading, error, reload } = useReports();
  const [defaultStart, defaultEnd] = useMemo(() => todayRange(), []);
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const rangeLabel = formatDateRange(startDate, endDate);
  const showing = `Showing: ${rangeLabel}`;

  const interactions = store.clientInteractions ?? [];
  const enrollments = store.newEnrollments ?? [];
  const expectedPayments = store.expectedClientPayments ?? [];
  const settlementPayments = store.settlementPayments ?? [];
  const creditorStatus = store.creditorStatus ?? [];
  const settlementsPerDate = store.settlementsPerDate ?? [];
  const paymentsCleared = store.paymentsCleared ?? [];

  const qaEnrollments = interactions.filter((row) =>
    String(row["Last Note"] ?? "").toLowerCase().includes("qa - completado") &&
    isInDateRange(String(row["Last Note Date"] ?? ""), startDate, endDate)
  );
  const statusDateEnrollments = enrollments.filter((row) => isInDateRange(String(row["Status Date"] ?? ""), startDate, endDate));
  const deposits = expectedPayments.filter((row) => isInDateRange(String(row["Scheduled Draft Date"] ?? ""), startDate, endDate));
  const creditorPayments = settlementPayments.filter((row) => isInDateRange(String(row["Due Date"] ?? ""), startDate, endDate));
  const cancelled = interactions.filter((row) =>
    String(row["Last Note"] ?? "").toLowerCase().includes("cancelled") &&
    isInDateRange(String(row["Last Note Date"] ?? ""), startDate, endDate)
  );

  const negotiables = negotiableAccountsCount(store);
  const brokenByStatus = creditorStatus.filter((row) => row["Creditor Status"] === "S99_Broken Settlment");
  const brokenByOverdue = settlementPayments.filter((row) => String(row["Payment Status"]) !== "Y" && daysBetween(row["Due Date"]) > 30);
  const brokenIds = new Set([...brokenByStatus, ...brokenByOverdue].map((row) => String(row["Client ID"])).filter(Boolean));

  const statusCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of interactions) {
      const status = clientStatus(row);
      if (!status) continue;
      counts.set(status, (counts.get(status) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([label, value]) => ({ label, value, color: statusColor(label) }))
      .sort((a, b) => b.value - a.value);
  }, [interactions]);

  const monthlyBars = useMemo(() => {
    const months = lastSixMonths();
    return months.map((month) => ({
      label: monthLabel(month),
      deposits: expectedPayments
        .filter((row) => String(row["Scheduled Draft Date"] ?? "").startsWith(month))
        .reduce((sum, row) => sum + parseMoney(row.Amount), 0),
      creditorPayments: settlementPayments
        .filter((row) => String(row["Due Date"] ?? "").startsWith(month))
        .reduce((sum, row) => sum + Math.abs(parseMoney(row.Amount)), 0)
    }));
  }, [expectedPayments, settlementPayments]);

  const active = interactions.filter((row) => clientStatus(row) === "Active");
  const nsf = interactions.filter((row) => ["NSF", "NSF - First Payment"].includes(clientStatus(row)));
  const onHold = interactions.filter((row) => clientStatus(row) === "On Hold");
  const waiting = interactions.filter((row) => clientStatus(row) === "Waiting for first payment");
  const feeExpected = active.reduce((sum, row) => sum + parseMoney(row["Settlement Fee"]), 0);
  const currentMonth = dateKey().slice(0, 7);
  const clearedMonth = paymentsCleared.filter((row) => String(row["Date Cleared"] ?? "").startsWith(currentMonth));

  const futureRows = creditorStatus.filter((row) => ["INC", "LXNOINC"].includes(String(row["Creditor Status"])));
  const noPossible = creditorStatus.filter((row) => noPossibleStatuses.has(String(row["Creditor Status"])));
  const monthlySettlements = settlementsPerDate.filter((row) => String(row["Settlement Letter Date"] ?? "").startsWith(currentMonth));

  const criticalAlerts = settlementPayments
    .filter((row) => String(row["Payment Status"]) !== "Y")
    .map((row) => {
      const days = daysBetween(row["Due Date"]);
      return { ...row, days, category: reconciliationCategory(days) };
    })
    .filter((row) => row.days >= 1)
    .sort((a, b) => b.days - a.days)
    .slice(0, 10);

  const kpis = [
    {
      title: "New Enrollments",
      value: qaEnrollments.length + statusDateEnrollments.length,
      subtitle: `${rangeLabel} · QA: ${qaEnrollments.length} · Status Date: ${statusDateEnrollments.length}`,
      tone: "positive" as const
    },
    {
      title: "Client Deposits",
      value: deposits.length,
      subtitle: `${rangeLabel} · ${formatMoney(deposits.reduce((sum, row) => sum + parseMoney(row.Amount), 0))}`,
      tone: "info" as const
    },
    {
      title: "Creditor Payments",
      value: creditorPayments.length,
      subtitle: `${rangeLabel} · ${formatMoney(creditorPayments.reduce((sum, row) => sum + Math.abs(parseMoney(row.Amount)), 0))}`,
      tone: "warning" as const
    },
    {
      title: "Clients Cancelled",
      value: cancelled.length,
      subtitle: rangeLabel,
      tone: "danger" as const
    },
    {
      title: "Negociables",
      value: negotiables,
      subtitle: "Escrow covers settlement options",
      tone: "warning" as const
    },
    {
      title: "Broken Settlements",
      value: brokenIds.size,
      subtitle: `S99: ${brokenByStatus.length} · Sin Y 30d+: ${new Set(brokenByOverdue.map((row) => String(row["Client ID"]))).size}`,
      tone: "danger" as const
    }
  ];

  const financeMini = [
    { title: "Activos", value: active.length, tone: "positive" as const },
    { title: "NSF", value: nsf.length, tone: "danger" as const },
    { title: "On Hold", value: onHold.length, tone: "warning" as const },
    { title: "Waiting", value: waiting.length, tone: "neutral" as const },
    { title: "Fee Esperado", value: feeExpected, tone: "warning" as const },
    { title: "Cleared Mes", value: clearedMonth.reduce((sum, row) => sum + parseMoney(row["Draft Amount"]), 0), subtitle: `${clearedMonth.length} pagos`, tone: "positive" as const }
  ];

  const settlementMini = [
    { title: "Negociables", value: negotiables, tone: "warning" as const },
    { title: "Creditor Status", value: creditorStatus.length, tone: "info" as const },
    { title: "Settlements Mes", value: monthlySettlements.length, tone: "positive" as const },
    { title: "Futuros", value: futureRows.length, tone: "info" as const },
    { title: "No Posibles", value: noPossible.length, tone: "warning" as const },
    { title: "Rotos", value: brokenByStatus.length, tone: "danger" as const }
  ];

  return (
    <div className="grid gap-6">
      <section className="grid gap-4 xl:grid-cols-[1fr_auto]">
        <div>
          <p className="label">Executive summary</p>
          <h1 className="mt-2 text-3xl font-bold text-white">Settlements CRM</h1>
          <p className="mt-2 text-muted">
            {new Date().toLocaleDateString("es-ES", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
        <DateRangePicker startDate={startDate} endDate={endDate} defaultStartDate={defaultStart} defaultEndDate={defaultEnd} onChange={(start, end) => { setStartDate(start); setEndDate(end); }} />
      </section>

      <ApiStatus loading={loading} error={error} retry={reload} />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        {kpis.map((kpi) => <KpiCard key={kpi.title} kpi={kpi} />)}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="card-pad">
          <h2 className="font-semibold text-white">Clients by Status</h2>
          <p className="mt-1 text-xs text-muted">{showing}</p>
          <DonutChart data={statusCounts.slice(0, 10)} />
        </div>
        <div className="card-pad">
          <h2 className="font-semibold text-white">Deposits vs Creditor Payments</h2>
          <p className="mt-1 text-xs text-muted">Last 6 months</p>
          <GroupedBars data={monthlyBars} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-semibold text-white">Finance Summary</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          {financeMini.map((kpi) => <KpiCard key={kpi.title} kpi={kpi} />)}
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-semibold text-white">Settlements Summary</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          {settlementMini.map((kpi) => <KpiCard key={kpi.title} kpi={kpi} />)}
        </div>
      </section>

      <DataTable title="Alertas críticas del día" subtitle={showing} rows={criticalAlerts} columns={[
        { key: "Client ID", label: "Cliente", render: fullName },
        { key: "Current Creditor", label: "Acreedor" },
        { key: "days", label: "Días vencido" },
        { key: "Amount", label: "Monto", render: (row) => formatMoney(Math.abs(parseMoney(row.Amount))) },
        { key: "category", label: "Categoría", render: (row) => <Badge tone={reconciliationTone(String(row.category))}>{String(row.category || "-")}</Badge> }
      ]} />
    </div>
  );
}
