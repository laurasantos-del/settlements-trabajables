"use client";

import Link from "next/link";
import { useState } from "react";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Badge } from "@/components/ui/badge";
import { Bars, DonutChart } from "@/components/ui/charts";
import { DataTable } from "@/components/ui/data-table";
import { useReports } from "@/lib/data-store";
import { exportCsv } from "@/lib/export-csv";
import {
  salesChatAnswer,
  salesFirstPaymentRows,
  salesFuturePayments,
  salesKpis,
  salesPastDuePayments,
  salespersonPerformanceRows,
  salesStatusCounts,
  salesTimeBuckets
} from "@/lib/metrics/sales-metrics";
import { formatMoney } from "@/lib/money";
import type { RawRecord } from "@/lib/types";

const salesLinks = [
  ["/sales/dashboard", "Sales Dashboard"],
  ["/sales/performance", "Salesperson Performance"],
  ["/sales/payments", "Payment Tables"],
  ["/sales/chat", "Chat Assistant"]
];

function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <section>
      <p className="label">Phase 6 / Sales</p>
      <h1 className="mt-2 text-3xl font-bold text-white">{title}</h1>
      {subtitle ? <p className="mt-2 max-w-3xl text-muted">{subtitle}</p> : null}
    </section>
  );
}

function ApiState({ loading, error, retry }: { loading: boolean; error: string; retry: () => void }) {
  if (loading) return <div className="card-pad text-center text-muted">Loading sales data...</div>;
  if (!error) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-yellow-700 bg-yellow-950/40 p-4 text-sm text-yellow-100">
      <span>{error}</span>
      <button className="rounded-lg border border-yellow-700 px-3 py-1" onClick={retry}>Retry</button>
    </div>
  );
}

function statusBadge(value: unknown) {
  const text = String(value ?? "");
  const tone = /complete|current|paid|low/i.test(text) ? "positive" : /missing|past|late|high|delinquent/i.test(text) ? "danger" : /partial|medium|scheduled/i.test(text) ? "warning" : "neutral";
  return <Badge tone={tone}>{text || "-"}</Badge>;
}

const firstPaymentColumns = [
  { key: "Client_ID", label: "Client ID" },
  { key: "Client_Name", label: "Client Name" },
  { key: "Salesperson", label: "Salesperson" },
  { key: "Enrollment_Date", label: "Enrollment Date" },
  { key: "Enrolled_Debt", label: "Enrolled Debt", render: (row: RawRecord) => formatMoney(row.Enrolled_Debt) },
  { key: "Expected_First_Payment", label: "Expected First Payment", render: (row: RawRecord) => formatMoney(row.Expected_First_Payment) },
  { key: "Actual_First_Payment", label: "Actual First Payment", render: (row: RawRecord) => formatMoney(row.Actual_First_Payment) },
  { key: "First_Payment_Percent", label: "First Payment %", render: (row: RawRecord) => `${Number(row.First_Payment_Percent ?? 0).toFixed(1)}%` },
  { key: "First_Payment_Difference", label: "Difference", render: (row: RawRecord) => formatMoney(row.First_Payment_Difference) },
  { key: "First_Payment_Date", label: "First Payment Date" },
  { key: "Days_To_First_Payment", label: "Days" },
  { key: "First_Payment_Status", label: "First Payment Status", render: (row: RawRecord) => statusBadge(row.First_Payment_Status) },
  { key: "Account_Status", label: "Account Status", render: (row: RawRecord) => statusBadge(row.Account_Status) }
];

export function SalesOverview() {
  const { store, loading, error, reload } = useReports();
  const rows = salesFirstPaymentRows(store);
  const kpis = salesKpis(store).slice(0, 4);
  return (
    <div className="grid gap-6">
      <Header title="Sales Workspace" subtitle="Executive view of signed clients, first payment behavior, collection recovery and salesperson conversion." />
      <ApiState loading={loading} error={error} retry={reload} />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => <KpiCard key={kpi.title} kpi={kpi} />)}
      </section>
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {salesLinks.map(([href, label]) => <Link key={href} href={href} className="rounded-xl border border-border bg-card p-4 text-sm font-semibold text-neutral-200 hover:border-accent hover:text-white">{label} {"->"}</Link>)}
      </section>
      <section className="card-pad">
        <h2 className="font-semibold text-white">How this module works</h2>
        <p className="mt-2 text-sm text-muted">Sales is powered by reports already loaded in FastAPI: New Enrollments, Expected Client Payments and Client Interactions.</p>
        <p className="mt-2 text-sm text-muted">{rows.length} signed clients are currently available for analysis.</p>
      </section>
    </div>
  );
}

export function SalesDashboard() {
  const { store, loading, error, reload } = useReports();
  const rows = salesFirstPaymentRows(store);
  const missing = rows.filter((row) => row.First_Payment_Status === "Missing");
  const partial = rows.filter((row) => row.First_Payment_Status === "Partial");
  return (
    <div className="grid gap-6">
      <Header title="Sales Dashboard" subtitle="First payment conversion, collection recovery, timing and account status." />
      <ApiState loading={loading} error={error} retry={reload} />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {salesKpis(store).map((kpi) => <KpiCard key={kpi.title} kpi={kpi} />)}
      </section>
      <section className="grid gap-4 xl:grid-cols-2">
        <div className="card-pad">
          <h2 className="font-semibold text-white">First Payment Status</h2>
          <DonutChart data={salesStatusCounts(store)} />
        </div>
        <div className="card-pad">
          <h2 className="font-semibold text-white">Days to First Payment</h2>
          <Bars data={salesTimeBuckets(store)} />
        </div>
      </section>
      <section className="grid gap-4 xl:grid-cols-2">
        <DataTable title="Missing First Payment" rows={missing} columns={firstPaymentColumns} />
        <DataTable title="Partial First Payment" rows={partial} columns={firstPaymentColumns} />
      </section>
    </div>
  );
}

export function SalesPerformance() {
  const { store, loading, error, reload } = useReports();
  const rows = salespersonPerformanceRows(store);
  const top = rows[0];
  return (
    <div className="grid gap-6">
      <Header title="Salesperson Performance" subtitle="Conversion to first payment, recovered money, days to pay and payment risk by salesperson." />
      <ApiState loading={loading} error={error} retry={reload} />
      <section className="grid gap-4 md:grid-cols-3">
        <KpiCard kpi={{ title: "Salespeople", value: rows.length, tone: "info" }} />
        <KpiCard kpi={{ title: "Top Performer", value: String(top?.Salesperson ?? "-"), subtitle: top ? `${top.Conversion_Rate}% conversion` : undefined, tone: "positive" }} />
        <KpiCard kpi={{ title: "Recovered by Top Performer", value: Number(top?.Money_Recovered ?? 0), tone: "positive" }} />
      </section>
      <DataTable title="Sales Rep Performance" rows={rows} columns={[
        { key: "Salesperson", label: "Salesperson" },
        { key: "Signed_Clients", label: "Signed Clients" },
        { key: "First_Payments", label: "First Payments" },
        { key: "Missing_First_Payment", label: "Missing First Payment" },
        { key: "Total_Enrolled_Debt", label: "Total Enrolled Debt", render: (row) => formatMoney(row.Total_Enrolled_Debt) },
        { key: "Money_Recovered", label: "Money Recovered", render: (row) => formatMoney(row.Money_Recovered) },
        { key: "Conversion_Rate", label: "Conversion", render: (row) => `${row.Conversion_Rate}%` },
        { key: "Average_Days", label: "Avg Days" },
        { key: "Past_Due", label: "Past Due" },
        { key: "Future", label: "Future" }
      ]} />
    </div>
  );
}

export function SalesPayments() {
  const { store, loading, error, reload } = useReports();
  const first = salesFirstPaymentRows(store);
  const pastDue = salesPastDuePayments(store);
  const future = salesFuturePayments(store);
  const paymentColumns = [
    { key: "Client_ID", label: "Client ID" },
    { key: "Client_Name", label: "Client Name" },
    { key: "Salesperson", label: "Salesperson" },
    { key: "Due_Date", label: "Due Date" },
    { key: "Expected_Amount", label: "Expected Amount", render: (row: RawRecord) => formatMoney(row.Expected_Amount) },
    { key: "Actual_Amount", label: "Actual Amount", render: (row: RawRecord) => formatMoney(row.Actual_Amount) },
    { key: "Payment_Status", label: "Payment Status", render: (row: RawRecord) => statusBadge(row.Payment_Status) },
    { key: "Account_Status", label: "Account Status", render: (row: RawRecord) => statusBadge(row.Account_Status) },
    { key: "Risk_Level", label: "Risk Level", render: (row: RawRecord) => statusBadge(row.Risk_Level) }
  ];
  return (
    <div className="grid gap-6">
      <Header title="Payment Tables" subtitle="Operational sales payment tables for first payment, missing payment, partial payment, future and past due views." />
      <ApiState loading={loading} error={error} retry={reload} />
      <DataTable title="First Payment Performance" rows={first} columns={firstPaymentColumns} />
      <DataTable title="Past Due Payments" rows={pastDue} columns={paymentColumns} />
      <DataTable title="Future Payments" rows={future} columns={paymentColumns} />
    </div>
  );
}

export function SalesChat() {
  const { store } = useReports();
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; text: string }>>([]);

  function ask() {
    const trimmed = question.trim();
    if (!trimmed) return;
    setMessages((current) => [...current, { role: "user", text: trimmed }, { role: "assistant", text: salesChatAnswer(store, trimmed) }]);
    setQuestion("");
  }

  return (
    <div className="grid gap-6">
      <Header title="Sales Chat Assistant" subtitle="Ask operational questions about signed clients, first payments, conversion and payment risk." />
      <section className="card-pad">
        <div className="flex gap-2">
          <input className="input-dark flex-1" value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") ask(); }} placeholder="Ask: Which clients are missing first payment?" />
          <button className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black" onClick={ask}>Ask</button>
        </div>
        <div className="mt-5 grid gap-3">
          {messages.length ? messages.map((message, index) => (
            <div key={index} className={message.role === "assistant" ? "rounded-xl border border-border bg-neutral-950 p-3 text-sm text-neutral-200" : "rounded-xl border border-orange-900 bg-orange-950/30 p-3 text-sm text-orange-100"}>
              <p className="label">{message.role}</p>
              <p className="mt-1">{message.text}</p>
            </div>
          )) : <p className="text-sm text-muted">Try: "How many clients are missing first payment?", "Which salesperson has the best conversion?", or "Show past due payments".</p>}
        </div>
        <button className="mt-4 rounded-lg border border-border px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-900" onClick={() => exportCsv("sales-first-payment.csv", salesFirstPaymentRows(store))}>Export first payment data</button>
      </section>
    </div>
  );
}
