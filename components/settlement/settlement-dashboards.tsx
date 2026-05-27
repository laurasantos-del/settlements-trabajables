"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Bars, DonutChart } from "@/components/ui/charts";
import { DataTable } from "@/components/ui/data-table";
import { ApiStatus } from "@/components/ui/api-status";
import { Badge } from "@/components/ui/badge";
import { DateRangePicker, formatDateRange, thisMonthRange, thisYearRange } from "@/components/ui/date-range-picker";
import { useReports } from "@/lib/data-store";
import type { RawRecord } from "@/lib/types";
import { brokenRows, creditorStatusCounts, noPossibleRows, settlementOverviewKpis } from "@/lib/metrics/settlement-metrics";
import { formatMoney, parseMoney } from "@/lib/money";
import { isInDateRange } from "@/lib/utils";

function Header({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <section>
      <p className="label">Settlement</p>
      <h1 className="mt-2 text-3xl font-bold text-white">{title}</h1>
      <p className="mt-2 text-muted">{subtitle}</p>
    </section>
  );
}

export function SettlementOverview() {
  const { store, loading, error, reload } = useReports();
  const kpis = settlementOverviewKpis(store);
  return (
    <div className="grid gap-6">
      <Header title="Settlement Overview" subtitle="Negotiation pipeline, monthly settlements and risk." />
      <ApiStatus loading={loading} error={error} retry={reload} />
      <div className="flex flex-wrap gap-3 text-sm">
        {[
          ["/settlements/creditor-status", "Creditor Status →"],
          ["/settlements/settlements-mes", "Mes →"],
          ["/settlements/settlements-futuros", "Futuros →"],
          ["/settlements/no-posibles", "No Posibles →"],
          ["/settlements/rotos", "Rotos →"]
        ].map(([href, label]) => <Link className="text-accent hover:text-orange-300" href={href} key={href}>{label}</Link>)}
      </div>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">{kpis.map((kpi) => <KpiCard key={kpi.title} kpi={kpi} />)}</section>
    </div>
  );
}

export function CreditorStatusDashboard() {
  const { store, loading, error, reload } = useReports();
  const [defaultStart, defaultEnd] = useMemo(() => thisYearRange(), []);
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const showing = `Showing: ${formatDateRange(startDate, endDate)}`;
  const rows = (store.creditorStatus ?? []).filter((row) => isInDateRange(String(row["Status Date"] ?? ""), startDate, endDate));
  const paymentByClient = useMemo(() => {
    const map = new Map<string, RawRecord>();
    for (const row of (store.settlementPayments ?? [])) {
      const id = String(row["Client ID"] ?? "");
      if (!id || map.has(id)) continue;
      map.set(id, row);
    }
    return map;
  }, [store.settlementPayments]);
  const debtMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const [clientId, row] of paymentByClient.entries()) {
      const d = parseMoney(row["Total Debt"]) || parseMoney(row["Balance Current"]);
      if (d > 0) map.set(clientId, d);
    }
    return map;
  }, [paymentByClient]);
  const detailRows = rows.map((row): RawRecord => {
    const match = paymentByClient.get(String(row["Client ID"]));
    const debt = match ? parseMoney(match["Total Debt"]) || parseMoney(match["Balance Current"]) : 0;
    return {
      ...row,
      "_Total Debt": debt || "—",
      "_Settlement Pmt Due Date": row["Settlement Pmt Due Date"] ?? row["Settlement Payment Due Date"] ?? match?.["Due Date"] ?? "—"
    };
  });
  const counts = creditorStatusCounts(rows, debtMap);
  return (
    <div className="grid gap-6">
      <section className="grid gap-4 xl:grid-cols-[1fr_auto]">
        <Header title="Creditor Status" subtitle="Status distribution across creditor accounts." />
        <DateRangePicker startDate={startDate} endDate={endDate} defaultStartDate={defaultStart} defaultEndDate={defaultEnd} onChange={(start, end) => { setStartDate(start); setEndDate(end); }} />
      </section>
      <ApiStatus loading={loading} error={error} retry={reload} />
      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="card-pad"><h2 className="font-semibold text-white">Status donut</h2><DonutChart data={counts.map((row) => ({ label: row.status, value: row.accounts }))} /></div>
        <div className="card-pad"><h2 className="font-semibold text-white">Top statuses</h2><Bars data={counts.slice(0, 12).map((row) => ({ label: row.status, value: row.accounts }))} horizontal /></div>
      </section>
      <DataTable title="Creditor Status" subtitle={showing} rows={counts.map((row) => ({ Status: row.status, Accounts: row.accounts, Clients: row.clients, "Total Debt": row.debt }))} columns={[
        { key: "Status", label: "Status" },
        { key: "Accounts", label: "Cantidad de cuentas" },
        { key: "Clients", label: "Cantidad de clientes" },
        { key: "Total Debt", label: "Total debt", render: (row) => formatMoney(row["Total Debt"]) }
      ]} />
      <DataTable title="Creditor Account Detail" subtitle={showing} rows={detailRows} columns={[
        { key: "Client ID", label: "Client ID" },
        { key: "Lastname", label: "Lastname" },
        { key: "Creditor Name", label: "Acreedor" },
        { key: "Creditor Status", label: "Status" },
        { key: "NegotiatorID", label: "Negociador" },
        { key: "Status Date", label: "Status Date" },
        { key: "_Total Debt", label: "Total Debt", render: (row) => typeof row["_Total Debt"] === "number" ? formatMoney(row["_Total Debt"]) : "—" },
        { key: "_Settlement Pmt Due Date", label: "Settlement Pmt Due Date" }
      ]} />
    </div>
  );
}

export function MonthlySettlementsDashboard() {
  const { store, loading, error, reload } = useReports();
  const [defaultStart, defaultEnd] = useMemo(() => thisMonthRange(), []);
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const showing = `Showing: ${formatDateRange(startDate, endDate)}`;
  const rows = (store.settlementsPerDate ?? []).filter((row) => isInDateRange(String(row["Settlement Letter Date"] ?? ""), startDate, endDate));
  // Fee comes from clientInteractions Settlement Fee Percentage × Balance At Settlement
  // (the raw Settlement Fee field in this report always contains "amount", not a dollar value)
  const feePercents = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of (store.clientInteractions ?? [])) {
      const pct = parseMoney(row["Settlement Fee Percentage"]);
      if (pct > 0) map.set(String(row["Client ID"]), pct / 100);
    }
    return map;
  }, [store.clientInteractions]);
  const rowFee = (row: typeof rows[number]) => {
    const pct = feePercents.get(String(row["Client ID"]));
    return pct ? parseMoney(row["Balance At Settlement"]) * pct : 0;
  };
  const totalFee = rows.reduce((s, r) => s + rowFee(r), 0);
  const totalSettlement = rows.reduce((s, r) => s + parseMoney(r["Settlement Amount"]), 0);
  const totalDebt = rows.reduce((s, r) => s + parseMoney(r["Balance At Settlement"]), 0);
  return (
    <div className="grid gap-6">
      <section className="grid gap-4 xl:grid-cols-[1fr_auto]">
        <Header title="Settlements del Mes" subtitle="Settlements simulated or completed in the selected range." />
        <DateRangePicker startDate={startDate} endDate={endDate} defaultStartDate={defaultStart} defaultEndDate={defaultEnd} onChange={(start, end) => { setStartDate(start); setEndDate(end); }} />
      </section>
      <ApiStatus loading={loading} error={error} retry={reload} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard kpi={{ title: "Settlements del Mes", value: rows.length, subtitle: showing, tone: "positive" }} />
        <KpiCard kpi={{ title: "Fee Esperado", value: totalFee, subtitle: showing, tone: "warning" }} />
        <KpiCard kpi={{ title: "Monto Negociado", value: totalSettlement, subtitle: showing, tone: "positive" }} />
        <KpiCard kpi={{ title: "Avg Fee", value: rows.length ? totalFee / rows.length : 0, subtitle: showing, tone: "info" }} />
      </div>
      <DataTable title="Monthly Settlements" subtitle={showing} rows={rows} columns={[
        { key: "Client ID", label: "Cliente" },
        { key: "Name", label: "Acreedor" },
        { key: "Settlement Letter Date", label: "Fecha" },
        { key: "Settlement Amount", label: "Monto", render: (row) => formatMoney(row["Settlement Amount"]) },
        { key: "Settlement Fee", label: "Fee estimado", render: (row) => formatMoney(rowFee(row)) },
        { key: "Balance At Settlement", label: "Balance", render: (row) => formatMoney(row["Balance At Settlement"]) }
      ]} />
      <p className="text-sm text-muted">Total debt negotiated: {formatMoney(totalDebt)}</p>
    </div>
  );
}

export function FutureSettlementsDashboard() {
  const { store, loading, error, reload } = useReports();
  const interactions = new Map((store.clientInteractions ?? []).map((row) => [String(row["Client ID"]), row]));
  const rows = (store.creditorStatus ?? [])
    .filter((row) => ["INC", "LXNOINC"].includes(String(row["Creditor Status"])))
    .map((row) => {
      const interaction = interactions.get(String(row["Client ID"]));
      const escrow = parseMoney(interaction?.["CFTPay Escrow Balance"] ?? interaction?.["Company Bank Balance"]);
      const debt = parseMoney(interaction?.["Total Enrolled Debt"]) || parseMoney(row["Total Debt"] ?? row["Balance Current"]) || 5000;
      const estimate = debt * 0.55;
      return { ...row, escrow, debt, estimate, canNegotiate: escrow >= estimate, shortfall: Math.max(0, estimate - escrow) };
    })
    .sort((a, b) => b.escrow - a.escrow);
  return (
    <div className="grid gap-6">
      <Header title="Settlements Futuros" subtitle="Accounts that could be negotiated using available escrow." />
      <ApiStatus loading={loading} error={error} retry={reload} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard kpi={{ title: "Cuentas potenciales", value: rows.length, tone: "info" }} />
        <KpiCard kpi={{ title: "Deuda negociable", value: rows.reduce((s, r) => s + r.debt, 0), tone: "warning" }} />
        <KpiCard kpi={{ title: "Estimado 55%", value: rows.reduce((s, r) => s + r.estimate, 0), tone: "warning" }} />
        <KpiCard kpi={{ title: "Fondos suficientes", value: rows.filter((r) => r.canNegotiate).length, tone: "positive" }} />
      </div>
      <DataTable title="Future Negotiation Accounts" rows={rows} columns={[
        { key: "Client ID", label: "Cliente" },
        { key: "Creditor Name", label: "Acreedor" },
        { key: "debt", label: "Deuda", render: (row) => formatMoney(row.debt) },
        { key: "estimate", label: "55%" , render: (row) => formatMoney(row.estimate) },
        { key: "escrow", label: "Escrow", render: (row) => formatMoney(row.escrow) },
        { key: "canNegotiate", label: "Puede", render: (row) => <Badge tone={row.canNegotiate ? "positive" : "warning"}>{row.canNegotiate ? "Sí" : "No"}</Badge> },
        { key: "shortfall", label: "Diferencia", render: (row) => formatMoney(row.shortfall) }
      ]} />
    </div>
  );
}

export function NotPossibleSettlements() {
  const { store, loading, error, reload } = useReports();
  const clientDebt = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of (store.clientInteractions ?? [])) {
      const d = parseMoney(row["Total Enrolled Debt"]);
      if (d > 0) map.set(String(row["Client ID"]), d);
    }
    return map;
  }, [store.clientInteractions]);
  const rows = noPossibleRows(store.creditorStatus ?? []).map((row): RawRecord => ({
    ...row, "Total Debt": clientDebt.get(String(row["Client ID"])) ?? parseMoney(row["Total Debt"])
  }));
  return (
    <div className="grid gap-6">
      <Header title="Settlement No Posibles" subtitle="Accounts blocked by creditor status." />
      <ApiStatus loading={loading} error={error} retry={reload} />
      <div className="grid gap-4 md:grid-cols-3">
        <KpiCard kpi={{ title: "Total cuentas no posibles", value: rows.length, tone: "danger" }} />
        <KpiCard kpi={{ title: "Total deuda no posible", value: rows.reduce((s, r) => s + parseMoney(r["Total Debt"]), 0), tone: "danger" }} />
        <KpiCard kpi={{ title: "Clientes afectados", value: new Set(rows.map((r) => r["Client ID"])).size, tone: "warning" }} />
      </div>
      <DataTable title="No Possible Accounts" rows={rows} columns={[
        { key: "Client ID", label: "Cliente" },
        { key: "Creditorid", label: "Cuenta" },
        { key: "Creditor Name", label: "Acreedor" },
        { key: "Creditor Status", label: "Status" },
        { key: "Total Debt", label: "Monto deuda", render: (row) => formatMoney(row["Total Debt"]) }
      ]} />
    </div>
  );
}

export function BrokenSettlements() {
  const { store, loading, error, reload } = useReports();
  const clientDebt = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of (store.clientInteractions ?? [])) {
      const d = parseMoney(row["Total Enrolled Debt"]);
      if (d > 0) map.set(String(row["Client ID"]), d);
    }
    return map;
  }, [store.clientInteractions]);
  const rows = brokenRows(store.creditorStatus ?? []).map((row): RawRecord => ({
    ...row, "Total Debt": clientDebt.get(String(row["Client ID"])) ?? parseMoney(row["Total Debt"])
  }));
  return (
    <div className="grid gap-6">
      <Header title="Settlement Rotos" subtitle="Broken settlement exposure." />
      <ApiStatus loading={loading} error={error} retry={reload} />
      <div className="grid gap-4 md:grid-cols-3">
        <KpiCard kpi={{ title: "Broken Settlements", value: rows.length, tone: "danger" }} />
        <KpiCard kpi={{ title: "Total deuda broken", value: rows.reduce((s, r) => s + parseMoney(r["Total Debt"]), 0), tone: "danger" }} />
        <KpiCard kpi={{ title: "Clientes afectados", value: new Set(rows.map((r) => r["Client ID"])).size, tone: "warning" }} />
      </div>
      <DataTable title="Broken Settlements" rows={rows} columns={[
        { key: "Client ID", label: "Cliente" },
        { key: "Creditorid", label: "Cuenta" },
        { key: "Creditor Name", label: "Acreedor" },
        { key: "Creditor Status", label: "Status" },
        { key: "Status Date", label: "Fecha" }
      ]} />
    </div>
  );
}

export function SettlementPlan() {
  const { store, loading, error, reload } = useReports();
  const rows = (store.newEnrollments ?? []).slice(0, 200).map((row) => {
    const totalDebt = parseMoney(row["Total Debt"]);
    const monthly = parseMoney(row["Monthly Payment Amount"]) || totalDebt * 0.03;
    const estimated = totalDebt * 0.55;
    const month = [1, 2, 3, 4, 5, 6].find((item) => monthly * item >= estimated) ?? 7;
    return { ...row, monthly, totalDebt, estimated, month, projected: monthly * Math.min(month, 6) };
  });
  return (
    <div className="grid gap-6">
      <Header title="Settlement Plan" subtitle="Six-month negotiation projection for new clients." />
      <ApiStatus loading={loading} error={error} retry={reload} />
      <DataTable title="Projected Settlement Plan" rows={rows} columns={[
        { key: "Client", label: "Cliente", render: (row) => String(row.Client ?? row["Client ID"] ?? "-") },
        { key: "monthly", label: "Monthly Payment", render: (row) => formatMoney(row.monthly) },
        { key: "totalDebt", label: "Total Debt", render: (row) => formatMoney(row.totalDebt) },
        { key: "estimated", label: "Settlement 55%", render: (row) => formatMoney(row.estimated) },
        { key: "month", label: "Mes estimado", render: (row) => Number(row.month) > 6 ? "Mes 7+" : `Mes ${row.month}` },
        { key: "projected", label: "Balance proyectado", render: (row) => formatMoney(row.projected) }
      ]} />
    </div>
  );
}
