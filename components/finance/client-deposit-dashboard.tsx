"use client";

import { useMemo, useState } from "react";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Bars } from "@/components/ui/charts";
import { DataTable } from "@/components/ui/data-table";
import { ApiStatus } from "@/components/ui/api-status";
import { DateRangePicker, formatDateRange, thisMonthRange } from "@/components/ui/date-range-picker";
import { useReports } from "@/lib/data-store";
import { clientDepositKpis, scheduledDepositGroups } from "@/lib/metrics/finance-metrics";
import { formatMoney } from "@/lib/money";
import { isInDateRange } from "@/lib/utils";

export function ClientDepositDashboard() {
  const { store, loading, error, reload } = useReports();
  const [defaultStart, defaultEnd] = useMemo(() => thisMonthRange(), []);
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const showing = `Showing: ${formatDateRange(startDate, endDate)}`;
  const payments = (store.expectedClientPayments ?? []).filter((row) => isInDateRange(String(row["Scheduled Draft Date"] ?? ""), startDate, endDate));
  const nsfRows = store.paymentNSF ?? [];
  const groups = scheduledDepositGroups(payments);
  return (
    <div className="grid gap-6">
      <section className="grid gap-4 xl:grid-cols-[1fr_auto]">
        <Header title="Client Deposit" subtitle="Client payment posture and scheduled deposit workload." />
        <DateRangePicker startDate={startDate} endDate={endDate} defaultStartDate={defaultStart} defaultEndDate={defaultEnd} onChange={(start, end) => { setStartDate(start); setEndDate(end); }} />
      </section>
      <ApiStatus loading={loading} error={error} retry={reload} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">{clientDepositKpis(store).map((kpi) => <KpiCard key={kpi.title} kpi={{ ...kpi, subtitle: showing }} />)}</div>
      <div className="grid gap-4 xl:grid-cols-3">
        <KpiCard kpi={{ title: "Past Scheduled", value: groups.past.length, tone: "danger" }} />
        <KpiCard kpi={{ title: "Due Current Day", value: groups.today.length, tone: "warning" }} />
        <KpiCard kpi={{ title: "Future Scheduled", value: groups.future.length, tone: "positive" }} />
      </div>
      <div className="card-pad"><h2 className="font-semibold text-white">Scheduled by bucket</h2><Bars data={[{ label: "Past", value: groups.past.length }, { label: "Current day", value: groups.today.length }, { label: "Future", value: groups.future.length }]} /></div>
      <DataTable title="Scheduled Payments" subtitle={showing} rows={payments.filter((row) => row["Payment Status"] === "Scheduled")} columns={[
        { key: "Client ID", label: "Client ID" },
        { key: "First Name", label: "Client", render: (row) => `${row["First Name"] ?? ""} ${row["Last Name"] ?? ""}`.trim() },
        { key: "Scheduled Draft Date", label: "Date" },
        { key: "Amount", label: "Amount", render: (row) => formatMoney(row.Amount) },
        { key: "Payment Status", label: "Status" }
      ]} />
      <DataTable title="Payment NSF" rows={nsfRows.slice(0, 50)} columns={[
        { key: "Client ID", label: "Client ID" },
        { key: "Name", label: "Cliente" },
        { key: "Amount", label: "Monto", render: (row) => formatMoney(row.Amount) },
        { key: "Last NSF Date", label: "Último NSF" },
        { key: "Last NSF Error", label: "Error" },
        { key: "Accounting Status", label: "Accounting Status" }
      ]} />
    </div>
  );
}

export function Header({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <section>
      <p className="label">Finance</p>
      <h1 className="mt-2 text-3xl font-bold text-white">{title}</h1>
      <p className="mt-2 text-muted">{subtitle}</p>
    </section>
  );
}
