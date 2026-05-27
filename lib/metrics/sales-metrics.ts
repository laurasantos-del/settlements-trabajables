import { dateKey, daysBetween, parseDate } from "@/lib/dates";
import { formatMoney, parseMoney } from "@/lib/money";
import type { Kpi, RawRecord, ReportStore } from "@/lib/types";

const COMPLETED_STATUSES = ["y", "paid", "cleared", "complete", "completed", "journal"];

const fieldAliases: Record<string, string[]> = {
  clientId: ["Client ID", "Client_ID", "ClientID", "Lead Number", "Client Id"],
  clientName: ["Client Name", "Client", "Name", "Nombre del cliente"],
  firstName: ["First Name", "Firstname", "FirstName", "Nombre"],
  lastName: ["Last Name", "Lastname", "LastName", "Apellido"],
  salesperson: ["Salesperson", "Sales Rep", "Vendedor"],
  enrollmentDate: ["Enrollment Date", "Enroll Date", "Status Date", "Fecha de inscripción"],
  enrolledDebt: ["Enrolled Debt", "Total Debt", "Total Enrolled Debt", "Deuda inscrita"],
  firstPaymentAmount: ["First Payment Amount", "Monto primer pago"],
  expectedFirstPayment: ["Expected First Payment Amount", "Expected Amount", "Monthly Payment Amount", "Monto esperado primer pago"],
  firstPaymentDate: ["First Payment Date", "Processed Draft Date", "Fecha primer pago"],
  firstPaymentPercent: ["First Payment Percentage", "Porcentaje primer pago"],
  nextDueDate: ["Next Due Date", "Scheduled Draft Date", "Due Date"],
  accountStatus: ["Account Status", "Client Status", "Payment Status", "Cuenta al día o atrasada"]
};

export type SalesPaymentStatus = "Complete" | "Partial" | "Missing";

export type SalesFirstPaymentRow = RawRecord & {
  Client_ID: string;
  Client_Name: string;
  Salesperson: string;
  Enrollment_Date: string;
  Enrolled_Debt: number;
  Expected_First_Payment: number;
  Actual_First_Payment: number;
  First_Payment_Percent: number;
  First_Payment_Difference: number;
  First_Payment_Date: string;
  Days_To_First_Payment: number | "";
  First_Payment_Status: SalesPaymentStatus;
  Time_Bucket: string;
  Account_Status: string;
};

function pick(row: RawRecord, names: string[]): unknown {
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== null && String(row[name]).trim() !== "") return row[name];
  }
  return "";
}

function clientId(row: RawRecord): string {
  return String(pick(row, fieldAliases.clientId)).trim();
}

function clientName(row: RawRecord): string {
  const direct = String(pick(row, fieldAliases.clientName)).trim();
  if (direct) return direct;
  return `${pick(row, fieldAliases.firstName)} ${pick(row, fieldAliases.lastName)}`.trim();
}

function normalizeAccountStatus(value: unknown): string {
  const text = String(value ?? "").trim();
  const lower = text.toLowerCase();
  if (lower === "al día" || lower === "al dia") return "Current";
  if (lower === "atrasada") return "Late";
  if (lower === "vencida") return "Past Due";
  if (lower === "morosa") return "Delinquent";
  return text || "Unknown";
}

function isCompleted(row: RawRecord): boolean {
  const status = String(row["Payment Status"] ?? row.Payment_Status ?? row.Status ?? row["Payment Y"] ?? "").trim().toLowerCase();
  return COMPLETED_STATUSES.includes(status) || row.Y === true || String(row.Y ?? "").toLowerCase() === "y";
}

function paymentAmount(row: RawRecord): number {
  return parseMoney(row.Amount ?? row["Draft Amount"] ?? row["First Payment Amount"] ?? row["Actual Amount"]);
}

function paymentDate(row: RawRecord): unknown {
  return row["Processed Draft Date"] ?? row["Scheduled Draft Date"] ?? row["Due Date"] ?? row["Next Due Date"] ?? row["First Payment Date"];
}

function paymentClientKey(row: RawRecord): string {
  return clientId(row) || clientName(row).toLowerCase();
}

function indexPayments(rows: RawRecord[]) {
  const map = new Map<string, RawRecord[]>();
  for (const row of rows) {
    const key = paymentClientKey(row);
    if (!key) continue;
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => String(paymentDate(a)).localeCompare(String(paymentDate(b))));
  }
  return map;
}

function timeBucket(days: number | ""): string {
  if (days === "") return "No First Payment";
  if (days <= 0) return "Same Day";
  if (days <= 3) return "1-3 Days";
  if (days <= 7) return "4-7 Days";
  if (days <= 15) return "8-15 Days";
  return "16+ Days";
}

function sourceClients(store: ReportStore): RawRecord[] {
  return store.newEnrollments ?? [];
}

function sourcePayments(store: ReportStore): RawRecord[] {
  return store.expectedClientPayments ?? [];
}

export function salesFirstPaymentRows(store: ReportStore): SalesFirstPaymentRow[] {
  const paymentsByClient = indexPayments(sourcePayments(store));
  const interactionByClient = new Map((store.clientInteractions ?? []).map((row) => [clientId(row), row]));

  return sourceClients(store)
    .map((row) => {
      const id = clientId(row);
      const name = clientName(row);
      const interaction = interactionByClient.get(id) ?? {};
      const key = id || name.toLowerCase();
      const relatedPayments = paymentsByClient.get(key) ?? [];
      const completed = relatedPayments.filter(isCompleted);
      const firstCompleted = completed[0];

      const enrollmentDate = String(pick(row, fieldAliases.enrollmentDate));
      const enrolledDebt = parseMoney(pick(row, fieldAliases.enrolledDebt));
      const expected = parseMoney(pick(row, fieldAliases.expectedFirstPayment)) || parseMoney(interaction["Monthly Payment Amount"]) || enrolledDebt * 0.03;
      const actual = parseMoney(pick(row, fieldAliases.firstPaymentAmount)) || (firstCompleted ? paymentAmount(firstCompleted) : 0);
      const firstDate = String(pick(row, fieldAliases.firstPaymentDate) || (firstCompleted ? paymentDate(firstCompleted) : ""));
      const enrollment = parseDate(enrollmentDate);
      const first = parseDate(firstDate);
      const days: number | "" = enrollment && first ? Math.round((first.getTime() - enrollment.getTime()) / 86_400_000) : "";
      const status: SalesPaymentStatus = actual >= expected && expected > 0 ? "Complete" : actual > 0 ? "Partial" : "Missing";
      const percent = expected > 0 ? (actual / expected) * 100 : parseMoney(pick(row, fieldAliases.firstPaymentPercent));

      return {
        ...row,
        Client_ID: id || "-",
        Client_Name: name || "-",
        Salesperson: String(pick(row, fieldAliases.salesperson) || interaction["Sales Rep"] || "Unassigned").trim() || "Unassigned",
        Enrollment_Date: enrollmentDate,
        Enrolled_Debt: enrolledDebt,
        Expected_First_Payment: expected,
        Actual_First_Payment: actual,
        First_Payment_Percent: percent,
        First_Payment_Difference: expected - actual,
        First_Payment_Date: firstDate,
        Days_To_First_Payment: days,
        First_Payment_Status: status,
        Time_Bucket: timeBucket(days),
        Account_Status: normalizeAccountStatus(pick(row, fieldAliases.accountStatus) || interaction["Client Status"])
      };
    })
    .filter((row) => row.Client_ID !== "-" || row.Client_Name !== "-");
}

export function salesKpis(store: ReportStore): Kpi[] {
  const rows = salesFirstPaymentRows(store);
  const payments = sourcePayments(store);
  const actual = rows.reduce((sum, row) => sum + row.Actual_First_Payment, 0);
  const expected = rows.reduce((sum, row) => sum + row.Expected_First_Payment, 0);
  const debt = rows.reduce((sum, row) => sum + row.Enrolled_Debt, 0);
  const paid = rows.filter((row) => row.First_Payment_Status !== "Missing");
  const avgDays = paid.reduce((sum, row) => sum + Number(row.Days_To_First_Payment || 0), 0) / Math.max(1, paid.length);
  const pastDue = salesPastDuePayments(store).length;
  const future = salesFuturePayments(store).length;
  return [
    { title: "Total Signed Clients", value: rows.length, tone: "info" },
    { title: "Clients Who Made First Payment", value: paid.length, tone: "positive" },
    { title: "Clients Missing First Payment", value: rows.filter((row) => row.First_Payment_Status === "Missing").length, tone: "danger" },
    { title: "First Payment Completion Rate", value: `${Math.round((paid.length / Math.max(1, rows.length)) * 100)}%`, tone: "positive" },
    { title: "Total Enrolled Debt", value: debt, tone: "info" },
    { title: "Total Expected First Payment Amount", value: expected, tone: "warning" },
    { title: "Total Actual First Payment Collected", value: actual, tone: "positive" },
    { title: "First Payment Recovery %", value: `${((actual / Math.max(1, debt)) * 100).toFixed(2)}%`, tone: "positive" },
    { title: "Collection Gap", value: expected - actual, tone: expected > actual ? "danger" : "positive" },
    { title: "Average Days to First Payment", value: avgDays.toFixed(1), tone: "neutral" },
    { title: "Past Due Payments", value: pastDue, subtitle: `${payments.length} payment records`, tone: "danger" },
    { title: "Future Scheduled Payments", value: future, tone: "info" }
  ];
}

export function salesStatusCounts(store: ReportStore): { label: string; value: number; color?: string }[] {
  const counts = new Map<string, number>();
  for (const row of salesFirstPaymentRows(store)) counts.set(row.First_Payment_Status, (counts.get(row.First_Payment_Status) ?? 0) + 1);
  return Array.from(counts.entries()).map(([label, value]) => ({
    label,
    value,
    color: label === "Complete" ? "#22c55e" : label === "Partial" ? "#f97316" : "#ef4444"
  }));
}

export function salesTimeBuckets(store: ReportStore): { label: string; value: number; color?: string }[] {
  const order = ["Same Day", "1-3 Days", "4-7 Days", "8-15 Days", "16+ Days", "No First Payment"];
  const rows = salesFirstPaymentRows(store);
  return order.map((label) => ({ label, value: rows.filter((row) => row.Time_Bucket === label).length, color: label === "No First Payment" ? "#ef4444" : "#f97316" }));
}

export function salespersonPerformanceRows(store: ReportStore): RawRecord[] {
  const groups = new Map<string, SalesFirstPaymentRow[]>();
  for (const row of salesFirstPaymentRows(store)) {
    const key = /^admin$|^unknown$|^$/i.test(row.Salesperson) ? "Unassigned" : row.Salesperson;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  return Array.from(groups.entries())
    .map(([name, rows]) => {
      const paid = rows.filter((row) => row.First_Payment_Status !== "Missing");
      const debt = rows.reduce((sum, row) => sum + row.Enrolled_Debt, 0);
      const actual = rows.reduce((sum, row) => sum + row.Actual_First_Payment, 0);
      const avgDays = paid.reduce((sum, row) => sum + Number(row.Days_To_First_Payment || 0), 0) / Math.max(1, paid.length);
      return {
        Salesperson: name,
        Signed_Clients: rows.length,
        First_Payments: paid.length,
        Missing_First_Payment: rows.length - paid.length,
        Total_Enrolled_Debt: debt,
        Money_Recovered: actual,
        Conversion_Rate: Math.round((paid.length / Math.max(1, rows.length)) * 100),
        Average_Days: avgDays.toFixed(1),
        Past_Due: salesPastDuePayments(store).filter((payment) => payment.Salesperson === name).length,
        Future: salesFuturePayments(store).filter((payment) => payment.Salesperson === name).length
      };
    })
    .filter((row) => Number(row.Signed_Clients) >= 1)
    .sort((a, b) => String(a.Salesperson) === "Unassigned" ? 1 : String(b.Salesperson) === "Unassigned" ? -1 : Number(b.Signed_Clients) - Number(a.Signed_Clients));
}

function paymentTableRows(store: ReportStore, future: boolean): RawRecord[] {
  const clientRows = salesFirstPaymentRows(store);
  const clientById = new Map(clientRows.map((row) => [row.Client_ID, row]));
  return sourcePayments(store)
    .map((row) => {
      const id = clientId(row);
      const client = clientById.get(id);
      const due = String(pick(row, fieldAliases.nextDueDate));
      const parsed = parseDate(due);
      const amount = paymentAmount(row) || parseMoney(pick(row, fieldAliases.expectedFirstPayment));
      return {
        Client_ID: id || client?.Client_ID || "-",
        Client_Name: client?.Client_Name || clientName(row) || "-",
        Salesperson: client?.Salesperson || "Unassigned",
        Due_Date: due,
        Expected_Amount: amount,
        Actual_Amount: isCompleted(row) ? amount : 0,
        Payment_Status: String(row["Payment Status"] ?? row.Status ?? ""),
        Account_Status: normalizeAccountStatus(row["Accounting Status"] ?? row["Client Status"] ?? client?.Account_Status),
        Risk_Level: daysBetween(due) > 15 ? "High" : daysBetween(due) > 0 ? "Medium" : "Low",
        _date: parsed ? dateKey(parsed) : ""
      };
    })
    .filter((row) => {
      const parsed = parseDate(row.Due_Date);
      if (!parsed) return false;
      return future ? daysBetween(parsed) < 0 : daysBetween(parsed) > 0 && !COMPLETED_STATUSES.includes(String(row.Payment_Status).toLowerCase());
    })
    .sort((a, b) => String(a._date).localeCompare(String(b._date)));
}

export function salesPastDuePayments(store: ReportStore): RawRecord[] {
  return paymentTableRows(store, false);
}

export function salesFuturePayments(store: ReportStore): RawRecord[] {
  return paymentTableRows(store, true);
}

export function salesChatAnswer(store: ReportStore, question: string): string {
  const q = question.toLowerCase();
  const rows = salesFirstPaymentRows(store);
  const paid = rows.filter((row) => row.First_Payment_Status !== "Missing");
  const missing = rows.filter((row) => row.First_Payment_Status === "Missing");
  const partial = rows.filter((row) => row.First_Payment_Status === "Partial");
  const debt = rows.reduce((sum, row) => sum + row.Enrolled_Debt, 0);
  const actual = rows.reduce((sum, row) => sum + row.Actual_First_Payment, 0);
  const best = salespersonPerformanceRows(store)[0];
  const idMatch = question.match(/\b\d{4,}\b/);
  if (idMatch) {
    const row = rows.find((item) => item.Client_ID.includes(idMatch[0]));
    if (!row) return `I could not find client ${idMatch[0]} in the loaded sales data.`;
    return `${row.Client_Name} (${row.Client_ID}) has first payment status ${row.First_Payment_Status}, paid ${formatMoney(row.Actual_First_Payment)} of ${formatMoney(row.Expected_First_Payment)}, and took ${row.Days_To_First_Payment || "no"} days to first payment.`;
  }
  if (q.includes("partial")) return `${partial.length} clients have a partial first payment.`;
  if (q.includes("missing") || q.includes("no pag") || q.includes("sin primer")) return `${missing.length} clients are missing first payment.`;
  if (q.includes("future")) return `${salesFuturePayments(store).length} future payments are scheduled.`;
  if (q.includes("past") || q.includes("venc")) return `${salesPastDuePayments(store).length} payments are past due.`;
  if (q.includes("recover") || q.includes("recuper")) return `Actual first payments collected are ${formatMoney(actual)}, which is ${((actual / Math.max(1, debt)) * 100).toFixed(2)}% of enrolled debt.`;
  if (q.includes("vendedor") || q.includes("salesperson") || q.includes("best")) return best ? `${best.Salesperson} has the strongest conversion in this view: ${best.Conversion_Rate}% across ${best.Signed_Clients} clients.` : "No salesperson data is available.";
  return `${paid.length} of ${rows.length} signed clients made a first payment. ${missing.length} are missing and ${partial.length} are partial.`;
}
