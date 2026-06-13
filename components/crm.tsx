"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import {
  getClientInteractions,
  getCreditorStatus,
  getExpectedPayments,
  getNewEnrollments,
  getPaymentNSF,
  getPaymentsCleared,
  getSettlementPayments,
  getSettlements,
  getSettlementsPerDate,
  isFastApiReachable,
  isInRange,
  parseMoney,
  type RecordRow
} from "@/lib/api";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Badge } from "@/components/ui/badge";
import { Bars, Donut, DoubleBars } from "@/components/ui/charts";
import { DataTable } from "@/components/ui/data-table";
import { DateRangePicker, formatRange, thisMonthRange, todayRange } from "@/components/ui/date-range-picker";

type Bundle = {
  clientInteractions: RecordRow[];
  expectedPayments: RecordRow[];
  settlementPayments: RecordRow[];
  newEnrollments: RecordRow[];
  creditorStatus: RecordRow[];
  settlementsPerDate: RecordRow[];
  paymentsCleared: RecordRow[];
  paymentNSF: RecordRow[];
  settlements: RecordRow[];
};

const empty: Bundle = {
  clientInteractions: [],
  expectedPayments: [],
  settlementPayments: [],
  newEnrollments: [],
  creditorStatus: [],
  settlementsPerDate: [],
  paymentsCleared: [],
  paymentNSF: [],
  settlements: []
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function daysSince(value: any) {
  const d = new Date(`${String(value ?? "").slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return 0;
  return Math.floor((new Date(`${today()}T00:00:00`).getTime() - d.getTime()) / 86400000);
}

function monthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function clientName(row: RecordRow) {
  return `${row["First Name"] ?? row.Firstname ?? ""} ${row["Last Name"] ?? row.Lastname ?? ""}`.trim() || String(row.Client ?? row.Name ?? row["Client ID"] ?? "-");
}

function status(row: RecordRow) {
  return String(row["Client Status"] ?? "").trim();
}

function statusTone(value: any): "positive" | "warning" | "danger" | "info" | "yellow" | "neutral" {
  const text = String(value ?? "");
  if (/^Y$|active|sí|cleared|settled/i.test(text)) return "positive";
  if (/broken|cancel|void|negative|riesgo|vencido/i.test(text)) return "danger";
  if (/N$|nsf|pending|hold|medio|parcial|warning/i.test(text)) return "warning";
  if (/legal|info/i.test(text)) return "info";
  return "neutral";
}

function money(value: any) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(parseMoney(value));
}

function parseClearedDate(val: any): string {
  if (!val) return "";
  const s = String(val).trim();
  const parts = s.split("/");
  if (parts.length === 3) {
    const [mm, dd, yy] = parts;
    const year = yy.length === 2 ? `20${yy}` : yy;
    return `${year}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  return s;
}

function normalizeHeader(value: any): string {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ").replace(/[_.-]/g, " ").replace(/[^a-z0-9 ]/g, "");
}

function parseDate(value: any): string {
  if (!value) return "";
  let text = String(value).trim();
  if (!text) return "";
  text = text.replace(/\./g, "/").replace(/-/g, "/").replace(/\s+/g, " ").trim();
  const parts = text.split(/\//).map((part) => part.trim()).filter(Boolean);
  if (parts.length === 3) {
    let [a, b, c] = parts;
    if (a.length === 4) {
      return `${a}-${b.padStart(2, "0")}-${c.padStart(2, "0")}`;
    }
    if (c.length === 4) {
      return `${c}-${a.padStart(2, "0")}-${b.padStart(2, "0")}`;
    }
    if (c.length === 2) {
      return `20${c}-${a.padStart(2, "0")}-${b.padStart(2, "0")}`;
    }
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function dateDiffDays(start: string, end: string): number | null {
  const a = new Date(start);
  const b = new Date(end);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function seededRandom(seed: number) {
  return () => {
    const x = Math.sin(seed++) * 10000;
    seed += 1;
    return x - Math.floor(x);
  };
}

function formatMonthLabel(date: Date) {
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(date);
}

function downloadCsv(rows: RecordRow[], filename: string) {
  const csv = Papa.unparse(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

const SALES_HEADER_ALIASES: Record<string, string> = {
  "lead number": "Client ID",
  "client id": "Client ID",
  "client name": "Client Name",
  "name": "Client Name",
  "fecha de inscripción": "Enrollment Date",
  "enrollment date": "Enrollment Date",
  "deuda inscrita": "Total Enrolled Debt",
  "enrolled debt": "Total Enrolled Debt",
  "total enrolled debt": "Total Enrolled Debt",
  "monto primer pago": "First Payment Amount",
  "primer pago": "First Payment Amount",
  "first payment amount": "First Payment Amount",
  "expected first payment amount": "Expected First Payment Amount",
  "expected first payment": "Expected First Payment Amount",
  "first payment date": "First Payment Date",
  "fecha primer pago": "First Payment Date",
  "sales rep": "Sales Rep",
  "salesperson": "Sales Rep",
  "vendedor": "Sales Rep",
  "current": "Current",
  "al día": "Current",
  "late": "Late",
  "past due": "Past Due",
  "vencida": "Past Due",
  "estado": "State",
  "programa": "Program",
  "scheduled draft date": "Scheduled Draft Date",
  "next payment date": "Next Payment Date",
};

const RETENTION_HEADER_ALIASES: Record<string, string> = {
  "client id": "Client ID",
  "cliente id": "Client ID",
  "first name": "First Name",
  "nombre": "First Name",
  "last name": "Last Name",
  "apellido": "Last Name",
  "client status": "Client Status",
  "estado del cliente": "Client Status",
  "file status": "File Status",
  "days in client status": "Days in Client Status",
  "enrollment date": "Enrollment Date",
  "fecha de inscripción": "Enrollment Date",
  "first payment date": "First Payment Date",
  "fecha primer pago": "First Payment Date",
  "last payment date": "Last Payment Date",
  "payment months completed": "Payment Months Completed",
  "payment months skipped": "Payment Months Skipped",
  "payment months nsf": "Payment Months NSF",
  "payment months remaining": "Payment Months Remaining",
  "total enrolled debt": "Total Enrolled Debt",
  "deuda inscrita": "Total Enrolled Debt",
  "monthly payment amount": "Monthly Payment Amount",
  "settlement fee": "Settlement Fee",
  "total savings": "Total Savings",
  "cs rep": "CS Rep",
  "sales rep": "Sales Rep",
  "program": "Program",
  "state": "State",
};

function canonicalHeader(header: string, aliases: Record<string, string>) {
  const normalized = normalizeHeader(header);
  return aliases[normalized] ?? header;
}

function normalizeRowHeaders(row: Record<string, any>, headerMap: Record<string, string>) {
  const normalized: Record<string, any> = {};
  for (const [key, value] of Object.entries(row)) {
    const canonical = headerMap[key] ?? key;
    normalized[canonical] = value;
  }
  return normalized;
}

function getArrayValue<T>(array: T[], index: number, fallback: T) {
  return index < array.length ? array[index] : fallback;
}

function buildManualFieldOptions(headers: string[]) {
  return headers.map((header) => ({ value: header, label: header }));
}

function pickSalesHeader(header: string) {
  const canonical = canonicalHeader(header, SALES_HEADER_ALIASES);
  return canonical in SALES_HEADER_ALIASES || canonical === header ? canonical : header;
}

function legalCreditor(row: RecordRow) {
  return /attorney|legal|law/i.test(String(row["Current Creditor"] ?? ""));
}

function Loader({ error, loading, retry }: { error: boolean; loading: boolean; retry: () => void }) {
  if (loading) return <div className="rounded-[10px] border border-[#1f1f1f] bg-[#141414] p-6 text-center text-[#666]">Cargando...</div>;
  if (!error) return null;
  return (
    <div className="flex items-center justify-between rounded-[10px] border border-orange-900 bg-orange-950/40 p-4 text-sm text-orange-200">
      <span>Sin conexión con FastAPI. En local, arranca el backend con <code className="text-orange-100">npm run dev:api</code> (puerto 8000). En Vercel, configura <code className="text-orange-100">FASTAPI_URL</code> con la URL de tu backend (Railway).</span>
      <button className="shrink-0 rounded-md border border-orange-800 px-3 py-1" onClick={retry}>Reintentar</button>
    </div>
  );
}

function useBundle() {
  const [data, setData] = useState<Bundle>(empty);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const load = async () => {
    setLoading(true);
    setError(false);
    const [
      clientInteractions,
      expectedPayments,
      settlementPayments,
      newEnrollments,
      creditorStatus,
      settlementsPerDate,
      paymentsCleared,
      paymentNSF,
      settlements
    ] = await Promise.all([
      getClientInteractions(),
      getExpectedPayments(),
      getSettlementPayments(),
      getNewEnrollments(),
      getCreditorStatus(),
      getSettlementsPerDate(),
      getPaymentsCleared(),
      getPaymentNSF(),
      getSettlements()
    ]);
    const next = { clientInteractions, expectedPayments, settlementPayments, newEnrollments, creditorStatus, settlementsPerDate, paymentsCleared, paymentNSF, settlements };
    setData(next);
    const reachable = await isFastApiReachable();
    setError(!reachable);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);
  return { data, loading, error, reload: load };
}

function Header({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <section className="grid gap-4 xl:grid-cols-[1fr_auto]">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#666]">Settlements CRM</p>
        <h1 className="mt-2 text-3xl font-bold text-white">{title}</h1>
        {subtitle ? <p className="mt-2 text-sm text-[#666]">{subtitle}</p> : null}
      </div>
      {right}
    </section>
  );
}

function CardGrid({ children, cols = "xl:grid-cols-4" }: { children: ReactNode; cols?: string }) {
  return <section className={`grid gap-4 md:grid-cols-2 ${cols}`}>{children}</section>;
}

function statusCounts(rows: RecordRow[]) {
  const colors: Record<string, string> = { Active: "#22c55e", Cancelled: "#ef4444", NSF: "#f97316", Graduated: "#3b82f6", "On Hold": "#eab308" };
  const map = new Map<string, number>();
  for (const row of rows) {
    const s = status(row);
    if (s) map.set(s, (map.get(s) ?? 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value, color: colors[name] ?? (name.includes("Cancelled") ? "#ef4444" : name.includes("NSF") ? "#f97316" : "#6b7280") }));
}

function lastSixMonths() {
  const now = new Date();
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const key = monthKey(d);
    return { key, name: new Intl.DateTimeFormat("en-US", { month: "short" }).format(d) };
  });
}

function monthlyActivity(data: Bundle) {
  return lastSixMonths().map((m) => ({
    name: m.name,
    deposits: data.expectedPayments.filter((r) => String(r["Scheduled Draft Date"] ?? "").startsWith(m.key)).reduce((s, r) => s + parseMoney(r.Amount), 0),
    creditorPayments: data.settlementPayments.filter((r) => String(r["Due Date"] ?? "").startsWith(m.key)).reduce((s, r) => s + Math.abs(parseMoney(r.Amount)), 0)
  }));
}

function negotiableCount(data: Bundle) {
  const countRow = data.settlements.find((r) => typeof r.count === "number");
  return countRow ? Number(countRow.count) : data.settlements.length;
}

function isBrokenSettlement(status: unknown) {
  const s = String(status ?? "");
  return s === "S99_Broken Settlment" || s === "S99_Broken Settlement";
}

function settlementClientRows(data: Bundle) {
  return data.settlements.filter((r) => r.clientId || r.client);
}

function activeSettlementRows(rows: RecordRow[]) {
  const cutoff = rows.filter((r) => String(r["Payment Status"]) === "Y" && daysSince(r["Due Date"]) <= 60 && daysSince(r["Due Date"]) >= 0);
  const seen = new Map<string, RecordRow>();
  for (const row of cutoff) seen.set(`${row["Client ID"]}-${row["Current Creditor"]}`, row);
  return [...seen.values()];
}

function alertCategory(days: number) {
  if (days > 30) return "Broken Settlement";
  if (days > 20) return "Posible Broken";
  if (days > 15) return "Riesgo Alto";
  if (days > 10) return "Medio";
  if (days >= 1) return "En seguimiento";
  return "";
}

function alertRows(rows: RecordRow[]): Array<Record<string, any> & { _days: number; _category: string }> {
  return rows
    .filter((r) => String(r["Payment Status"]) !== "Y")
    .map((r) => ({ ...r, _days: daysSince(r["Due Date"]), _category: alertCategory(daysSince(r["Due Date"])) }))
    .filter((r) => r._days > 0);
}

export function DashboardPage() {
  const { data, loading, error, reload } = useBundle();
  const [start, end] = useMemo(() => todayRange(), []);
  const [range, setRange] = useState<[string, string]>([start, end]);
  const label = formatRange(range[0], range[1]);
  const enrollments = data.newEnrollments.filter((r) => isInRange(r["Status Date"], range[0], range[1]));
  const deposits = data.expectedPayments.filter((r) => isInRange(r["Scheduled Draft Date"], range[0], range[1]));
  const creditorPayments = data.settlementPayments.filter((r) => isInRange(r["Due Date"], range[0], range[1]));
  const cancelled = data.clientInteractions.filter((r) => isInRange(r["Last Note Date"], range[0], range[1]) && String(r["Last Note"] ?? "").toLowerCase().includes("cancelled"));
  const broken = data.creditorStatus.filter((r) => isBrokenSettlement(r["Creditor Status"]));
  const currentMonth = monthKey();
  return (
    <div className="grid gap-6">
      <Header title="Settlements CRM" subtitle={new Date().toLocaleDateString("es-ES", { weekday: "long", year: "numeric", month: "long", day: "numeric" })} right={<DateRangePicker start={range[0]} end={range[1]} onChange={(s, e) => setRange([s, e])} />} />
      <Loader loading={loading} error={error} retry={reload} />
      <CardGrid cols="xl:grid-cols-6">
        <KpiCard title="New Enrollments" value={enrollments.length} subtitle={label} tone="positive" />
        <KpiCard title="Total Enrolled Debt" value={data.newEnrollments.reduce((s, r) => s + parseMoney(r["Total Debt"]), 0)} subtitle="All New Enrollments" tone="info" />
        <KpiCard title="Client Deposits" value={deposits.length} subtitle={`${label} · ${money(deposits.reduce((s, r) => s + parseMoney(r.Amount), 0))}`} tone="info" />
        <KpiCard title="Creditor Payments" value={creditorPayments.length} subtitle={`${label} · ${money(creditorPayments.reduce((s, r) => s + Math.abs(parseMoney(r.Amount)), 0))}`} tone="warning" />
        <KpiCard title="Cancelled" value={cancelled.length} subtitle={label} tone="danger" />
        <KpiCard title="Broken Settlements" value={broken.length} subtitle="Creditor Status S99" tone="danger" />
      </CardGrid>
      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-[10px] border border-[#1f1f1f] bg-[#141414] p-5"><h2 className="font-semibold text-white">Clients by Status</h2><Donut data={statusCounts(data.clientInteractions).slice(0, 8)} /></div>
        <div className="rounded-[10px] border border-[#1f1f1f] bg-[#141414] p-5"><h2 className="font-semibold text-white">Monthly Activity</h2><DoubleBars data={monthlyActivity(data)} /></div>
      </section>
      <CardGrid>
        <KpiCard title="Activos" value={data.clientInteractions.filter((r) => status(r) === "Active").length} tone="positive" />
        <KpiCard title="NSF" value={data.clientInteractions.filter((r) => ["NSF", "NSF - First Payment"].includes(status(r))).length} tone="danger" />
        <KpiCard title="On Hold" value={data.clientInteractions.filter((r) => status(r) === "On Hold").length} tone="yellow" />
        <KpiCard title="Depósitos hoy" value={data.expectedPayments.filter((r) => r["Scheduled Draft Date"] === today()).length} tone="info" />
      </CardGrid>
      <CardGrid>
        <KpiCard title="Negociables" value={negotiableCount(data)} tone="warning" />
        <KpiCard title="Settlements mes" value={data.settlementsPerDate.filter((r) => String(r["Settlement Letter Date"] ?? "").startsWith(currentMonth)).length} tone="positive" />
        <KpiCard title="Broken" value={broken.length} tone="danger" />
        <KpiCard title="Alertas" value={alertRows(data.settlementPayments).filter((r) => r._days > 10).length} tone="warning" />
      </CardGrid>
      <DataTable title="Alertas críticas" rows={alertRows(data.settlementPayments).filter((r) => r._days > 30).sort((a, b) => b._days - a._days).slice(0, 10)} columns={[
        { key: "Client ID", label: "Cliente", render: clientName },
        { key: "Current Creditor", label: "Acreedor" },
        { key: "_days", label: "Días" },
        { key: "Amount", label: "Monto", render: (r) => money(Math.abs(parseMoney(r.Amount))) },
        { key: "Payment Status", label: "Status", render: (r) => <Badge tone={statusTone(r["Payment Status"])}>{String(r["Payment Status"] ?? "N")}</Badge> }
      ]} />
    </div>
  );
}

type ExpandCard = { id: string; title: string; value: string | number; subtitle?: string; tone?: any; rows: RecordRow[]; columns: any[] };

function ExpandableSection({ title, cards }: { title: string; cards: ExpandCard[] }) {
  const [open, setOpen] = useState("");
  const active = cards.find((c) => c.id === open);
  return (
    <section className="grid gap-3">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <CardGrid>
        {cards.map((c) => <button key={c.id} onClick={() => setOpen(open === c.id ? "" : c.id)} className="text-left"><KpiCard title={c.title} value={c.value} subtitle={c.subtitle} tone={c.tone ?? "neutral"} /></button>)}
      </CardGrid>
      {active ? <DataTable title={active.title} rows={active.rows.slice(0, 200)} columns={active.columns} pageSize={10} /> : null}
    </section>
  );
}

export function FinanceOverviewPage() {
  const { data, loading, error, reload } = useBundle();
  const active = data.clientInteractions.filter((r) => status(r) === "Active");
  const nsf = data.clientInteractions.filter((r) => ["NSF", "NSF - First Payment"].includes(status(r)));
  const onHold = data.clientInteractions.filter((r) => status(r) === "On Hold");
  const waiting = data.clientInteractions.filter((r) => status(r) === "Waiting for first payment");
  const depositsToday = data.expectedPayments.filter((r) => r["Scheduled Draft Date"] === today() && r["Payment Status"] === "Scheduled");
  const activeDeals = activeSettlementRows(data.settlementPayments);
  const paid60 = data.settlementPayments.filter((r) => r["Payment Status"] === "Y" && daysSince(r["Due Date"]) <= 60 && daysSince(r["Due Date"]) >= 0);
  const currentMonth = monthKey();
  const alerts = alertRows(data.settlementPayments);
  const clientCols = [
    { key: "First Name", label: "Nombre", render: clientName },
    { key: "Client ID", label: "Client ID" },
    { key: "Monthly Payment Amount", label: "Monthly Payment", render: (r: RecordRow) => money(r["Monthly Payment Amount"]) },
    { key: "Total Enrolled Debt", label: "Total Enrolled Debt", render: (r: RecordRow) => money(r["Total Enrolled Debt"]) }
  ];
  const paymentCols = [
    { key: "Client ID", label: "Cliente", render: clientName },
    { key: "Current Creditor", label: "Acreedor" },
    { key: "Due Date", label: "Fecha" },
    { key: "Amount", label: "Monto", render: (r: RecordRow) => money(Math.abs(parseMoney(r.Amount))) }
  ];
  return (
    <div className="grid gap-8">
      <Header title="Finance Overview" subtitle="Operational finance workspace." />
      <Loader loading={loading} error={error} retry={reload} />
      <ExpandableSection title="Client Deposits" cards={[
        { id: "active", title: "Activos", value: active.length, tone: "positive", rows: active, columns: clientCols },
        { id: "nsf", title: "NSF", value: nsf.length, tone: "danger", rows: nsf, columns: clientCols },
        { id: "hold", title: "On Hold", value: onHold.length, tone: "yellow", rows: onHold, columns: clientCols },
        { id: "waiting", title: "Waiting", value: waiting.length, tone: "neutral", rows: waiting, columns: clientCols },
        { id: "deposits", title: "Depósitos hoy", value: depositsToday.length, subtitle: money(depositsToday.reduce((s, r) => s + parseMoney(r.Amount), 0)), tone: "info", rows: depositsToday, columns: [{ key: "First Name", label: "Cliente", render: clientName }, { key: "Amount", label: "Amount", render: (r: RecordRow) => money(r.Amount) }, { key: "Scheduled Draft Date", label: "Fecha" }] }
      ]} />
      <ExpandableSection title="Pagos al Acreedor" cards={[
        { id: "deals", title: "Negocios Activos", value: activeDeals.length, tone: "positive", rows: activeDeals, columns: paymentCols },
        { id: "money", title: "Dinero Saliendo", value: paid60.reduce((s, r) => s + Math.abs(parseMoney(r.Amount)), 0), tone: "warning", rows: paid60, columns: paymentCols },
        { id: "today", title: "Pagos Hoy", value: data.settlementPayments.filter((r) => r["Due Date"] === today()).length, tone: "info", rows: data.settlementPayments.filter((r) => r["Due Date"] === today()), columns: paymentCols },
        { id: "legal", title: "En Legal", value: data.settlementPayments.filter(legalCreditor).length, tone: "danger", rows: data.settlementPayments.filter(legalCreditor), columns: paymentCols }
      ]} />
      <section className="grid gap-3">
        <h2 className="text-lg font-semibold text-white">Revenue</h2>
        <CardGrid>
          <KpiCard title="Fees Agendados" value={active.reduce((s, r) => s + parseMoney(r["Settlement Fee"]), 0)} tone="warning" />
          <KpiCard title="Fees Cobrados" value={data.paymentsCleared.reduce((s, r) => s + Math.max(0, parseMoney(r["Service Fee Amount"])) + Math.max(0, parseMoney(r["Legal Fee Amount"])), 0)} tone="positive" />
          <KpiCard title="Cleared Este Mes" value={data.paymentsCleared.filter((r) => parseClearedDate(r["Date Cleared"]).startsWith(currentMonth)).reduce((s, r) => s + parseMoney(r["Draft Amount"]), 0)} tone="info" />
          <div className="rounded-[10px] border border-yellow-800 bg-yellow-950/40 p-5 text-sm text-yellow-200">⚠️ Reporte de Commissions no disponible para el usuario actual (comm plan is invalid). Contacta al administrador de DebtManager.</div>
        </CardGrid>
      </section>
      <ExpandableSection title="Alertas Reconciliación" cards={["En seguimiento", "Medio", "Riesgo Alto", "Posible Broken", "Broken Settlement"].map((cat) => ({ id: cat, title: cat, value: alerts.filter((r) => r._category === cat).length, tone: cat.includes("Broken") ? "danger" : cat === "En seguimiento" ? "info" : "warning", rows: alerts.filter((r) => r._category === cat), columns: paymentCols.concat([{ key: "_days", label: "Días" }]) }))} />
    </div>
  );
}

export function ClientDepositsPage() {
  const { data, loading, error, reload } = useBundle();
  const [start, end] = useMemo(() => thisMonthRange(), []);
  const [range, setRange] = useState<[string, string]>([start, end]);
  const rows = data.expectedPayments.filter((r) => r["Payment Status"] === "Scheduled" && isInRange(r["Scheduled Draft Date"], range[0], range[1])).sort((a, b) => String(a["Scheduled Draft Date"]).localeCompare(String(b["Scheduled Draft Date"])));
  return (
    <div className="grid gap-6">
      <Header title="Client Deposits" right={<DateRangePicker start={range[0]} end={range[1]} onChange={(s, e) => setRange([s, e])} />} />
      <Loader loading={loading} error={error} retry={reload} />
      <CardGrid cols="xl:grid-cols-5">
        <KpiCard title="Active" value={data.clientInteractions.filter((r) => status(r) === "Active").length} tone="positive" />
        <KpiCard title="NSF" value={data.clientInteractions.filter((r) => ["NSF", "NSF - First Payment"].includes(status(r))).length} tone="danger" />
        <KpiCard title="On Hold" value={data.clientInteractions.filter((r) => status(r) === "On Hold").length} tone="yellow" />
        <KpiCard title="Waiting" value={data.clientInteractions.filter((r) => status(r) === "Waiting for first payment").length} tone="neutral" />
        <KpiCard title="Promised to Pay" value={data.clientInteractions.filter((r) => status(r) === "Promised to Pay").length} tone="info" />
      </CardGrid>
      <DataTable title="Pagos Scheduled" subtitle={`${rows.length} pagos · ${money(rows.reduce((s, r) => s + parseMoney(r.Amount), 0))}`} rows={rows} columns={[
        { key: "First Name", label: "Cliente", render: clientName },
        { key: "Client Status", label: "Status", render: (r) => <Badge tone={statusTone(r["Client Status"])}>{String(r["Client Status"] ?? "-")}</Badge> },
        { key: "Scheduled Draft Date", label: "Fecha" },
        { key: "Amount", label: "Monto", render: (r) => money(r.Amount) },
        { key: "Badge", label: "Badge", render: (r) => { const d = daysSince(r["Scheduled Draft Date"]); return <Badge tone={d > 0 ? "danger" : d === 0 ? "warning" : "neutral"}>{d > 0 ? "Vencido" : d === 0 ? "Hoy" : "Próximo"}</Badge>; } }
      ]} />
    </div>
  );
}

export function CreditorPaymentsOverviewPage() {
  const { data, loading, error, reload } = useBundle();
  const [start, end] = useMemo(() => thisMonthRange(), []);
  const [range, setRange] = useState<[string, string]>([start, end]);
  const rows = data.settlementPayments.filter((r) => isInRange(r["Due Date"], range[0], range[1]));
  const paid60 = data.settlementPayments.filter((r) => r["Payment Status"] === "Y" && daysSince(r["Due Date"]) <= 60 && daysSince(r["Due Date"]) >= 0);
  return (
    <div className="grid gap-6">
      <Header title="Pagos al Acreedor" right={<DateRangePicker start={range[0]} end={range[1]} onChange={(s, e) => setRange([s, e])} />} />
      <Loader loading={loading} error={error} retry={reload} />
      <CardGrid>
        <KpiCard title="Negocios Activos" value={activeSettlementRows(data.settlementPayments).length} tone="positive" />
        <KpiCard title="Dinero Saliendo" value={paid60.reduce((s, r) => s + Math.abs(parseMoney(r.Amount)), 0)} tone="warning" />
        <KpiCard title="Pagos en Rango" value={rows.length} subtitle={money(rows.reduce((s, r) => s + Math.abs(parseMoney(r.Amount)), 0))} tone="info" />
        <KpiCard title="En Legal" value={data.settlementPayments.filter(legalCreditor).length} tone="danger" />
      </CardGrid>
      <DataTable title="Settlement Payment Report" rows={rows} columns={[
        { key: "Client ID", label: "Cliente", render: clientName },
        { key: "Current Creditor", label: "Acreedor" },
        { key: "Payment Number", label: "Pago#" },
        { key: "Due Date", label: "Fecha" },
        { key: "Amount", label: "Monto", render: (r) => money(Math.abs(parseMoney(r.Amount))) },
        { key: "Payment Status", label: "Status", render: (r) => <Badge tone={r["Payment Status"] === "Y" ? "positive" : "warning"}>{String(r["Payment Status"] ?? "N")}</Badge> }
      ]} />
    </div>
  );
}

export function RevenuePage() {
  const { data, loading, error, reload } = useBundle();
  const [start, end] = useMemo(() => thisMonthRange(), []);
  const [range, setRange] = useState<[string, string]>([start, end]);
  const active = data.clientInteractions.filter((r) => status(r) === "Active");
  const cleared = data.paymentsCleared.filter((r) => isInRange(parseClearedDate(r["Date Cleared"]), range[0], range[1]));
  const currentMonth = monthKey();
  return (
    <div className="grid gap-6">
      <Header title="Revenue" right={<DateRangePicker start={range[0]} end={range[1]} onChange={(s, e) => setRange([s, e])} />} />
      <Loader loading={loading} error={error} retry={reload} />
      <CardGrid>
        <KpiCard title="Fees Agendados" value={active.reduce((s, r) => s + parseMoney(r["Settlement Fee"]), 0)} tone="warning" />
        <KpiCard title="Fees Cobrados" value={data.paymentsCleared.reduce((s, r) => s + Math.max(0, parseMoney(r["Service Fee Amount"])) + Math.max(0, parseMoney(r["Legal Fee Amount"])), 0)} tone="positive" />
        <KpiCard title="Pagos Cleared este mes" value={data.paymentsCleared.filter((r) => parseClearedDate(r["Date Cleared"]).startsWith(currentMonth)).reduce((s, r) => s + parseMoney(r["Draft Amount"]), 0)} tone="info" />
        <div className="rounded-[10px] border border-yellow-800 bg-yellow-950/40 p-5 text-sm text-yellow-200">⚠️ Reporte de Commissions no disponible para el usuario actual (comm plan is invalid). Contacta al administrador de DebtManager.</div>
      </CardGrid>
      <DataTable title="Payments Cleared" rows={cleared} columns={[
        { key: "Client ID", label: "Client ID" },
        { key: "Name", label: "Name" },
        { key: "Draft Amount", label: "Draft Amount", render: (r) => money(r["Draft Amount"]) },
        { key: "Service Fee Amount", label: "Service Fee", render: (r) => money(r["Service Fee Amount"]) },
        { key: "Date Cleared", label: "Date Cleared" },
        { key: "Client Status", label: "Client Status" }
      ]} />
    </div>
  );
}

export function AlertsPage() {
  const { data, loading, error, reload } = useBundle();
  const [filter, setFilter] = useState("");
  const rows = alertRows(data.settlementPayments).filter((r) => !filter || r._category === filter);
  const cats = ["En seguimiento", "Medio", "Riesgo Alto", "Posible Broken", "Broken Settlement"];
  return (
    <div className="grid gap-6">
      <Header title="Alertas de Reconciliación" />
      <Loader loading={loading} error={error} retry={reload} />
      <CardGrid cols="xl:grid-cols-5">{cats.map((c) => <button key={c} onClick={() => setFilter(filter === c ? "" : c)}><KpiCard title={c} value={alertRows(data.settlementPayments).filter((r) => r._category === c).length} tone={c.includes("Broken") ? "danger" : c === "En seguimiento" ? "info" : "warning"} /></button>)}</CardGrid>
      <DataTable title="Alertas" rows={rows} columns={[
        { key: "Client ID", label: "Cliente", render: clientName },
        { key: "Current Creditor", label: "Acreedor" },
        { key: "Due Date", label: "Due Date" },
        { key: "_days", label: "Días" },
        { key: "Amount", label: "Monto", render: (r) => money(Math.abs(parseMoney(r.Amount))) },
        { key: "_category", label: "Categoría" }
      ]} />
    </div>
  );
}

export function SettlementOverviewPage() {
  const { data, loading, error, reload } = useBundle();
  const currentMonth = monthKey();
  return (
    <div className="grid gap-6">
      <Header title="Settlement Overview" />
      <Loader loading={loading} error={error} retry={reload} />
      <CardGrid cols="xl:grid-cols-6">
        <KpiCard title="Negociables" value={negotiableCount(data)} tone="warning" />
        <KpiCard title="Settlements Activos" value={activeSettlementRows(data.settlementPayments).length} tone="positive" />
        <KpiCard title="Alertas" value={alertRows(data.settlementPayments).filter((r) => r._days > 10).length} tone="warning" />
        <KpiCard title="Settlements Mes" value={data.settlementsPerDate.filter((r) => String(r["Settlement Letter Date"] ?? "").startsWith(currentMonth)).length} tone="positive" />
        <KpiCard title="Broken Creditor" value={data.creditorStatus.filter((r) => isBrokenSettlement(r["Creditor Status"])).length} tone="danger" />
        <KpiCard title="No Posibles" value={notPossibleRows(data).length} tone="danger" />
      </CardGrid>
    </div>
  );
}

function creditorStatusColor(s: string): any {
  if (["Not Included", "INC", "LXNOINC"].includes(s)) return "neutral";
  if (s === "S101_Settled and Paid" || ["SP", "S", "S98_ReSettled"].some((x) => s.startsWith(x))) return "positive";
  if (/^S(2|20|3|30|33|6|70|66|67|82|81)_/.test(s)) return "warning";
  if (isBrokenSettlement(s)) return "danger";
  if (s === "L") return "info";
  return "neutral";
}

function debtMap(data: Bundle) {
  const m = new Map<string, RecordRow>();
  for (const r of data.settlementPayments) if (!m.has(String(r["Client ID"]))) m.set(String(r["Client ID"]), r);
  return m;
}

export function CreditorStatusPage() {
  const { data, loading, error, reload } = useBundle();
  const [q, setQ] = useState("");
  const pay = debtMap(data);
  const rows = data.creditorStatus.filter((r) => !q || JSON.stringify(r).toLowerCase().includes(q.toLowerCase())).map((r) => ({ ...r, _debt: parseMoney(pay.get(String(r["Client ID"]))?.["Total Debt"]) || parseMoney(pay.get(String(r["Client ID"]))?.["Balance Current"]) || "—" }));
  const counts = statusCounts(data.creditorStatus.map((r) => ({ "Client Status": r["Creditor Status"] })));
  return (
    <div className="grid gap-6">
      <Header title="Creditor Status" />
      <Loader loading={loading} error={error} retry={reload} />
      <CardGrid cols="xl:grid-cols-6">{counts.slice(0, 12).map((c) => <KpiCard key={c.name} title={c.name} value={c.value} tone={creditorStatusColor(c.name)} />)}</CardGrid>
      <input className="rounded-md border border-[#1f1f1f] bg-[#141414] px-3 py-2 text-sm" placeholder="Filter Client ID, Lastname, Creditor..." value={q} onChange={(e) => setQ(e.target.value)} />
      <DataTable title="Creditor Status" rows={rows} columns={[
        { key: "Client ID", label: "Client ID" },
        { key: "Lastname", label: "Lastname" },
        { key: "Creditor Name", label: "Creditor Name" },
        { key: "Creditor Status", label: "Creditor Status", render: (r) => <Badge tone={creditorStatusColor(String(r["Creditor Status"]))}>{String(r["Creditor Status"] ?? "-")}</Badge> },
        { key: "NegotiatorID", label: "NegotiatorID" },
        { key: "Status Date", label: "Status Date" },
        { key: "_debt", label: "Total Debt", render: (r) => typeof r._debt === "number" ? money(r._debt) : "—" },
        { key: "Settlement Pmt Due Date", label: "Settlement Pmt Due Date" }
      ]} />
    </div>
  );
}

export function MonthlySettlementsPage() {
  const { data, loading, error, reload } = useBundle();
  const [start, end] = useMemo(() => thisMonthRange(), []);
  const [range, setRange] = useState<[string, string]>([start, end]);
  const rows = data.settlementsPerDate.filter((r) => isInRange(r["Settlement Letter Date"], range[0], range[1]));
  const debt = rows.reduce((s, r) => s + parseMoney(r["Balance At Settlement"]), 0);
  const amount = rows.reduce((s, r) => s + parseMoney(r["Settlement Amount"]), 0);
  return (
    <div className="grid gap-6">
      <Header title="Settlements del Mes" right={<DateRangePicker start={range[0]} end={range[1]} onChange={(s, e) => setRange([s, e])} />} />
      <Loader loading={loading} error={error} retry={reload} />
      <CardGrid><KpiCard title="Count" value={rows.length} /><KpiCard title="Deuda negociada" value={debt} /><KpiCard title="Monto" value={amount} /><KpiCard title="Ahorro" value={debt - amount} tone="positive" /></CardGrid>
      <DataTable title="Settlements" subtitle={`Total deuda: ${money(debt)} · Total settlement: ${money(amount)} · Ahorro: ${money(debt - amount)}`} rows={rows} columns={[
        { key: "Client ID", label: "Cliente", render: clientName },
        { key: "Name", label: "Acreedor" },
        { key: "Negotiator", label: "Negociador" },
        { key: "Settlement Letter Date", label: "Fecha" },
        { key: "Balance At Settlement", label: "Balance", render: (r) => money(r["Balance At Settlement"]) },
        { key: "Settlement Amount", label: "Settlement", render: (r) => money(r["Settlement Amount"]) },
        { key: "Settlement Percentage", label: "%" },
        { key: "Settlement Fee", label: "Fee" }
      ]} />
    </div>
  );
}

function escrowFor(data: Bundle, id: string) {
  const row = data.clientInteractions.find((r) => String(r["Client ID"]) === id);
  return parseMoney(row?.["CFTPay Escrow Balance"]) || parseMoney(row?.["Company Bank Balance"]);
}

export function FuturesPage() {
  const { data, loading, error, reload } = useBundle();
  const pay = debtMap(data);
  const rows = data.creditorStatus.filter((r) => ["Not Included", "INC", "LXNOINC"].includes(String(r["Creditor Status"]))).map((r) => {
    const escrow = escrowFor(data, String(r["Client ID"]));
    const debt = parseMoney(pay.get(String(r["Client ID"]))?.["Total Debt"]) || parseMoney(pay.get(String(r["Client ID"]))?.["Balance Current"]);
    return { ...r, _escrow: escrow, _debt: debt, _offer: debt * 0.55, _covers: escrow >= debt * 0.55 };
  });
  return (
    <div className="grid gap-6">
      <Header title="Futuros" />
      <Loader loading={loading} error={error} retry={reload} />
      <CardGrid><KpiCard title="Sin acuerdo" value={rows.length} /><KpiCard title="Con fondos" value={rows.filter((r) => r._escrow > 0).length} /><KpiCard title="Negociables 55%" value={rows.filter((r) => r._covers).length} tone="positive" /></CardGrid>
      <DataTable title="Cuentas futuras" rows={rows} columns={[
        { key: "Lastname", label: "Lastname" },
        { key: "Creditor Name", label: "Creditor Name" },
        { key: "Creditor Status", label: "Status" },
        { key: "_escrow", label: "Escrow", render: (r) => money(r._escrow) },
        { key: "_offer", label: "Oferta 55%", render: (r) => money(r._offer) },
        { key: "_covers", label: "¿Cubre?", render: (r) => <Badge tone={r._covers ? "positive" : "warning"}>{r._covers ? "Sí" : "Parcial"}</Badge> }
      ]} />
    </div>
  );
}

export function NegotiablesPage() {
  const { data, loading, error, reload } = useBundle();
  const clients = settlementClientRows(data);
  const rows = clients.flatMap((c) => {
    const debts = Array.isArray(c.debts)
      ? c.debts
      : [...(Array.isArray(c.readyDebts) ? c.readyDebts : []), ...(Array.isArray(c.pendingDebts) ? c.pendingDebts : [])];
    if (!debts.length) {
      return [{ ...c, _creditor: "-", _balance: 0, _percent: 0, _ready: false }];
    }
    return debts.map((d: RecordRow) => ({
      ...c,
      _creditor: String(d.creditor ?? d.originalCreditor ?? "-"),
      _balance: parseMoney(d.balance),
      _percent: Number(d.percent ?? 0),
      _ready: Number(d.percent ?? 0) >= 100
    }));
  });
  const readyClients = clients.filter((c) => Array.isArray(c.readyDebts) && c.readyDebts.length > 0).length;
  const totalEscrow = clients.reduce((s, c) => s + parseMoney(c.escrow), 0);
  return (
    <div className="grid gap-6">
      <Header title="Negociables" subtitle="Clientes con escrow ≥ 40% listos para negociar" />
      <Loader loading={loading} error={error} retry={reload} />
      <CardGrid>
        <KpiCard title="Clientes negociables" value={clients.length} tone="warning" />
        <KpiCard title="Con deudas listas" value={readyClients} tone="positive" />
        <KpiCard title="Escrow total" value={money(totalEscrow)} tone="info" />
        <KpiCard title="Deudas pendientes" value={rows.filter((r) => !r._ready).length} tone="warning" />
      </CardGrid>
      <DataTable title="Clientes negociables" rows={rows} columns={[
        { key: "clientId", label: "Client ID", render: (r) => String(r.clientId ?? "-") },
        { key: "client", label: "Cliente", render: (r) => String(r.client ?? "-") },
        { key: "_creditor", label: "Acreedor" },
        { key: "_balance", label: "Balance", render: (r) => money(r._balance) },
        { key: "escrow", label: "Escrow", render: (r) => money(parseMoney(r.escrow)) },
        { key: "_percent", label: "% Fondos", render: (r) => `${Number(r._percent).toFixed(1)}%` },
        { key: "_ready", label: "Lista", render: (r) => <Badge tone={r._ready ? "positive" : "warning"}>{r._ready ? "Sí" : "Pendiente"}</Badge> }
      ]} />
    </div>
  );
}

function notPossibleRows(data: Bundle) {
  const statuses = new Set(["S40_Account Ineligible", "S50_Offer Reject", "REMOVEPEND", "ADDPEND", "VOIDED"]);
  return data.creditorStatus.filter((r) => statuses.has(String(r["Creditor Status"])));
}

export function NotPossiblePage() {
  const { data, loading, error, reload } = useBundle();
  const rows = notPossibleRows(data);
  return <div className="grid gap-6"><Header title="No Posibles" /><Loader loading={loading} error={error} retry={reload} /><CardGrid>{["S40_Account Ineligible", "S50_Offer Reject", "REMOVEPEND", "ADDPEND"].map((s) => <KpiCard key={s} title={s} value={rows.filter((r) => r["Creditor Status"] === s).length} tone="danger" />)}</CardGrid><DataTable title="No Posibles" rows={rows} columns={[{ key: "Client ID", label: "Client ID" }, { key: "Lastname", label: "Lastname" }, { key: "Creditor Name", label: "Acreedor" }, { key: "Creditor Status", label: "Status" }, { key: "Status Date", label: "Status Date" }]} /></div>;
}

export function BrokenSettlementPage() {
  const { data, loading, error, reload } = useBundle();
  const pay = debtMap(data);
  const byId = new Map<string, RecordRow>();
  for (const r of data.creditorStatus.filter((r) => isBrokenSettlement(r["Creditor Status"]))) byId.set(String(r["Client ID"]), { ...r, _source: "Creditor Status" });
  for (const r of alertRows(data.settlementPayments).filter((r) => r._days > 30)) {
    const id = String(r["Client ID"]);
    if (!byId.has(id)) byId.set(id, { ...r, _source: "Sin pago 30d+" });
  }
  const rows = [...byId.values()].map((r) => ({ ...r, _amount: parseMoney(r["Total Debt"]) || parseMoney(r["Balance Current"]) || parseMoney(pay.get(String(r["Client ID"]))?.["Total Debt"]) }));
  return <div className="grid gap-6"><Header title="Rotos" /><Loader loading={loading} error={error} retry={reload} /><DataTable title="Settlements Rotos" rows={rows} columns={[{ key: "Client ID", label: "Cliente", render: clientName }, { key: "Creditor Name", label: "Acreedor", render: (r) => String(r["Creditor Name"] ?? r["Current Creditor"] ?? "-") }, { key: "Status Date", label: "Status Date" }, { key: "_days", label: "Días sin pago" }, { key: "_amount", label: "Monto", render: (r) => money(r._amount) }, { key: "_source", label: "Fuente", render: (r) => <Badge tone="danger">{String(r._source)}</Badge> }]} /></div>;
}

export function SettlementPlanPage() {
  const { data, loading, error, reload } = useBundle();
  const rows = data.newEnrollments.map((r) => {
    const debt = parseMoney(r["Total Debt"]);
    const monthly = debt * 0.03;
    const target = debt * 0.55;
    const month = [1, 2, 3, 4, 5, 6].find((m) => monthly * m >= target) ?? 7;
    return { ...r, _monthly: monthly, _target: target, _month: month };
  });
  return <div className="grid gap-6"><Header title="Settlement Plan" /><Loader loading={loading} error={error} retry={reload} /><DataTable title="Plan" rows={rows} columns={[{ key: "Client", label: "Client" }, { key: "Total Debt", label: "Total Debt", render: (r) => money(r["Total Debt"]) }, { key: "_monthly", label: "Monthly est.", render: (r) => money(r._monthly) }, { key: "_target", label: "55%", render: (r) => money(r._target) }, { key: "_month", label: "Primer settlement posible", render: (r) => Number(r._month) > 6 ? "Mes 7+" : `Mes ${r._month}` }]} /></div>;
}

const SALES_REQUIRED_HEADERS = [
  "Client ID",
  "Client Name",
  "Enrollment Date",
  "Total Enrolled Debt",
  "Expected First Payment Amount",
  "First Payment Amount",
  "First Payment Date",
  "Sales Rep"
];

const RETENTION_REQUIRED_HEADERS = [
  "Client ID",
  "First Name",
  "Last Name",
  "Client Status",
  "File Status",
  "Days in Client Status",
  "Enrollment Date",
  "First Payment Date",
  "Last Payment Date",
  "Payment Months Completed",
  "Payment Months Skipped",
  "Payment Months NSF",
  "Payment Months Remaining",
  "Total Enrolled Debt",
  "Monthly Payment Amount",
  "Total Number of Months",
  "Cancellation Reasons",
  "CS Rep",
  "Sales Rep",
  "Program",
  "State",
  "Settlement Fee",
  "Total Savings"
];

function buildHeaderMap(headers: string[], aliases: Record<string, string>, manualMap: Record<string, string>) {
  const map: Record<string, string> = {};
  headers.forEach((header) => {
    const canonical = canonicalHeader(header, aliases);
    map[header] = canonical;
  });
  for (const [targetHeader, sourceHeader] of Object.entries(manualMap)) {
    if (sourceHeader) map[sourceHeader] = targetHeader;
  }
  return map;
}

function parseSalesRows(rawRows: RecordRow[], headerMap: Record<string, string>) {
  const today = new Date().toISOString().slice(0, 10);
  return rawRows.map((row) => {
    const normalized = normalizeRowHeaders(row, headerMap);
    const enrollmentDate = parseDate(normalized["Enrollment Date"]);
    const firstPaymentDate = parseDate(normalized["First Payment Date"]);
    const firstPaymentAmount = parseMoney(normalized["First Payment Amount"]);
    const expectedAmount = parseMoney(normalized["Expected First Payment Amount"]);
    const daysToFirstPayment = enrollmentDate && firstPaymentDate ? dateDiffDays(enrollmentDate, firstPaymentDate) : null;
    const madeFirstPayment = firstPaymentAmount > 0;
    const isComplete = madeFirstPayment && expectedAmount > 0 && firstPaymentAmount >= expectedAmount;
    const isPartial = madeFirstPayment && expectedAmount > 0 && firstPaymentAmount < expectedAmount;
    const isMissing = !madeFirstPayment;
    const futureDate = parseDate(normalized["Scheduled Draft Date"] || normalized["Next Payment Date"] || normalized["Due Date"] || normalized["Next Payment"]);
    const futurePayment = futureDate && futureDate > today ? futureDate : "";
    const timingBucket = daysToFirstPayment === null ? "No First Payment"
      : daysToFirstPayment === 0 ? "Same Day"
      : daysToFirstPayment <= 3 ? "1-3 Days"
      : daysToFirstPayment <= 7 ? "4-7 Days"
      : daysToFirstPayment <= 15 ? "8-15 Days"
      : "16+ Days";
    const pastDue = parseMoney(normalized["Past Due"]) > 0 || parseMoney(normalized["Late"]) > 0 || /late|past due|vencida/i.test(String(normalized["Payment Status"] ?? normalized["Status"] ?? normalized["Late"] ?? ""));
    return {
      ...normalized,
      "Enrollment Date": enrollmentDate,
      "First Payment Date": firstPaymentDate,
      "First Payment Amount": firstPaymentAmount,
      "Expected First Payment Amount": expectedAmount,
      _firstPaymentAmount: firstPaymentAmount,
      _expectedFirstPaymentAmount: expectedAmount,
      _daysToFirstPayment: daysToFirstPayment,
      _timingBucket: isMissing ? "No First Payment" : timingBucket,
      _futurePaymentDate: futurePayment,
      _madeFirstPayment: madeFirstPayment,
      _isComplete: isComplete,
      _isPartial: isPartial,
      _isMissing: isMissing,
      _pastDue: pastDue
    };
  });
}

function normalizeSalesDisplayRow(row: RecordRow) {
  return {
    ...row,
    "First Payment Amount": row._firstPaymentAmount ?? parseMoney(row["First Payment Amount"]),
    "Expected First Payment Amount": row._expectedFirstPaymentAmount ?? parseMoney(row["Expected First Payment Amount"])
  };
}

function generateSalesDemoRows(count = 30) {
  const firstNames = ["Ava", "Noah", "Mia", "Luca", "Sofia", "Mateo", "Emma", "Leo", "Isabella", "Gabriel"];
  const lastNames = ["Garcia", "Lopez", "Martinez", "Rodriguez", "Hernandez", "Perez", "Sanchez", "Ramirez", "Torres", "Flores"];
  const reps = ["Maria", "Carlos", "Jose", "Ana", "Luis", "Santiago", "Valeria", "Miguel", "Camila", "Diego"];
  const states = ["CA", "TX", "FL", "NY", "IL", "GA", "AZ", "CO", "NV", "WA"];
  const programs = ["Standard", "Premium", "Legal Plus", "Debt Relief"];
  return Array.from({ length: count }, (_, index) => {
    const rand = seededRandom(1024 + index);
    const client = `${firstNames[index % firstNames.length]} ${lastNames[index % lastNames.length]}`;
    const enrollment = new Date(2024, Math.floor(rand() * 24), Math.floor(rand() * 28) + 1);
    const enrollmentDate = enrollment.toISOString().slice(0, 10);
    const debt = 1200 + Math.round(rand() * 7200);
    const expected = Math.round(debt * (0.12 + rand() * 0.08));
    const made = rand() > 0.25;
    const paymentDelay = made ? Math.floor(rand() * 40) : 0;
    const firstPaymentDate = made ? new Date(enrollment.getTime() + paymentDelay * 86400000).toISOString().slice(0, 10) : "";
    const firstPayment = made ? Math.round(expected * (0.5 + rand() * 0.6)) : 0;
    const pastDue = rand() > 0.75;
    const futureDate = !made && rand() > 0.4 ? new Date(enrollment.getTime() + 30 * 86400000).toISOString().slice(0, 10) : "";
    const status = pastDue ? "Late" : "Current";
    return {
      "Client ID": `S-${index + 1000}`,
      "Client Name": client,
      "Enrollment Date": enrollmentDate,
      "Total Enrolled Debt": debt,
      "Expected First Payment Amount": expected,
      "First Payment Amount": firstPayment,
      "First Payment Date": firstPaymentDate,
      "Sales Rep": reps[index % reps.length],
      "Program": programs[index % programs.length],
      "State": states[index % states.length],
      "Scheduled Draft Date": futureDate,
      "Current": !pastDue ? "Yes" : "No",
      "Late": pastDue ? "Yes" : "No",
      "Past Due": pastDue ? 1 : 0,
      "Payment Status": status,
      _firstPaymentAmount: firstPayment,
      _expectedFirstPaymentAmount: expected,
      _daysToFirstPayment: made ? paymentDelay : null,
      _timingBucket: made ? (paymentDelay === 0 ? "Same Day" : paymentDelay <= 3 ? "1-3 Days" : paymentDelay <= 7 ? "4-7 Days" : paymentDelay <= 15 ? "8-15 Days" : "16+ Days") : "No First Payment",
      _futurePaymentDate: futureDate,
      _madeFirstPayment: made,
      _isComplete: made && firstPayment >= expected,
      _isPartial: made && firstPayment > 0 && firstPayment < expected,
      _isMissing: !made,
      _pastDue: pastDue
    };
  });
}

function getDemoRetentionRows(count = 60) {
  const firstNames = ["Lucas", "Valeria", "Diego", "Camila", "Mateo", "Sofia", "Sebastian", "Isabella", "Carlos", "Emma"];
  const lastNames = ["Romero", "Gomez", "Diaz", "Vazquez", "Ortega", "Ramos", "Nunez", "Cruz", "Reyes", "Nava"];
  const reps = ["Luis", "Daniela", "Pablo", "Lucia", "Jorge", "Natalia", "Hector", "Paola", "Pedro", "Sara"];
  const states = ["CA", "TX", "FL", "NY", "IL", "NV", "GA", "AZ", "CO", "OR"];
  const programs = ["Standard", "Premium", "Legal", "Express"];
  return Array.from({ length: count }, (_, index) => {
    const rand = seededRandom(5000 + index);
    const first = firstNames[index % firstNames.length];
    const last = lastNames[index % lastNames.length];
    const enrollment = new Date(2022, Math.floor(rand() * 48), Math.floor(rand() * 28) + 1);
    const enrollmentDate = enrollment.toISOString().slice(0, 10);
    const months = Math.floor(rand() * 24) + 1;
    const debt = 1600 + Math.round(rand() * 8600);
    const monthlyPayment = Math.round(debt / (months + 1));
    const paid = rand() > 0.25;
    const cancelled = !paid ? rand() > 0.4 : rand() > 0.65;
    const graduated = !cancelled && paid && rand() > 0.75;
    const daysInStatus = cancelled ? Math.floor(rand() * 720) : Math.floor(rand() * 360);
    const cancellationDate = new Date(Date.now() - daysInStatus * 86400000).toISOString().slice(0, 10);
    const paidMonths = paid ? Math.min(months, Math.floor(rand() * months) + 1) : 0;
    const hasFirstPayment = paid && paidMonths > 0;
    const firstPaymentDate = hasFirstPayment ? new Date(enrollment.getTime() + Math.floor(rand() * 90) * 86400000).toISOString().slice(0, 10) : "";
    const lastPaymentDate = hasFirstPayment ? new Date(enrollment.getTime() + Math.floor(rand() * 120) * 86400000).toISOString().slice(0, 10) : "";
    const status = cancelled ? "Cancelled" : graduated ? "Graduated" : "Active";
    const reasons = cancelled ? ["CAN Nunca pago", "CAN Problemas financieros", "CAN Cliente incapaz de contact"].filter(() => rand() > 0.5).join(", ") || "CAN Nunca pago" : "";
    return {
      "Client ID": `R-${index + 2000}`,
      "First Name": first,
      "Last Name": last,
      "Client Status": status,
      "File Status": cancelled ? "Cancelled" : graduated ? "Graduated" : "Active",
      "Days in Client Status": daysInStatus,
      "Enrollment Date": enrollmentDate,
      "First Payment Date": firstPaymentDate,
      "Last Payment Date": lastPaymentDate,
      "Payment Months Completed": paidMonths,
      "Payment Months Skipped": Math.max(0, months - paidMonths),
      "Payment Months NSF": Math.floor(rand() * 2),
      "Payment Months Remaining": Math.max(0, months - paidMonths),
      "Total Enrolled Debt": debt,
      "Monthly Payment Amount": monthlyPayment,
      "Total Number of Months": months,
      "Cancellation Reasons": reasons,
      "CS Rep": reps[(index + 1) % reps.length],
      "Sales Rep": reps[index % reps.length],
      "Program": programs[index % programs.length],
      "State": states[index % states.length],
      "Settlement Fee": Math.round(debt * 0.1),
      "Total Savings": Math.round(debt * (paid ? 0.2 : 0.05))
    };
  });
}

function translateRetentionReason(reason: string) {
  return String(reason)
    .replace(/CAN Nunca pago/gi, "Never made a payment")
    .replace(/CAN Cliente incapaz de contact/gi, "Could not contact")
    .replace(/CAN Problemas financieros/gi, "Financial hardship")
    .replace(/CAN Fue con otra compania/gi, "Went to competitor")
    .replace(/CAN/gi, "").trim();
}

function mapRetentionSegment(row: RecordRow) {
  const madeFirstPayment = !!row["First Payment Date"] && parseMoney(row["Payment Months Completed"]) > 0;
  const cancelled = /(cancel|cancelled)/i.test(String(row["Client Status"] ?? ""));
  const graduated = /(graduated|graduate)/i.test(String(row["Client Status"] ?? ""));
  const active = !cancelled && !graduated;
  const months = parseMoney(row["Payment Months Completed"]);
  if (!madeFirstPayment && cancelled) return "no_pay_cancelled";
  if (!madeFirstPayment && active) return "no_pay_active";
  if (madeFirstPayment && cancelled && months <= 2) return "paid_1_2_cancelled";
  if (madeFirstPayment && cancelled && months > 2) return "paid_3plus_cancelled";
  if (graduated) return "graduated";
  if (madeFirstPayment && active) return "active_paying";
  return "other";
}

function bucketsFromDays(days: number) {
  if (days <= 30) return "0-1mo";
  if (days <= 60) return "1-2mo";
  if (days <= 90) return "2-3mo";
  if (days <= 180) return "3-6mo";
  if (days <= 365) return "6-12mo";
  if (days <= 730) return "1-2yr";
  return "2+yr";
}

function parseRetentionRows(rawRows: RecordRow[], headerMap: Record<string, string>) {
  const today = new Date();
  return rawRows.map((row) => {
    const normalized = normalizeRowHeaders(row, headerMap);
    const enrollmentDate = parseDate(normalized["Enrollment Date"]);
    const firstPaymentDate = parseDate(normalized["First Payment Date"]);
    const lastPaymentDate = parseDate(normalized["Last Payment Date"]);
    const daysInClientStatus = parseMoney(normalized["Days in Client Status"]);
    const cancellationDate = daysInClientStatus ? new Date(Date.now() - daysInClientStatus * 86400000).toISOString().slice(0, 10) : "";
    const segment = mapRetentionSegment(normalized);
    return {
      ...normalized,
      "Enrollment Date": enrollmentDate,
      "First Payment Date": firstPaymentDate,
      "Last Payment Date": lastPaymentDate,
      _segment: segment,
      _cancelDate: cancellationDate,
      _enrollmentYear: enrollmentDate ? enrollmentDate.slice(0, 4) : "",
      _cancelMonth: cancellationDate ? cancellationDate.slice(0, 7) : "",
      _bucket: bucketsFromDays(daysInClientStatus),
      _cancellationReasons: String(normalized["Cancellation Reasons"] ?? "")
    };
  });
}

export function SalesPage() {
  const displayRows = useMemo(() => generateSalesDemoRows(30), []);

  const totalSignedClients = displayRows.length;
  const paidRows = displayRows.filter((r) => r._madeFirstPayment);
  const missingRows = displayRows.filter((r) => r._isMissing);
  const partialRows = displayRows.filter((r) => r._isPartial);
  const completeRows = displayRows.filter((r) => r._isComplete);
  const expectedTotal = displayRows.reduce((sum, r) => sum + parseMoney(r["Expected First Payment Amount"]), 0);
  const actualTotal = displayRows.reduce((sum, r) => sum + parseMoney(r["First Payment Amount"]), 0);
  const futureRows = displayRows.filter((r) => r._futurePaymentDate && String(r._futurePaymentDate) > today());
  const pastDueRows = displayRows.filter((r) => r._pastDue);
  const avgDaysToFirst = displayRows.filter((r) => r._daysToFirstPayment !== null).reduce((sum, r) => sum + Number(r._daysToFirstPayment || 0), 0) / Math.max(1, displayRows.filter((r) => r._daysToFirstPayment !== null).length);
  const bySales = [...displayRows.reduce((map: Map<string, any>, row) => {
    const rep = String((row as any)["Sales Rep"] || (row as any)["Salesperson"] || "Unassigned").trim() || "Unassigned";
    const item = map.get(rep) || { rep, total: 0, paid: 0, missing: 0, debt: 0, actual: 0, recovery: 0, avgDays: 0, daysCount: 0 };
    item.total += 1;
    if (row._madeFirstPayment) item.paid += 1;
    if (row._isMissing) item.missing += 1;
    item.debt += parseMoney(row["Total Enrolled Debt"]);
    item.actual += parseMoney(row["First Payment Amount"]);
    if (row._daysToFirstPayment !== null) {
      item.avgDays += Number(row._daysToFirstPayment || 0);
      item.daysCount += 1;
    }
    map.set(rep, item);
    return map;
  }, new Map<string, any>()).values()];
  const salesPerformance = bySales.map((item) => ({
    ...item,
    recovery: item.debt ? Math.round((item.actual / item.debt) * 100) : 0,
    avgDays: item.daysCount ? Math.round(item.avgDays / item.daysCount) : 0
  })).filter((item) => item.total >= 1);
  return (
    <div className="grid gap-6">
      <Header title="Sales" subtitle="First payment performance." />
      <div className="rounded-[10px] border border-[#333] bg-[#141414] p-6">
        <p className="text-sm text-[#ccc]">Demo sales dashboard with deterministic seeded data. No upload or mapping required.</p>
      </div>
      <CardGrid cols="xl:grid-cols-5">
        <KpiCard title="Total Signed Clients" value={totalSignedClients} />
        <KpiCard title="Clients Who Made First Payment" value={paidRows.length} tone="positive" />
        <KpiCard title="Clients Missing First Payment" value={missingRows.length} tone="danger" />
        <KpiCard title="First Payment Completion Rate" value={`${totalSignedClients ? Math.round((completeRows.length / totalSignedClients) * 100) : 0}%`} />
        <KpiCard title="Total Enrolled Debt" value={money(displayRows.reduce((sum, r) => sum + parseMoney(r["Total Enrolled Debt"]), 0))} tone="info" />
      </CardGrid>
      <CardGrid cols="xl:grid-cols-5">
        <KpiCard title="Total Expected First Payment" value={money(expectedTotal)} tone="info" />
        <KpiCard title="Total Actual First Payment" value={money(actualTotal)} tone="positive" />
        <KpiCard title="First Payment Recovery %" value={`${expectedTotal ? Math.round((actualTotal / expectedTotal) * 100) : 0}%`} />
        <KpiCard title="Collection Gap" value={money(expectedTotal - actualTotal)} tone="warning" />
        <KpiCard title="Avg Days to First Payment" value={Math.round(avgDaysToFirst)} />
      </CardGrid>
      <CardGrid cols="xl:grid-cols-4">
        <KpiCard title="Past Due Payments" value={pastDueRows.length} tone="danger" />
        <KpiCard title="Future Scheduled Payments" value={futureRows.length} tone="info" />
        <KpiCard title="Complete First Payment" value={completeRows.length} tone="positive" />
        <KpiCard title="Partial First Payment" value={partialRows.length} tone="warning" />
      </CardGrid>
      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-[10px] border border-[#1f1f1f] bg-[#141414] p-5"><h2 className="font-semibold text-white">Timing by First Payment</h2><Bars data={[
          { name: "Same Day", value: displayRows.filter((r) => r._timingBucket === "Same Day").length },
          { name: "1-3 Days", value: displayRows.filter((r) => r._timingBucket === "1-3 Days").length },
          { name: "4-7 Days", value: displayRows.filter((r) => r._timingBucket === "4-7 Days").length },
          { name: "8-15 Days", value: displayRows.filter((r) => r._timingBucket === "8-15 Days").length },
          { name: "16+ Days", value: displayRows.filter((r) => r._timingBucket === "16+ Days").length },
          { name: "No First Payment", value: displayRows.filter((r) => r._timingBucket === "No First Payment").length }
        ]} /></div>
        <div className="rounded-[10px] border border-[#1f1f1f] bg-[#141414] p-5"><h2 className="font-semibold text-white">Sales Rep Activity</h2><Bars horizontal data={salesPerformance.slice(0, 12).map((item) => ({ name: item.rep, value: item.total, color: item.paid / item.total > 0.6 ? "#22c55e" : "#f97316" }))} /></div>
      </section>
      <DataTable title="Sales Rep Performance" rows={salesPerformance} columns={[
        { key: "rep", label: "Sales Rep" },
        { key: "total", label: "Clients" },
        { key: "paid", label: "Paid" },
        { key: "missing", label: "Missing" },
        { key: "debt", label: "Enrolled Debt", render: (r) => money(r.debt) },
        { key: "recovery", label: "Recovery %", render: (r) => `${r.recovery}%` },
        { key: "avgDays", label: "Avg Days" }
      ]} />
      <DataTable title="First Payment Performance" rows={displayRows} columns={[
        { key: "Client ID", label: "Client ID" },
        { key: "Client Name", label: "Client Name" },
        { key: "Sales Rep", label: "Sales Rep" },
        { key: "Enrollment Date", label: "Enrollment Date" },
        { key: "First Payment Date", label: "First Payment Date" },
        { key: "First Payment Amount", label: "First Payment Amount", render: (r) => money(r["First Payment Amount"]) },
        { key: "Expected First Payment Amount", label: "Expected First Payment", render: (r) => money(r["Expected First Payment Amount"]) },
        { key: "_timingBucket", label: "Timing" },
        { key: "_futurePaymentDate", label: "Future Payment Date" },
        { key: "_pastDue", label: "Past Due", render: (r) => r._pastDue ? "Yes" : "No" }
      ]} />
      <DataTable title="Missing First Payment" rows={missingRows} columns={[
        { key: "Client ID", label: "Client ID" },
        { key: "Client Name", label: "Client Name" },
        { key: "Sales Rep", label: "Sales Rep" },
        { key: "Enrollment Date", label: "Enrollment Date" },
        { key: "Total Enrolled Debt", label: "Total Enrolled Debt", render: (r) => money(r["Total Enrolled Debt"]) }
      ]} />
      <DataTable title="Partial First Payment" rows={partialRows} columns={[
        { key: "Client ID", label: "Client ID" },
        { key: "Client Name", label: "Client Name" },
        { key: "Sales Rep", label: "Sales Rep" },
        { key: "First Payment Amount", label: "First Payment Amount", render: (r) => money(r["First Payment Amount"]) },
        { key: "Expected First Payment Amount", label: "Expected", render: (r) => money(r["Expected First Payment Amount"]) },
        { key: "_timingBucket", label: "Timing" }
      ]} />
      <DataTable title="Future Payments" rows={futureRows} columns={[
        { key: "Client ID", label: "Client ID" },
        { key: "Client Name", label: "Client Name" },
        { key: "Sales Rep", label: "Sales Rep" },
        { key: "_futurePaymentDate", label: "Next Payment Date" },
        { key: "Total Enrolled Debt", label: "Enrolled Debt", render: (r) => money(r["Total Enrolled Debt"]) }
      ]} />
      <DataTable title="Past Due Payments" rows={pastDueRows} columns={[
        { key: "Client ID", label: "Client ID" },
        { key: "Client Name", label: "Client Name" },
        { key: "Sales Rep", label: "Sales Rep" },
        { key: "Past Due", label: "Past Due" },
        { key: "Payment Status", label: "Payment Status" },
        { key: "_timingBucket", label: "Timing" }
      ]} />
    </div>
  );
}

export function RetentionPage() {
  const [segmentFilter, setSegmentFilter] = useState("");
  const [salesRepFilter, setSalesRepFilter] = useState("");
  const [programFilter, setProgramFilter] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");

  const rows = useMemo(() => parseRetentionRows(getDemoRetentionRows(60), {}), []);

  const segments = ["no_pay_cancelled", "no_pay_active", "paid_1_2_cancelled", "paid_3plus_cancelled", "graduated", "active_paying"];
  const segmentLabels: Record<string, string> = {
    no_pay_cancelled: "No pay & cancelled",
    no_pay_active: "No pay & active",
    paid_1_2_cancelled: "Paid 1-2 months & cancelled",
    paid_3plus_cancelled: "Paid 3+ months & cancelled",
    graduated: "Graduated",
    active_paying: "Active paying"
  };
  const segmentColors: Record<string, string> = {
    no_pay_cancelled: "#E24B4A",
    no_pay_active: "#9FE1CB",
    paid_1_2_cancelled: "#F09595",
    paid_3plus_cancelled: "#A32D2D",
    graduated: "#378ADD",
    active_paying: "#1D9E75"
  };
  const filteredRows = rows.filter((row) => {
    if (segmentFilter && (row as any)._segment !== segmentFilter) return false;
    if (salesRepFilter && String((row as any)["Sales Rep"] ?? "").toLowerCase() !== salesRepFilter.toLowerCase()) return false;
    if (programFilter && String((row as any)["Program"] ?? "").toLowerCase() !== programFilter.toLowerCase()) return false;
    if (stateFilter && String((row as any)["State"] ?? "").toLowerCase() !== stateFilter.toLowerCase()) return false;
    if (yearFilter && String((row as any)._enrollmentYear ?? "") !== yearFilter) return false;
    return true;
  });

  const bySegment = segments.map((segment) => ({ name: segmentLabels[segment], value: filteredRows.filter((row) => (row as any)._segment === segment).length, color: segmentColors[segment] }));
  const cancelRows = filteredRows.filter((row) => /(cancel|cancelled)/i.test(String((row as any)["Client Status"] ?? "")));
  const cancellationsByMonth = Object.entries(cancelRows.reduce((acc, row) => {
    const month = String((row as any)._cancelMonth || "Unknown");
    const bucketAcc = acc as Record<string, number>;
    bucketAcc[month] = (bucketAcc[month] || 0) + 1;
    return bucketAcc;
  }, {} as Record<string, number>)).sort(([a], [b]) => a.localeCompare(b)).slice(-24).map(([month, value]) => ({ name: month, value }));
  const timeBuckets = Object.entries(cancelRows.reduce((acc, row) => {
    const bucket = String((row as any)._bucket || "Unknown");
    const bucketAcc = acc as Record<string, number>;
    bucketAcc[bucket] = (bucketAcc[bucket] || 0) + 1;
    return bucketAcc;
  }, {} as Record<string, number>)).map(([label, value]) => ({ name: label, value }));
  const reasonCounts = Object.entries(cancelRows.reduce((acc, row) => {
    const reasons = String((row as any)["Cancellation Reasons"] ?? "").split(/,|;/).map((r) => translateRetentionReason(r.trim())).filter(Boolean);
    const reasonAcc = acc as Record<string, number>;
    reasons.forEach((reason) => {
      reasonAcc[reason] = (reasonAcc[reason] || 0) + 1;
    });
    return reasonAcc;
  }, {} as Record<string, number>)).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([name, value]) => ({ name, value }));

  const salesRepCounts = [...filteredRows.reduce((map: Map<string, any>, row) => {
    const rep = String((row as any)["Sales Rep"] || "Unassigned").trim() || "Unassigned";
    const item = map.get(rep) || { rep, total: 0, active: 0, no_pay_cancel: 0, early_cancel: 0, late_cancel: 0, graduated: 0, months: 0, debt: 0, cancelCount: 0 };
    item.total += 1;
    item.debt += parseMoney((row as any)["Total Enrolled Debt"]);
    item.months += parseMoney((row as any)["Payment Months Completed"]);
    if ((row as any)._segment === "active_paying") item.active += 1;
    if ((row as any)._segment === "no_pay_cancelled") item.no_pay_cancel += 1;
    if ((row as any)._segment === "paid_1_2_cancelled") item.early_cancel += 1;
    if ((row as any)._segment === "paid_3plus_cancelled") item.late_cancel += 1;
    if ((row as any)._segment === "graduated") item.graduated += 1;
    if (/(cancel|cancelled)/i.test(String((row as any)["Client Status"] ?? ""))) item.cancelCount += 1;
    map.set(rep, item);
    return map;
  }, new Map<string, any>()).values()].filter((item) => item.total >= 5).map((item) => ({
    ...item,
    cancelPercent: item.total ? Math.round((item.cancelCount / item.total) * 100) : 0,
    avgMonths: item.total ? Math.round(item.months / item.total) : 0,
    debtRetained: item.debt ? Math.round(((item.debt - item.no_pay_cancel * 0) / item.debt) * 100) : 0
  }));

  const enrollmentYears = Array.from(new Set(rows.map((row) => (row as any)._enrollmentYear).filter(Boolean))).sort();
  const salesReps = Array.from(new Set(rows.map((row) => String((row as any)["Sales Rep"] || "Unassigned")).map((name) => name || "Unassigned"))).sort();
  const programs = Array.from(new Set(rows.map((row) => String((row as any)["Program"] || "")).filter(Boolean))).sort();
  const states = Array.from(new Set(rows.map((row) => String((row as any)["State"] || "")).filter(Boolean))).sort();

  const totalEnrolled = filteredRows.length;
  const activePaying = filteredRows.filter((row) => row._segment === "active_paying").length;
  const neverPaidLeft = filteredRows.filter((row) => row._segment === "no_pay_cancelled").length;
  const cancelledAfterPaying = filteredRows.filter((row) => row._segment === "paid_1_2_cancelled" || row._segment === "paid_3plus_cancelled").length;
  const graduatedCount = filteredRows.filter((row) => row._segment === "graduated").length;
  const debtLost = filteredRows.filter((row) => row._segment === "no_pay_cancelled" || row._segment === "paid_1_2_cancelled" || row._segment === "paid_3plus_cancelled").reduce((sum, row) => sum + parseMoney((row as any)["Total Enrolled Debt"]), 0);
  const debtRetained = filteredRows.filter((row) => row._segment === "active_paying" || row._segment === "graduated").reduce((sum, row) => sum + parseMoney((row as any)["Total Enrolled Debt"]), 0);

  const insights = [
    `${Math.round((neverPaidLeft / Math.max(1, totalEnrolled)) * 100)}% cancel without making a payment`,
    `${Math.round((cancelRows.filter((row, index) => (row as any)._cancelMonth && index < 2).length / Math.max(1, cancelRows.length)) * 100)}% of cancellations in first 2 months`,
    `${money(debtLost)} in debt lost to early cancellations`
  ];

  return (
    <div className="grid gap-6">
      <Header title="Retención" subtitle="Client lifecycle dashboard." />
      <div className="rounded-[10px] border border-[#333] bg-[#141414] p-6">
        <p className="text-sm text-[#ccc]">Demo retention dashboard with deterministic seeded data. No upload or manual column mapping is required.</p>
      </div>
      <CardGrid cols="xl:grid-cols-7">
        <KpiCard title="Total Enrolled" value={totalEnrolled} />
        <KpiCard title="Active & Paying" value={activePaying} tone="positive" />
        <KpiCard title="Never Paid & Left" value={neverPaidLeft} tone="danger" />
        <KpiCard title="Cancelled After Paying" value={cancelledAfterPaying} tone="warning" />
        <KpiCard title="Graduated" value={graduatedCount} tone="info" />
        <KpiCard title="Enrolled Debt Kept" value={money(debtRetained)} tone="positive" />
        <KpiCard title="Enrolled Debt Lost" value={money(debtLost)} tone="danger" />
      </CardGrid>
      <section className="grid gap-4 xl:grid-cols-5">
        <select className="rounded-md border border-[#333] bg-[#101010] p-2 text-sm text-white" value={segmentFilter} onChange={(e) => setSegmentFilter(e.target.value)}>
          <option value="">Lifecycle Segment</option>
          {segments.map((segment) => <option key={segment} value={segment}>{segmentLabels[segment]}</option>)}
        </select>
        <select className="rounded-md border border-[#333] bg-[#101010] p-2 text-sm text-white" value={salesRepFilter} onChange={(e) => setSalesRepFilter(e.target.value)}>
          <option value="">Sales Rep</option>
          {salesReps.map((rep) => <option key={rep} value={rep}>{rep}</option>)}
        </select>
        <select className="rounded-md border border-[#333] bg-[#101010] p-2 text-sm text-white" value={programFilter} onChange={(e) => setProgramFilter(e.target.value)}>
          <option value="">Program</option>
          {programs.map((program) => <option key={program} value={program}>{program}</option>)}
        </select>
        <select className="rounded-md border border-[#333] bg-[#101010] p-2 text-sm text-white" value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}>
          <option value="">State</option>
          {states.map((state) => <option key={state} value={state}>{state}</option>)}
        </select>
        <select className="rounded-md border border-[#333] bg-[#101010] p-2 text-sm text-white" value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}>
          <option value="">Enrollment Year</option>
          {enrollmentYears.map((year) => <option key={year} value={year}>{year}</option>)}
        </select>
      </section>
      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-[10px] border border-[#1f1f1f] bg-[#141414] p-5"><h2 className="font-semibold text-white">Segment Distribution</h2><Donut data={bySegment} /></div>
        <div className="rounded-[10px] border border-[#1f1f1f] bg-[#141414] p-5"><h2 className="font-semibold text-white">Cancellations by Month</h2><Bars data={cancellationsByMonth} /></div>
      </section>
      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-[10px] border border-[#1f1f1f] bg-[#141414] p-5"><h2 className="font-semibold text-white">Time Before Cancel</h2><Bars horizontal data={timeBuckets} /></div>
        <div className="rounded-[10px] border border-[#1f1f1f] bg-[#141414] p-5"><h2 className="font-semibold text-white">Cancellation Reasons</h2><Bars horizontal data={reasonCounts} /></div>
      </section>
      <div className="grid gap-3 md:grid-cols-3">
        {insights.map((insight) => <div key={insight} className="rounded-[10px] border border-[#1f1f1f] bg-[#141414] p-4 text-sm text-[#ccc]"><p>{insight}</p></div>)}
      </div>
      <DataTable title="Sales Rep Performance" rows={salesRepCounts} columns={[
        { key: "rep", label: "Sales Rep" },
        { key: "total", label: "Total" },
        { key: "active", label: "Active" },
        { key: "no_pay_cancel", label: "No-pay Cancel" },
        { key: "early_cancel", label: "Early Cancel" },
        { key: "late_cancel", label: "Late Cancel" },
        { key: "graduated", label: "Graduated" },
        { key: "cancelPercent", label: "Cancel %", render: (r) => `${r.cancelPercent}%` },
        { key: "avgMonths", label: "Avg Months" },
        { key: "debt", label: "Debt Managed", render: (r) => money(r.debt) },
        { key: "debtRetained", label: "Debt Retained %", render: (r) => `${r.debtRetained}%` }
      ]} />
      <div className="flex items-center justify-between gap-3 rounded-[10px] border border-[#1f1f1f] bg-[#141414] p-4">
        <div><h2 className="font-semibold text-white">Client Detail</h2><p className="text-sm text-[#666]">Search and export the client dataset.</p></div>
        <button className="rounded-md border border-[#333] bg-[#1f1f1f] px-3 py-2 text-sm text-white" onClick={() => downloadCsv(filteredRows, "retention-export.csv")}>Export CSV</button>
      </div>
      <DataTable title="Client Detail" rows={filteredRows} columns={[
        { key: "Client ID", label: "Client ID" },
        { key: "First Name", label: "First Name" },
        { key: "Last Name", label: "Last Name" },
        { key: "Client Status", label: "Client Status" },
        { key: "File Status", label: "File Status" },
        { key: "Enrollment Date", label: "Enrollment Date" },
        { key: "First Payment Date", label: "First Payment Date" },
        { key: "Last Payment Date", label: "Last Payment Date" },
        { key: "Payment Months Completed", label: "Months Completed" },
        { key: "Total Enrolled Debt", label: "Total Enrolled Debt", render: (r) => money(r["Total Enrolled Debt"]) },
        { key: "Sales Rep", label: "Sales Rep" },
        { key: "Program", label: "Program" },
        { key: "State", label: "State" }
      ]} pageSize={15} />
    </div>
  );
}

export function SettingsPage() {
  return <div className="grid gap-6"><Header title="Settings" subtitle="Configuration placeholder." /></div>;
}
