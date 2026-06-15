export type RecordRow = Record<string, any>;

export function extractRecords(data: any): RecordRow[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.records)) return data.records;
  if (Array.isArray(data?.clients)) return data.clients;
  if (Array.isArray(data?.data)) return data.data;
  if (typeof data?.count === "number") return [{ count: data.count }];
  return [];
}

export function parseMoney(val: any): number {
  if (!val) return 0;
  const parsed = parseFloat(String(val).replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseDate(value: any): string {
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
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

export function isInRange(dateStr: any, start: string, end: string): boolean {
  const d = parseDate(dateStr);
  if (!d) return false;
  return d >= start && d <= end;
}

export function enrollmentDate(row: RecordRow): string {
  return parseDate(row["Enroll Date"] || row["Enrollment Date"] || row["Status Date"]);
}

export function enrollmentInRange(row: RecordRow, start: string, end: string): boolean {
  const dates = [row["Status Date"], row["Enroll Date"], row["Enrollment Date"]];
  return dates.some((value) => isInRange(value, start, end));
}

async function getRecords(path: string): Promise<RecordRow[]> {
  try {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return extractRecords(await res.json());
  } catch (error) {
    console.error(`API error: ${path}`, error);
    return [];
  }
}

export function getClientInteractions() {
  return getRecords("/api/proxy/data/client-interactions");
}

export const fetchClientInteractions = getClientInteractions;

export function getExpectedPayments() {
  return getRecords("/api/proxy/data/expected-client-payments");
}

export const fetchExpectedPayments = getExpectedPayments;

export function getSettlementPayments() {
  return getRecords("/api/proxy/data/settlement-payment-report");
}

export const fetchSettlementPayments = getSettlementPayments;

export function getNewEnrollments() {
  return getRecords("/api/proxy/data/new-enrollments");
}

export const fetchNewEnrollments = getNewEnrollments;

export function getCreditorStatus() {
  return getRecords("/api/proxy/data/creditor-status");
}

export const fetchCreditorStatus = getCreditorStatus;

export function getSettlementsPerDate() {
  return getRecords("/api/proxy/data/settlements-per-date");
}

export const fetchSettlementsPerDate = getSettlementsPerDate;

export function getPaymentsCleared() {
  return getRecords("/api/proxy/data/payments-cleared");
}

export const fetchPaymentsCleared = getPaymentsCleared;

export function getPaymentNSF() {
  return getRecords("/api/proxy/data/payment-nsf");
}

export const fetchPaymentNSF = getPaymentNSF;

export function getSettlements() {
  return getRecords("/api/proxy/settlements");
}

export const fetchSettlements = getSettlements;

export function fetchSummaryReport() {
  return getRecords("/api/proxy/data/summary-report");
}

export function fetchCommissions() {
  return getRecords("/api/proxy/data/commissions");
}

export function getProjectedFees() {
  return getRecords("/api/proxy/data/projected-fees");
}

export function getSuspendedPayments() {
  return getRecords("/api/proxy/data/suspended-payments");
}

export function getClientSavingsEscrow() {
  return getRecords("/api/proxy/data/client-savings-escrow");
}

export function getNegotiatorEscrow() {
  return getRecords("/api/proxy/data/negotiator-escrow");
}

export type DataSummary = {
  client_savings_escrow: number;
  negotiator_escrow: number;
  client_interactions: number;
  expected_client_payments: number;
  settlement_payment_report: number;
  new_enrollments: number;
  settlements_per_date: number;
  payments_cleared: number;
  commissions: number;
  projected_fees: number;
  payment_nsf: number;
  summary_report: number;
  suspended_payments: number;
  creditor_status: number;
  last_scrape?: string;
  missing_reports?: string[];
};

export async function getDataSummary(): Promise<DataSummary | null> {
  try {
    const res = await fetch("/api/proxy/data/summary", { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch (error) {
    console.error("getDataSummary failed", error);
    return null;
  }
}

export async function refreshMissingReports(): Promise<void> {
  try {
    await fetch("/api/proxy/scraper/run-missing", { method: "POST", cache: "no-store" });
  } catch (error) {
    console.error("refreshMissingReports failed", error);
  }
}

export async function refreshNewEnrollments(): Promise<void> {
  try {
    await fetch("/api/proxy/scraper/run?reports_only=new_enrollments", { method: "POST", cache: "no-store" });
  } catch (error) {
    console.error("refreshNewEnrollments failed", error);
  }
}

export async function isFastApiReachable() {
  try {
    const res = await fetch("/api/proxy/data/summary", { cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

// --- Ticket review & send -------------------------------------------------

export type TicketKind = "nsf" | "csbo";

export interface ProposedTicket {
  dedup_key: string;
  client_id: string;
  subject: string;
  content: string;
  priority: string;
  status: "new" | "already_created";
  stage_id?: string; // nsf
  stage?: string;     // csbo
  rule?: string;      // csbo
  bucket?: string;    // nsf
}

export interface CreateResult {
  dedup_key: string;
  result: "created" | "skipped" | "error";
  hubspot_id?: string;
  orphan?: boolean;
  reason?: string;
}

export async function getTicketPreview(kind: TicketKind): Promise<ProposedTicket[]> {
  try {
    const res = await fetch(`/api/proxy/tickets/${kind}/preview`, { cache: "no-store" });
    const data = await res.json();
    return Array.isArray(data?.tickets) ? data.tickets : [];
  } catch (error) {
    console.error("getTicketPreview failed", error);
    return [];
  }
}

export async function createTickets(
  kind: TicketKind,
  tickets: ProposedTicket[]
): Promise<CreateResult[]> {
  const res = await fetch(`/api/proxy/tickets/${kind}/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tickets }),
    cache: "no-store",
  });
  const data = await res.json();
  return Array.isArray(data?.results) ? data.results : [];
}

export async function getCreatedToday(kind: TicketKind): Promise<Record<string, unknown>[]> {
  try {
    const res = await fetch(`/api/proxy/tickets/${kind}/created-today`, { cache: "no-store" });
    const data = await res.json();
    return Array.isArray(data?.tickets) ? data.tickets : [];
  } catch (error) {
    console.error("getCreatedToday failed", error);
    return [];
  }
}

export async function refreshNsf(): Promise<void> {
  try {
    await fetch(`/api/proxy/tickets/nsf/refresh`, { method: "POST", cache: "no-store" });
  } catch (error) {
    console.error("refreshNsf failed", error);
  }
}

export async function refreshStore(): Promise<void> {
  try {
    await fetch(`/api/proxy/scraper/run`, { method: "POST", cache: "no-store" });
  } catch (error) {
    console.error("refreshStore failed", error);
  }
}

export interface PaymentRow {
  client_id: string;
  name: string;
  creditor?: string;
  amount: number;
  status: string;
  date: string;
}

export interface TomorrowPayments {
  date: string;
  incoming: PaymentRow[];
  outgoing: PaymentRow[];
  incoming_total: number;
  outgoing_total: number;
}

export async function getTomorrowPayments(): Promise<TomorrowPayments> {
  const empty: TomorrowPayments = {
    date: "", incoming: [], outgoing: [], incoming_total: 0, outgoing_total: 0,
  };
  try {
    const res = await fetch(`/api/proxy/payments/tomorrow`, { cache: "no-store" });
    const data = await res.json();
    return { ...empty, ...data };
  } catch (error) {
    console.error("getTomorrowPayments failed", error);
    return empty;
  }
}
