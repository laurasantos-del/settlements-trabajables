import { daysBetween, isSameMonth } from "@/lib/dates";
import { parseMoney } from "@/lib/money";
import type { Kpi, RawRecord, ReportStore } from "@/lib/types";

const noPossibleStatuses = new Set(["S40_Account Ineligible", "S50_Offer Reject", "Remove Debt - Pending", "Add Debt - Pending", "REMOVEPEND", "ADDPEND"]);

export function settlementOverviewKpis(store: ReportStore): Kpi[] {
  const creditorStatus = store.creditorStatus ?? [];
  const payments = store.settlementPayments ?? [];
  const monthly = (store.settlementsPerDate ?? []).filter((row) => isSameMonth(row["Settlement Letter Date"]));
  const activeIds = new Set(payments.filter((row) => row["Payment Status"] === "Y" && daysBetween(row["Due Date"]) <= 60).map((row) => String(row["Client ID"])));
  return [
    { title: "Negociables", value: negotiableAccountsCount(store), tone: "warning" },
    { title: "Settlements Activos", value: activeIds.size, tone: "positive" },
    { title: "En Alerta", value: payments.filter((row) => row["Payment Status"] !== "Y" && daysBetween(row["Due Date"]) > 15).length, tone: "danger" },
    { title: "Settlements Este Mes", value: monthly.length, tone: "positive" },
    { title: "Broken", value: creditorStatus.filter((row) => row["Creditor Status"] === "S99_Broken Settlment").length, tone: "danger" },
    { title: "No Posibles", value: creditorStatus.filter((row) => noPossibleStatuses.has(String(row["Creditor Status"]))).length, tone: "warning" }
  ];
}

export function negotiableAccountsCount(store: ReportStore, percentage = 0.55): number {
  const settlements = store.settlements ?? [];
  const countRow = settlements.find((row) => typeof row.count === "number");
  if (countRow?.count !== undefined) return Number(countRow.count);
  // Only count records with a valid numeric clientId (filter scraper garbage)
  const validClients = settlements.filter((row) => /^\d+$/.test(String(row.clientId ?? row["Client ID"] ?? "")));
  if (validClients.length) return validClients.length;

  const interactions = new Map((store.clientInteractions ?? []).map((row) => [String(row["Client ID"]), row]));
  return (store.creditorStatus ?? [])
    .filter((row) => ["INC", "LXNOINC"].includes(String(row["Creditor Status"])))
    .filter((row) => {
      const interaction = interactions.get(String(row["Client ID"]));
      const escrow = parseMoney(interaction?.["CFTPay Escrow Balance"] ?? interaction?.["Company Bank Balance"]);
      const debt = parseMoney(row["Total Debt"] ?? row["Balance Current"]) || 5000;
      return escrow >= debt * percentage;
    }).length;
}

export function creditorStatusCounts(rows: RawRecord[], debtMap?: Map<string, number>): { status: string; accounts: number; clients: number; debt: number }[] {
  const groups = new Map<string, RawRecord[]>();
  for (const row of rows) {
    const status = String(row["Creditor Status"] ?? "No Status");
    groups.set(status, [...(groups.get(status) ?? []), row]);
  }
  return Array.from(groups.entries()).map(([status, items]) => ({
    status,
    accounts: items.length,
    clients: new Set(items.map((row) => row["Client ID"])).size,
    debt: items.reduce((sum, row) => {
      const fromMap = debtMap?.get(String(row["Client ID"]));
      return sum + (fromMap ?? parseMoney(row["Total Debt"] ?? row["Balance Current"]));
    }, 0)
  }));
}

export function monthlySettlements(rows: RawRecord[]): RawRecord[] {
  return rows.filter((row) => isSameMonth(row["Settlement Letter Date"]));
}

export function noPossibleRows(rows: RawRecord[]): RawRecord[] {
  return rows.filter((row) => noPossibleStatuses.has(String(row["Creditor Status"])));
}

export function brokenRows(rows: RawRecord[]): RawRecord[] {
  return rows.filter((row) => row["Creditor Status"] === "S99_Broken Settlment");
}
