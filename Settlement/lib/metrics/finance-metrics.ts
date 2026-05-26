import { daysBetween, isSameDay, parseDate } from "@/lib/dates";
import { formatMoney, parseMoney } from "@/lib/money";
import type { Kpi, RawRecord, ReportStore } from "@/lib/types";

export function financeOverviewKpis(store: ReportStore): Kpi[] {
  const interactions = store.clientInteractions ?? [];
  const settlements = store.settlementPayments ?? [];
  const summary = store.summaryReport?.[0] ?? {};
  const clearedToday = (store.paymentsCleared ?? []).filter((row) => isSameDay(row["Date Cleared"]));
  const active = interactions.filter((row) => row["Client Status"] === "Active").length;
  const nsf = interactions.filter((row) => String(row["Client Status"]).toLowerCase().includes("nsf")).length;
  const activeSettlements = activeSettlementsCount(settlements);
  const todayPayments = settlements.filter((row) => isSameDay(row["Due Date"]));
  return [
    { title: "Total Clients", value: parseMoney(summary["Client Count - Number of clients that have signed contract"]) || active, tone: "info" },
    { title: "Active Clients", value: active, subtitle: `NSF: ${nsf}`, tone: "positive" },
    { title: "Active Settlements", value: activeSettlements, subtitle: `Cleared today: ${clearedToday.length}`, tone: "positive" },
    { title: "Creditor Payments Today", value: todayPayments.length, subtitle: formatMoney(todayPayments.reduce((s, r) => s + Math.abs(parseMoney(r.Amount)), 0)), tone: "warning" }
  ];
}

export function clientDepositKpis(store: ReportStore): Kpi[] {
  const interactions = store.clientInteractions ?? [];
  const statusCount = (status: string) => interactions.filter((row) => String(row["Client Status"]).toLowerCase() === status.toLowerCase()).length;
  return [
    { title: "Active", value: statusCount("Active"), tone: "positive" },
    { title: "NSF", value: interactions.filter((row) => String(row["Client Status"]).toLowerCase().includes("nsf")).length, tone: "danger" },
    { title: "On Hold", value: statusCount("On Hold"), tone: "warning" },
    { title: "Promised to Pay", value: statusCount("Promised to Pay"), tone: "info" },
    { title: "Waiting First Payment", value: statusCount("Waiting for first payment"), tone: "neutral" }
  ];
}

export function scheduledDepositGroups(rows: RawRecord[]): { past: RawRecord[]; today: RawRecord[]; future: RawRecord[] } {
  const scheduled = rows.filter((row) => row["Payment Status"] === "Scheduled");
  return {
    past: scheduled.filter((row) => daysBetween(row["Scheduled Draft Date"]) > 0),
    today: scheduled.filter((row) => isSameDay(row["Scheduled Draft Date"])),
    future: scheduled.filter((row) => {
      const date = parseDate(row["Scheduled Draft Date"]);
      return date ? daysBetween(date) < 0 : false;
    })
  };
}

export function activeSettlementsCount(rows: RawRecord[]): number {
  const keys = new Set<string>();
  for (const row of rows) {
    if (String(row["Payment Status"]) === "Y" && daysBetween(row["Due Date"]) <= 60) {
      keys.add(`${row["Client ID"]}-${row["Current Creditor"]}`);
    }
  }
  return keys.size;
}

export function reconciliationAlerts(rows: RawRecord[]): Array<RawRecord & { days: number; category: string }> {
  return rows
    .filter((row) => String(row["Payment Status"]) !== "Y")
    .map((row) => {
      const days = daysBetween(row["Due Date"]);
      const category =
        days > 90 ? "Broken Settlement" :
        days > 60 ? "Posible Broken" :
        days > 30 ? "Riesgo Alto" :
        days > 15 ? "Alerta Media" :
        days >= 1 ? "En seguimiento" : "";
      return { ...row, days, category };
    })
    .filter((row) => row.days >= 1);
}
