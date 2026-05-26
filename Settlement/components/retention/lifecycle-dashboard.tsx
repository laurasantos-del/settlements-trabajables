"use client";

import { useMemo, useState } from "react";
import { ApiStatus } from "@/components/ui/api-status";
import { DateRangePicker, formatDateRange, thisYearRange } from "@/components/ui/date-range-picker";
import { useReports } from "@/lib/data-store";
import { applyLifecycleFilters, lifecycleRows } from "@/lib/metrics/retention-metrics";
import { parseMoney, formatMoney } from "@/lib/money";
import { isInDateRange } from "@/lib/utils";
import { FiltersBar } from "./filters-bar";
import { RetentionKpiCards } from "./kpi-cards";
import { DebtCompositionBar } from "./debt-composition-bar";
import { LifecycleFunnel } from "./lifecycle-funnel";
import { CancellationsCalendarChart } from "./cancellations-calendar-chart";
import { CancellationsTenureChart } from "./cancellations-tenure-chart";
import { CancellationReasonsChart } from "./cancellation-reasons-chart";
import { SalesRepTable } from "./sales-rep-table";
import { ClientDetailTable } from "./client-detail-table";
import { KeyInsights } from "./key-insights";

export function RetentionOverview() {
  const { store, hasRealData, loading, error, reload } = useReports();
  const rows = lifecycleRows(store.clientLifecycle ?? []);
  const totalDebt = rows.reduce((sum, row) => sum + parseMoney(row["Total Enrolled Debt"]), 0);

  return (
    <div className="grid gap-6">
      <section className="grid gap-6 rounded-2xl border border-border bg-[radial-gradient(circle_at_top_left,#312e81,#141414_42%,#0f0f0f)] p-8">
        <p className="label">Retención</p>
        <h1 className="text-3xl font-bold text-white">Client Lifecycle Workspace</h1>
        <p className="max-w-2xl text-muted">Analiza cancelaciones, clientes activos, graduados, deuda retenida, deuda perdida y performance por vendedor.</p>
        {!hasRealData ? <p className="text-sm text-orange-300">Sin datos de lifecycle cargados desde FastAPI.</p> : null}
        <div className="grid gap-4 md:grid-cols-3">
          <div className="card-pad"><p className="label">Clientes</p><div className="mt-2 text-3xl font-bold text-white">{rows.length}</div></div>
          <div className="card-pad"><p className="label">Deuda enrolada</p><div className="mt-2 text-3xl font-bold text-white">{formatMoney(totalDebt)}</div></div>
          <div className="card-pad"><p className="label">Fuente</p><div className="mt-2 text-xl font-bold text-white">{hasRealData ? "FastAPI" : "Sin datos"}</div></div>
        </div>
      </section>
      <ApiStatus loading={loading} error={error} retry={reload} />
    </div>
  );
}

export function LifecycleDashboard({ mode = "full" }: { mode?: "full" | "cancellations" | "sales" | "clients" }) {
  const { store, lastLoaded, loading, error, reload } = useReports();
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [defaultStart, defaultEnd] = useMemo(() => thisYearRange(), []);
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const showing = `Showing: ${formatDateRange(startDate, endDate)}`;
  const allRows = useMemo(() => lifecycleRows(store.clientLifecycle ?? []), [store.clientLifecycle]);
  const dateRows = useMemo(() => allRows.filter((row) => isInDateRange(String(row["Enrollment Date"] ?? ""), startDate, endDate)), [allRows, startDate, endDate]);
  const rows = useMemo(() => applyLifecycleFilters(dateRows, filters), [dateRows, filters]);
  const totalDebt = rows.reduce((sum, row) => sum + parseMoney(row["Total Enrolled Debt"]), 0);

  return (
    <div className="grid gap-6">
      <section className="grid gap-4 xl:grid-cols-[1fr_auto]">
        <div>
          <p className="label">Retención</p>
          <h1 className="mt-2 text-3xl font-bold text-white">Client Lifecycle Dashboard</h1>
          <p className="mt-2 text-muted">From enrollment to graduation or cancellation. {lastLoaded ? `Last load: ${lastLoaded}` : "Sin datos de lifecycle."}</p>
          <p className="mt-2 text-sm text-muted">{rows.length} clients · {formatMoney(totalDebt)} enrolled debt · {showing}</p>
        </div>
        <DateRangePicker startDate={startDate} endDate={endDate} defaultStartDate={defaultStart} defaultEndDate={defaultEnd} onChange={(start, end) => { setStartDate(start); setEndDate(end); }} />
      </section>
      <ApiStatus loading={loading} error={error} retry={reload} />
      <FiltersBar rows={dateRows} filters={filters} setFilters={setFilters} />
      {mode === "full" ? (
        <>
          <RetentionKpiCards rows={rows} />
          <DebtCompositionBar rows={rows} />
          <LifecycleFunnel rows={rows} />
          <section className="grid gap-6 xl:grid-cols-2">
            <CancellationsCalendarChart rows={rows} />
            <CancellationsTenureChart rows={rows} />
          </section>
          <section className="grid gap-6 xl:grid-cols-[1fr_0.85fr]">
            <CancellationReasonsChart rows={rows} />
            <KeyInsights rows={rows} />
          </section>
          <SalesRepTable rows={rows} />
          <ClientDetailTable rows={rows} />
        </>
      ) : null}
      {mode === "cancellations" ? <section className="grid gap-6 xl:grid-cols-2"><CancellationsCalendarChart rows={rows} /><CancellationsTenureChart rows={rows} /><CancellationReasonsChart rows={rows} /><KeyInsights rows={rows} /></section> : null}
      {mode === "sales" ? <SalesRepTable rows={rows} /> : null}
      {mode === "clients" ? <ClientDetailTable rows={rows} /> : null}
    </div>
  );
}
