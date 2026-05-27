import { parseDate } from "@/lib/dates";
import { parseMoney } from "@/lib/money";
import type { LifecycleClient, LifecycleSegment, RawRecord } from "@/lib/types";

export const SEGMENTS: Record<LifecycleSegment, { label: string; color: string }> = {
  no_pay_cancelled: { label: "Never Paid & Left", color: "#E24B4A" },
  no_pay_active: { label: "Waiting for First Payment", color: "#9FE1CB" },
  paid_1_2_cancelled: { label: "Early Cancel", color: "#F09595" },
  paid_3plus_cancelled: { label: "Late Cancel", color: "#A32D2D" },
  graduated: { label: "Graduated", color: "#378ADD" },
  active_paying: { label: "Active Paying", color: "#1D9E75" },
  other: { label: "Other", color: "#6b7280" }
};

export function segmentClient(row: RawRecord): LifecycleClient {
  const completed = parseMoney(row["Payment Months Completed"]);
  const madeFirstPayment = Boolean(String(row["First Payment Date"] ?? "").trim()) && completed > 0;
  const status = String(row["Client Status"] ?? "").toLowerCase();
  const fileStatus = String(row["File Status"] ?? "");
  const isCancelled = status.includes("cancelled");
  const isGraduated = status.includes("graduated");
  const isActive = !isCancelled && !isGraduated;
  let _segment: LifecycleSegment = "other";

  if (!madeFirstPayment && isCancelled) _segment = "no_pay_cancelled";
  else if (!madeFirstPayment && isActive) _segment = "no_pay_active";
  else if (madeFirstPayment && isCancelled && completed <= 2) _segment = "paid_1_2_cancelled";
  else if (madeFirstPayment && isCancelled && completed > 2) _segment = "paid_3plus_cancelled";
  else if (isGraduated) _segment = "graduated";
  else if (madeFirstPayment && isActive) _segment = "active_paying";

  const days = parseMoney(row["Days in Client Status"]);
  const cancellationDate = isCancelled ? new Date(Date.now() - days * 86_400_000) : undefined;
  const enrollmentDate = parseDate(row["Enrollment Date"]);
  const monthsInProgram = cancellationDate && enrollmentDate ? (cancellationDate.getTime() - enrollmentDate.getTime()) / (86_400_000 * 30) : undefined;

  return {
    ...row,
    _segment,
    _cancellationDate: cancellationDate?.toISOString().slice(0, 10),
    _monthsInProgram: monthsInProgram,
    _isFlagged: isActive && ["Pending Cancellation", "Pending Graduation", "Negative Balance"].includes(fileStatus),
    _isAtRisk: isActive && ["Skipped Payment", "Waiting for Documents", "Client at risk"].includes(fileStatus)
  };
}

export function lifecycleRows(rows: RawRecord[]): LifecycleClient[] {
  return rows.map(segmentClient);
}

export function retentionKpis(rows: LifecycleClient[]) {
  const count = (segments: LifecycleSegment[]) => rows.filter((row) => segments.includes(row._segment)).length;
  const kept = rows.filter((row) => ["active_paying", "no_pay_active", "graduated"].includes(row._segment)).reduce((sum, row) => sum + parseMoney(row["Total Enrolled Debt"]), 0);
  const lost = rows.filter((row) => row._segment.includes("cancelled")).reduce((sum, row) => sum + parseMoney(row["Total Enrolled Debt"]), 0);
  return [
    { title: "Total Enrolled", value: rows.length },
    { title: "Active & Paying", value: count(["active_paying"]) },
    { title: "Never Paid & Left", value: count(["no_pay_cancelled"]) },
    { title: "Cancelled After Paying", value: count(["paid_1_2_cancelled", "paid_3plus_cancelled"]) },
    { title: "Graduated", value: count(["graduated"]) },
    { title: "Enrolled Debt Kept", value: kept },
    { title: "Enrolled Debt Lost", value: lost }
  ];
}

export function applyLifecycleFilters(rows: LifecycleClient[], filters: Record<string, string>): LifecycleClient[] {
  return rows
    .filter((row) => !filters.segment || row._segment === filters.segment)
    .filter((row) => !filters.salesRep || String(row["Sales Rep"] || "Unassigned") === filters.salesRep)
    .filter((row) => !filters.program || String(row.Program) === filters.program)
    .filter((row) => !filters.state || String(row.State) === filters.state)
    .filter((row) => !filters.year || String(row["Enrollment Date"]).startsWith(filters.year));
}

export function salesRepPerformance(rows: LifecycleClient[]) {
  const groups = new Map<string, LifecycleClient[]>();
  for (const row of rows) {
    const raw = String(row["Sales Rep"] ?? "").trim();
    const rep = !raw || /admin|unknown/i.test(raw) ? "Unassigned" : raw;
    groups.set(rep, [...(groups.get(rep) ?? []), row]);
  }
  return Array.from(groups.entries())
    .map(([rep, items]) => {
      const cancelled = items.filter((row) => row._segment.includes("cancelled"));
      const active = items.filter((row) => row._segment === "active_paying" || row._segment === "no_pay_active");
      const graduated = items.filter((row) => row._segment === "graduated");
      const debt = items.reduce((sum, row) => sum + parseMoney(row["Total Enrolled Debt"]), 0);
      const retainedDebt = [...active, ...graduated].reduce((sum, row) => sum + parseMoney(row["Total Enrolled Debt"]), 0);
      return {
        rep,
        total: items.length,
        active: active.length,
        noPayCancel: items.filter((row) => row._segment === "no_pay_cancelled").length,
        earlyCancel: items.filter((row) => row._segment === "paid_1_2_cancelled").length,
        lateCancel: items.filter((row) => row._segment === "paid_3plus_cancelled").length,
        graduated: graduated.length,
        cancelPct: items.length ? (cancelled.length / items.length) * 100 : 0,
        avgMonths: items.filter((row) => parseMoney(row["Payment Months Completed"]) > 0).reduce((sum, row) => sum + parseMoney(row["Payment Months Completed"]), 0) / Math.max(1, items.filter((row) => parseMoney(row["Payment Months Completed"]) > 0).length),
        debt,
        retainedPct: debt ? (retainedDebt / debt) * 100 : 0
      };
    })
    .filter((row) => row.total >= 5)
    .sort((a, b) => (a.rep === "Unassigned" ? 1 : b.rep === "Unassigned" ? -1 : b.total - a.total));
}
