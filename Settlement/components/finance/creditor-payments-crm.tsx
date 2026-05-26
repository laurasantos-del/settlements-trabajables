"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { DateRangePicker, formatDateRange, lastMonthsRange, thisMonthRange } from "@/components/ui/date-range-picker";
import { DataTable } from "@/components/ui/data-table";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { useReports } from "@/lib/data-store";
import { daysBetween } from "@/lib/dates";
import { exportCsv } from "@/lib/export-csv";
import { formatMoney } from "@/lib/money";
import type { RawRecord } from "@/lib/types";
import { isInDateRange } from "@/lib/utils";
import {
  activeNegativeRows,
  alertRows,
  atRiskRows,
  brokenSettlements,
  clientSummaries,
  creditorRows,
  dashboardKpis,
  escrowBalance,
  interactionMap,
  isPaid,
  noFundsRows,
  normalizeInteraction,
  normalizePayment,
  overdueUnpaid,
  paymentsByClient,
  reconciliationRows,
  urgentRows
} from "@/lib/creditor-payments";

type CreditorPaymentData = {
  payments: RawRecord[];
  interactions: RawRecord[];
  loading: boolean;
  error: string;
  refresh: () => void;
};

const sublinks = [
  ["/finance/creditor-payments/dashboard", "Dashboard"],
  ["/finance/creditor-payments/clients", "Clientes"],
  ["/finance/creditor-payments/creditors", "Acreedores"],
  ["/finance/creditor-payments/broken", "Broken"],
  ["/finance/creditor-payments/reconciliation", "Reconciliación"]
];

function useCreditorPaymentData(): CreditorPaymentData {
  const { store, loading, error, reload } = useReports();
  const payments = useMemo(() => (store.settlementPayments ?? []).map(normalizePayment), [store.settlementPayments]);
  const interactions = useMemo(() => (store.clientInteractions ?? []).map(normalizeInteraction), [store.clientInteractions]);
  return {
    payments,
    interactions,
    loading,
    error,
    refresh: reload
  };
}

function useDateRange(defaultRange: () => [string, string]) {
  const [defaultStart, defaultEnd] = useMemo(() => defaultRange(), [defaultRange]);
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  return {
    startDate,
    endDate,
    defaultStart,
    defaultEnd,
    showing: `Showing: ${formatDateRange(startDate, endDate)}`,
    picker: (
      <DateRangePicker
        startDate={startDate}
        endDate={endDate}
        defaultStartDate={defaultStart}
        defaultEndDate={defaultEnd}
        onChange={(start, end) => {
          setStartDate(start);
          setEndDate(end);
        }}
      />
    )
  };
}

function dueDateInRange(row: RawRecord, start: string, end: string): boolean {
  const date = String(row.Due_Date ?? row["Due Date"] ?? row.Next_Due_Date ?? row.Last_Y ?? row.Detected_Date ?? "");
  return date ? isInDateRange(date, start, end) : true;
}

function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <section>
      <p className="label">Finance / Creditor Payments</p>
      <h1 className="mt-2 text-3xl font-bold text-white">{title}</h1>
      {subtitle ? <p className="mt-2 text-muted">{subtitle}</p> : null}
    </section>
  );
}

function ApiState({ loading, error, retry }: { loading: boolean; error: string; retry: () => void }) {
  if (loading) return <div className="card-pad text-center text-muted">Cargando...</div>;
  if (!error) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-yellow-700 bg-yellow-950/40 p-4 text-sm text-yellow-100">
      <span>{error}</span>
      <button className="rounded-lg border border-yellow-700 px-3 py-1" onClick={retry}>Reintentar</button>
    </div>
  );
}

function statusBadge(value: unknown) {
  const text = String(value ?? "");
  const tone = text === "Y" || /active|low|sí/i.test(text) ? "positive" : /critical|broken|cancel|negative|high|no/i.test(text) ? "danger" : /medium|urgent|risk|n|pend/i.test(text) ? "warning" : "neutral";
  return <Badge tone={tone}>{text || "-"}</Badge>;
}

const paymentColumns = [
  { key: "Client_ID", label: "Cliente" },
  { key: "Current_Creditor", label: "Acreedor" },
  { key: "Amount", label: "Monto", render: (row: RawRecord) => formatMoney(row.Amount) },
  { key: "Due_Date", label: "Fecha" },
  { key: "Payment Status", label: "Status", render: (row: RawRecord) => statusBadge(row["Payment Status"]) }
];

export function CreditorPaymentsOverview() {
  const data = useCreditorPaymentData();
  return (
    <div className="grid gap-6">
      <Header title="Creditor Payments Workspace" subtitle="Hub operacional para pagos a acreedores, riesgos, reconciliación y alertas." />
      <ApiState loading={data.loading} error={data.error} retry={data.refresh} />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { title: "Payment Data", value: data.payments.length, tone: "info" as const },
          { title: "Interaction Data", value: data.interactions.length, tone: "info" as const },
          { title: "Broken Settlements", value: brokenSettlements(data.payments, data.interactions).length, tone: "danger" as const },
          { title: "Sin Fondos", value: noFundsRows(data.payments, data.interactions).length, tone: "warning" as const }
        ].map((kpi) => <KpiCard key={kpi.title} kpi={kpi} />)}
      </section>
      <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {sublinks.map(([href, label]) => <Link key={href} href={href} className="rounded-xl border border-border bg-card p-4 text-sm font-semibold text-neutral-200 hover:border-accent hover:text-white">{label} →</Link>)}
      </section>
    </div>
  );
}

export function CreditorPaymentsDashboard() {
  const data = useCreditorPaymentData();
  const range = useDateRange(thisMonthRange);
  const payments = data.payments.filter((row) => dueDateInRange(row, range.startDate, range.endDate));
  const overdue = overdueUnpaid(payments).map((row) => ({ ...row, Days_Overdue: daysBetween(row.Due_Date) }));
  const alerts = alertRows(payments, data.interactions).slice(0, 5);
  return (
    <div className="grid gap-6">
      <section className="grid gap-4 xl:grid-cols-[1fr_auto]">
        <Header title="Creditor Payments Dashboard" subtitle="KPIs principales, pagos atrasados y alertas críticas." />
        {range.picker}
      </section>
      <ApiState loading={data.loading} error={data.error} retry={data.refresh} />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {dashboardKpis(payments, data.interactions).map((kpi) => <KpiCard key={kpi.title} kpi={{ ...kpi, subtitle: range.showing }} />)}
      </section>
      <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <DataTable title="Pagos atrasados" subtitle={range.showing} rows={overdue} columns={[...paymentColumns, { key: "Days_Overdue", label: "Días vencido" }]} />
        <section className="card-pad">
          <h2 className="font-semibold text-white">Alertas recientes</h2>
          <div className="mt-4 grid gap-3">
            {alerts.map((alert, index) => (
              <article key={index} className="rounded-xl border border-border bg-neutral-950 p-3">
                {statusBadge(alert.Severity)}
                <p className="mt-2 text-sm font-semibold text-white">{alert.Client_ID}</p>
                <p className="text-xs text-muted">{alert.Description}</p>
              </article>
            ))}
          </div>
        </section>
      </section>
    </div>
  );
}

export function CreditorPaymentsClients() {
  const data = useCreditorPaymentData();
  const [selected, setSelected] = useState("");
  const summaries = clientSummaries(data.payments, data.interactions);
  const groups = paymentsByClient(data.payments);
  const selectedSummary = summaries.find((row) => row.Client_ID === selected);
  const selectedPayments = groups.get(selected) ?? [];
  const creditors = Array.from(new Set(selectedPayments.map((row) => String(row.Current_Creditor)))).map((creditor) => {
    const rows = selectedPayments.filter((row) => row.Current_Creditor === creditor);
    return { Current_Creditor: creditor, Completed: rows.filter(isPaid).length, Pending: rows.filter((row) => !isPaid(row)).length, Balance: rows.reduce((sum, row) => sum + Number(row.Settlement_Balance ?? 0), 0) };
  });

  return (
    <div className="grid gap-6">
      <Header title="Clientes" subtitle="Lista, detalle, fondos y timeline de pagos por cliente." />
      <ApiState loading={data.loading} error={data.error} retry={data.refresh} />
      <DataTable title="Clientes" rows={summaries} pageSize={20} columns={[
        { key: "Client_ID", label: "Cliente", render: (row) => <button className="text-accent underline" onClick={() => setSelected(String(row.Client_ID))}>{row.Client_ID}</button> },
        { key: "Program", label: "Program" },
        { key: "Client_Status", label: "Status", render: (row) => statusBadge(row.Client_Status) },
        { key: "Escrow", label: "Escrow", render: (row) => formatMoney(row.Escrow) },
        { key: "Completed", label: "Completados" },
        { key: "Pending", label: "Pendientes" },
        { key: "Risk", label: "Riesgo", render: (row) => statusBadge(row.Risk) }
      ]} />
      {selectedSummary ? (
        <section className="grid gap-6">
          <section className="card-pad">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="label">Client detail</p>
                <h2 className="mt-2 text-2xl font-bold text-white">{selectedSummary.Client_ID}</h2>
                <p className="text-muted">{selectedSummary.Program} · {selectedSummary.Client_Status}</p>
              </div>
              {statusBadge(selectedSummary.Risk)}
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-4">
              <KpiCard kpi={{ title: "Pagos completados", value: Number(selectedSummary.Completed), tone: "positive" }} />
              <KpiCard kpi={{ title: "Pendientes", value: Number(selectedSummary.Pending), tone: "warning" }} />
              <KpiCard kpi={{ title: "Monto Pagado", value: Number(selectedSummary.Paid_Amount), tone: "positive" }} />
              <KpiCard kpi={{ title: "Monto Pendiente", value: Number(selectedSummary.Pending_Amount), tone: "warning" }} />
            </div>
          </section>
          <DataTable title="Acreedores del cliente" rows={creditors} columns={[
            { key: "Current_Creditor", label: "Acreedor" },
            { key: "Completed", label: "Pagos completados" },
            { key: "Pending", label: "Pendientes" },
            { key: "Balance", label: "Balance", render: (row) => formatMoney(row.Balance) }
          ]} />
          <DataTable title="Timeline de pagos" rows={selectedPayments.sort((a, b) => String(a.Due_Date).localeCompare(String(b.Due_Date)))} columns={paymentColumns} />
        </section>
      ) : null}
    </div>
  );
}

export function CreditorPaymentsCreditors() {
  const data = useCreditorPaymentData();
  const rows = creditorRows(data.payments);
  const top = rows[0];
  const topPaid = [...rows].sort((a, b) => Number(b.Total_Paid) - Number(a.Total_Paid))[0];
  const topPending = [...rows].sort((a, b) => Number(b.Total_Pending) - Number(a.Total_Pending))[0];
  return (
    <div className="grid gap-6">
      <Header title="Acreedores" subtitle="Performance y exposición por acreedor." />
      <ApiState loading={data.loading} error={data.error} retry={data.refresh} />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard kpi={{ title: "Total Acreedores", value: rows.length, tone: "info" }} />
        <KpiCard kpi={{ title: "Top Acreedor", value: String(top?.Current_Creditor ?? "-"), subtitle: `${top?.Clients ?? 0} clientes`, tone: "positive" }} />
        <KpiCard kpi={{ title: "Mayor Monto", value: String(topPaid?.Current_Creditor ?? "-"), subtitle: formatMoney(topPaid?.Total_Paid), tone: "positive" }} />
        <KpiCard kpi={{ title: "Más Pendiente", value: String(topPending?.Current_Creditor ?? "-"), subtitle: formatMoney(topPending?.Total_Pending), tone: "warning" }} />
      </section>
      <DataTable title="Acreedores" rows={rows} columns={[
        { key: "Current_Creditor", label: "Acreedor" },
        { key: "Clients", label: "# Clientes" },
        { key: "Completed", label: "Pagos completados" },
        { key: "Total_Paid", label: "Total pagado", render: (row) => formatMoney(row.Total_Paid) },
        { key: "Total_Pending", label: "Total pendiente", render: (row) => formatMoney(row.Total_Pending) },
        { key: "Completion_Rate", label: "% completado", render: (row) => `${row.Completion_Rate}%` }
      ]} />
    </div>
  );
}

export function BrokenSettlementsPage() {
  const data = useCreditorPaymentData();
  const rows = brokenSettlements(data.payments, data.interactions);
  return (
    <RiskPage title="Broken Settlements" subtitle="Último pago Y hace más de 60 días o ningún Y con Due Date viejo." rows={rows} loading={data.loading} error={data.error} retry={data.refresh} cards={[
      { title: "Total Broken", value: rows.length, tone: "danger" },
      { title: "Urgentes", value: rows.filter((row) => Number(row.Days_Since_Y) > 90).length, tone: "danger" },
      { title: "Recuperables", value: rows.filter((row) => Number(row.Escrow) > 0).length, tone: "warning" },
      { title: "Monto En Riesgo", value: rows.reduce((sum, row) => sum + Number(row.Settlement_Balance ?? 0), 0), tone: "danger" }
    ]} columns={[
      { key: "Client_ID", label: "Cliente" },
      { key: "Current_Creditor", label: "Acreedor" },
      { key: "Last_Y", label: "Último pago Y" },
      { key: "Days_Since_Y", label: "Días sin pago" },
      { key: "Escrow", label: "Escrow", render: (row) => formatMoney(row.Escrow) },
      { key: "Next_Payment", label: "Próximo pago", render: (row) => formatMoney(row.Next_Payment) },
      { key: "Risk", label: "Score riesgo", render: (row) => statusBadge(row.Risk) },
      { key: "Action", label: "Acción recomendada" }
    ]} />
  );
}

function RiskPage({ title, subtitle, rows, cards, columns, loading, error, retry }: { title: string; subtitle: string; rows: RawRecord[]; cards?: Array<{ title: string; value: string | number; tone: "positive" | "warning" | "danger" | "info" | "neutral" }>; columns: Array<{ key: string; label: string; render?: (row: RawRecord) => ReactNode }>; loading: boolean; error: string; retry: () => void }) {
  const range = useDateRange(() => lastMonthsRange(3));
  const filteredRows = rows.filter((row) => dueDateInRange(row, range.startDate, range.endDate));
  return (
    <div className="grid gap-6">
      <section className="grid gap-4 xl:grid-cols-[1fr_auto]">
        <Header title={title} subtitle={subtitle} />
        {range.picker}
      </section>
      <ApiState loading={loading} error={error} retry={retry} />
      {cards ? <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{cards.map((kpi) => <KpiCard key={kpi.title} kpi={kpi} />)}</section> : null}
      <DataTable title={title} subtitle={range.showing} rows={filteredRows} columns={columns} />
    </div>
  );
}

export function ReconciliationPage() {
  const data = useCreditorPaymentData();
  const rows = reconciliationRows(data.payments);
  return <RiskPage title="Reconciliación" subtitle="Pagos vencidos sin Y y no cancelados en accounting." rows={rows} loading={data.loading} error={data.error} retry={data.refresh} columns={[
    { key: "Client_ID", label: "Cliente" },
    { key: "Current_Creditor", label: "Acreedor" },
    { key: "Amount", label: "Monto", render: (row) => formatMoney(row.Amount) },
    { key: "Due_Date", label: "Fecha debida" },
    { key: "Days_Overdue", label: "Días vencido" },
    { key: "Last_Y", label: "Último Y" },
    { key: "Problem", label: "Problema" },
    { key: "Action", label: "Acción" }
  ]} />;
}

export function NoFundsPage() {
  const data = useCreditorPaymentData();
  const rows = noFundsRows(data.payments, data.interactions);
  return <RiskPage title="Sin Fondos" subtitle="Clientes donde el balance disponible no cubre el próximo pago pendiente." rows={rows} loading={data.loading} error={data.error} retry={data.refresh} columns={[
    { key: "Client_ID", label: "Cliente" },
    { key: "Program", label: "Program" },
    { key: "Balance", label: "Balance disponible", render: (row) => formatMoney(row.Balance) },
    { key: "Next_Payment", label: "Próximo pago", render: (row) => formatMoney(row.Next_Payment) },
    { key: "Shortfall", label: "Shortfall", render: (row) => formatMoney(row.Shortfall) },
    { key: "Current_Creditor", label: "Acreedor" },
    { key: "Action", label: "Acción" }
  ]} />;
}

export function AtRiskPage() {
  const data = useCreditorPaymentData();
  const rows = atRiskRows(data.payments, data.interactions);
  return <RiskPage title="At Risk" subtitle="Último Y hace 30-60 días, antes de convertirse en broken." rows={rows} loading={data.loading} error={data.error} retry={data.refresh} columns={[
    { key: "Client_ID", label: "Cliente" },
    { key: "Program", label: "Program" },
    { key: "Current_Creditor", label: "Acreedor" },
    { key: "Days_Since_Y", label: "Días desde último Y" },
    { key: "Escrow", label: "Balance disponible", render: (row) => formatMoney(row.Escrow) },
    { key: "Next_Payment", label: "Próximo pago", render: (row) => formatMoney(row.Next_Payment) },
    { key: "Projected_Deficit", label: "Déficit proyectado", render: (row) => formatMoney(row.Projected_Deficit) },
    { key: "Risk", label: "Nivel riesgo", render: (row) => statusBadge(row.Risk) },
    { key: "Action", label: "Acción" }
  ]} />;
}

export function ActiveNegativePage() {
  const data = useCreditorPaymentData();
  const rows = activeNegativeRows(data.payments, data.interactions);
  return <RiskPage title="Active Negative" subtitle="Clientes activos con balance negativo o insuficiente para pendientes." rows={rows} loading={data.loading} error={data.error} retry={data.refresh} columns={[
    { key: "Client_ID", label: "Cliente" },
    { key: "Program", label: "Program" },
    { key: "Escrow", label: "Balance negativo", render: (row) => formatMoney(row.Escrow) },
    { key: "Pending_Amount", label: "Total pendiente", render: (row) => formatMoney(row.Pending_Amount) },
    { key: "Creditors", label: "Acreedores" },
    { key: "Client_Status", label: "Estado", render: (row) => statusBadge(row.Client_Status) },
    { key: "Action", label: "Acción" }
  ]} />;
}

export function UrgentPage() {
  const data = useCreditorPaymentData();
  const rows = urgentRows(data.payments, data.interactions);
  return <RiskPage title="Urgentes" subtitle="Broken >90d, active negative y sin fondos críticos agrupados por prioridad." rows={rows} loading={data.loading} error={data.error} retry={data.refresh} columns={[
    { key: "Client_ID", label: "Cliente" },
    { key: "Program", label: "Program" },
    { key: "Severity", label: "Estado", render: (row) => statusBadge(row.Severity) },
    { key: "Reason", label: "Motivo urgencia" },
    { key: "Days_Since_Y", label: "Meses sin pago", render: (row) => Number(row.Days_Since_Y ?? 0) ? (Number(row.Days_Since_Y) / 30).toFixed(1) : "-" },
    { key: "Escrow", label: "Fondos", render: (row) => formatMoney(row.Escrow ?? row.Balance) },
    { key: "Recommended_Action", label: "Acción recomendada" }
  ]} />;
}

export function AlertsPage() {
  const data = useCreditorPaymentData();
  const [severity, setSeverity] = useState("");
  const rows = alertRows(data.payments, data.interactions).filter((row) => !severity || row.Severity === severity);
  return (
    <div className="grid gap-6">
      <Header title="Alertas" subtitle="Todas las alertas clasificadas por severidad." />
      <ApiState loading={data.loading} error={data.error} retry={data.refresh} />
      <section className="card-pad">
        <select className="input-dark" value={severity} onChange={(event) => setSeverity(event.target.value)}>
          <option value="">Todas las severidades</option>
          <option value="Critical">Critical</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>
      </section>
      <DataTable title="Alertas" rows={rows} columns={[
        { key: "Severity", label: "Severidad", render: (row) => statusBadge(row.Severity) },
        { key: "Client_ID", label: "Cliente" },
        { key: "Current_Creditor", label: "Acreedor" },
        { key: "Description", label: "Descripción" },
        { key: "Action", label: "Acción" },
        { key: "Detected_Date", label: "Fecha detección" }
      ]} />
    </div>
  );
}

export function ReportsPage() {
  const data = useCreditorPaymentData();
  const [tab, setTab] = useState("paid");
  const paid = data.payments.filter(isPaid).sort((a, b) => String(b.Due_Date).localeCompare(String(a.Due_Date)));
  const unpaid = data.payments.filter((row) => !isPaid(row)).sort((a, b) => String(a.Due_Date).localeCompare(String(b.Due_Date)));
  const overdue = overdueUnpaid(data.payments);
  const risk = atRiskRows(data.payments, data.interactions);
  const tabs: Record<string, { label: string; rows: RawRecord[] }> = {
    paid: { label: "Paid Payments", rows: paid },
    unpaid: { label: "Unpaid Payments", rows: unpaid },
    overdue: { label: "Overdue", rows: overdue },
    risk: { label: "At Risk Settlements", rows: risk }
  };
  return (
    <div className="grid gap-6">
      <Header title="Reportes" subtitle="Reportes exportables de pagos, atrasos y riesgos." />
      <ApiState loading={data.loading} error={data.error} retry={data.refresh} />
      <section className="flex flex-wrap gap-2">
        {Object.entries(tabs).map(([key, item]) => <button key={key} className={`rounded-lg border px-3 py-2 text-sm ${tab === key ? "border-accent bg-orange-950/50 text-orange-200" : "border-border text-neutral-300"}`} onClick={() => setTab(key)}>{item.label}</button>)}
        <button className="rounded-lg border border-border px-3 py-2 text-sm text-neutral-300" onClick={() => exportCsv(`${tabs[tab].label}.csv`, tabs[tab].rows)}>Export CSV</button>
      </section>
      <DataTable title={tabs[tab].label} rows={tabs[tab].rows} columns={tab === "risk" ? [
        { key: "Client_ID", label: "Cliente" },
        { key: "Program", label: "Program" },
        { key: "Days_Since_Y", label: "Días sin Y" },
        { key: "Risk", label: "Riesgo", render: (row) => statusBadge(row.Risk) }
      ] : paymentColumns} />
    </div>
  );
}

export function ChatPage() {
  const data = useCreditorPaymentData();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; text: string }>>([]);
  const summaries = clientSummaries(data.payments, data.interactions);
  const groups = paymentsByClient(data.payments);
  const interactionsById = interactionMap(data.interactions);

  function answer(question: string) {
    if (data.error || (!data.payments.length && !data.interactions.length)) return "Primero asegúrate de que FastAPI esté corriendo en http://127.0.0.1:8000.";
    const lower = question.toLowerCase();
    const id = question.match(/\d{5,}/)?.[0];
    if (lower.includes("broken")) return `Hay ${brokenSettlements(data.payments, data.interactions).length} broken settlements.`;
    if (lower.includes("riesgo")) return `${atRiskRows(data.payments, data.interactions).length} clientes están en riesgo 30-60 días y ${brokenSettlements(data.payments, data.interactions).length} están broken.`;
    if (lower.includes("atras")) return `${overdueUnpaid(data.payments).length} pagos están atrasados sin Y.`;
    if (id && lower.includes("cuántos pagos")) return `El cliente ${id} completó ${(groups.get(id) ?? []).filter(isPaid).length} pagos.`;
    if (id && lower.includes("acreedores")) return `El cliente ${id} tiene: ${Array.from(new Set((groups.get(id) ?? []).map((row) => row.Current_Creditor))).join(", ") || "sin acreedores"}.`;
    if (id && lower.includes("balance")) return `El balance de ${id} es ${formatMoney(escrowBalance(interactionsById.get(id)))}.`;
    if (id) {
      const row = summaries.find((item) => item.Client_ID === id);
      return row ? `${id}: status ${row.Client_Status}, riesgo ${row.Risk}, pendientes ${row.Pending}, escrow ${formatMoney(row.Escrow)}.` : `No encontré el cliente ${id}.`;
    }
    return "Puedo responder sobre pagos completados, acreedores por cliente, balances, atrasos, riesgos y broken settlements.";
  }

  function send() {
    if (!input.trim()) return;
    const text = input.trim();
    setMessages((items) => [...items, { role: "user", text }, { role: "assistant", text: answer(text) }]);
    setInput("");
  }

  return (
    <div className="grid gap-6">
      <Header title="Chat Assistant" subtitle="Consulta los datos de creditor payments cargados localmente." />
      <ApiState loading={data.loading} error={data.error} retry={data.refresh} />
      <section className="card-pad grid min-h-[440px] grid-rows-[1fr_auto] gap-4">
        <div className="grid content-start gap-3">
          {messages.length ? messages.map((message, index) => (
            <div key={index} className={`max-w-2xl rounded-xl border border-border p-3 text-sm ${message.role === "user" ? "ml-auto bg-orange-950/30 text-orange-100" : "bg-neutral-950 text-neutral-200"}`}>{message.text}</div>
          )) : <p className="text-sm text-muted">Pregunta: “¿Cuántos broken settlements hay?” o “¿Qué acreedores tiene el cliente 900101?”</p>}
        </div>
        <div className="flex gap-2">
          <input className="input-dark flex-1" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") send(); }} placeholder="Escribe tu pregunta..." />
          <button className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white" onClick={send}>Enviar</button>
        </div>
      </section>
    </div>
  );
}
