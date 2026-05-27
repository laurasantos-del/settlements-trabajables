import { dateKey } from "@/lib/dates";
import { negotiableAccountsCount } from "@/lib/metrics/settlement-metrics";
import { formatMoney, parseMoney } from "@/lib/money";
import type { Kpi, RawRecord, ReportStore } from "@/lib/types";
import { isInDateRange } from "@/lib/utils";

function statusOf(row: RawRecord): string {
  return String(row["Client Status"] ?? row.Client_Status ?? "").trim();
}

export function dashboardKpis(store: ReportStore, range: { start: string; end: string } = { start: dateKey(), end: dateKey() }): Kpi[] {
  const enrollments = store.newEnrollments ?? [];
  const interactions = store.clientInteractions ?? [];
  const expected = store.expectedClientPayments ?? [];
  const settlements = store.settlementPayments ?? [];

  const todayEnrollments = enrollments.filter((row) => isInDateRange(String(row["Status Date"] ?? ""), range.start, range.end));
  const qaCompleted = interactions.filter((row) => {
    const note = String(row["Last Note"] ?? "").toLowerCase();
    return note.includes("qa - completado") && isInDateRange(String(row["Last Note Date"] ?? ""), range.start, range.end);
  });
  const totalDebt = enrollments.reduce((sum, row) => sum + parseMoney(row["Total Debt"]), 0);
  const depositsToday = expected.filter((row) => String(row["Payment Status"]).trim() === "Scheduled" && isInDateRange(String(row["Scheduled Draft Date"] ?? ""), range.start, range.end));
  const creditorToday = settlements.filter((row) => isInDateRange(String(row["Due Date"] ?? ""), range.start, range.end));
  const cancelledToday = interactions.filter((row) => {
    const note = String(row["Last Note"] ?? "").toLowerCase();
    return note.includes("cancelled") && isInDateRange(String(row["Last Note Date"] ?? ""), range.start, range.end);
  });

  return [
    { title: "New Enrollments", value: todayEnrollments.length + qaCompleted.length, subtitle: "QA completado + Status Date en rango", tone: "positive" },
    { title: "Total Enrolled Debt", value: totalDebt, subtitle: "Suma de Total Debt", tone: "info" },
    { title: "Client Deposits", value: depositsToday.length, subtitle: `Amount: ${formatMoney(depositsToday.reduce((s, r) => s + parseMoney(r.Amount), 0))}`, tone: "warning" },
    { title: "Creditor Payments", value: creditorToday.length, subtitle: `Amount: ${formatMoney(creditorToday.reduce((s, r) => s + Math.abs(parseMoney(r.Amount)), 0))}`, tone: "warning" },
    { title: "Clients Cancelled", value: cancelledToday.length, subtitle: "Last Note contains Cancelled", tone: "danger" },
    { title: "Negotiables", value: negotiableAccountsCount(store), subtitle: "Escrow covers estimated settlement", tone: "warning" }
  ];
}

export function clientStatusCounts(records: RawRecord[]): { label: string; value: number }[] {
  const counts = new Map<string, number>();
  for (const row of records) {
    const status = statusOf(row);
    if (!status) continue;
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}
