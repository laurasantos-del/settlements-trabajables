import { dateKey, daysBetween, parseDate } from "@/lib/dates";
import { parseMoney } from "@/lib/money";
import type { Kpi, RawRecord } from "@/lib/types";

function value(row: RawRecord, keys: string[]): string | number | boolean | null | undefined {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== "") return row[key];
  }
  return "";
}

function normalizedDate(input: unknown): string {
  const parsed = parseDate(input);
  return parsed ? dateKey(parsed) : "";
}

export function normalizePayment(row: RawRecord): RawRecord {
  const paymentStatus = String(value(row, ["Payment Status", "Payment Status (Y/N)", "Payment_Status", "Status"]) ?? "N").trim().toUpperCase();
  const totalDebt = parseMoney(value(row, ["Original_Balance", "Original Balance", "Total Debt", "Total_Debt"]));
  const balance = parseMoney(value(row, ["Settlement_Balance", "Settlement Balance", "Balance Current", "Balance"]));
  return {
    Client_ID: String(value(row, ["Client_ID", "Client ID", "ClientID"]) ?? "").trim(),
    Current_Creditor: String(value(row, ["Current_Creditor", "Current Creditor", "Creditor", "Creditor Name"]) ?? "").trim(),
    Amount: Math.abs(parseMoney(value(row, ["Amount", "Payment Amount"]))),
    Due_Date: normalizedDate(value(row, ["Due_Date", "Due Date", "DueDate"])),
    "Payment Status": paymentStatus,
    Payment_Status_Y: paymentStatus === "Y",
    Payment_Number: String(value(row, ["Payment_Number", "Payment Number", "Payment #"]) ?? "").trim(),
    Accounting_Status: String(value(row, ["Accounting_Status", "Accounting Status", "Accouting Status"]) ?? "").trim(),
    Original_Balance: totalDebt,
    Total_Debt: totalDebt,
    Settlement_Balance: balance,
    Balance: balance,
    Client_Status: String(value(row, ["Client_Status", "Client Status"]) ?? "").trim()
  };
}

export function normalizeInteraction(row: RawRecord): RawRecord {
  const escrow = parseMoney(value(row, ["Cftpay_Escrow_Balance", "CFTPay Escrow Balance"])) || parseMoney(value(row, ["Company_Bank_Balance", "Company Bank Balance"]));
  return {
    Client_ID: String(value(row, ["Client_ID", "Client ID", "ClientID"]) ?? "").trim(),
    Program: String(value(row, ["Program"]) ?? "").trim(),
    Cftpay_Escrow_Balance: parseMoney(value(row, ["Cftpay_Escrow_Balance", "CFTPay Escrow Balance"])),
    Company_Bank_Balance: parseMoney(value(row, ["Company_Bank_Balance", "Company Bank Balance"])),
    Escrow_Balance: escrow,
    Client_Status: String(value(row, ["Client_Status", "Client Status"]) ?? "").trim(),
    Monthly_Payment: parseMoney(value(row, ["Monthly_Payment", "Monthly Payment Amount"])),
    Total_Enrolled_Debt: parseMoney(value(row, ["Total_Enrolled_Debt", "Total Enrolled Debt"]))
  };
}

export function escrowBalance(interaction?: RawRecord): number {
  if (!interaction) return 0;
  const mapped = parseMoney(interaction.Escrow_Balance);
  if (mapped) return mapped;
  const cft = parseMoney(interaction.Cftpay_Escrow_Balance);
  return cft || parseMoney(interaction.Company_Bank_Balance);
}

export function interactionMap(interactions: RawRecord[]) {
  return new Map(interactions.map((row) => [String(row.Client_ID), row]));
}

export function paymentsByClient(payments: RawRecord[]) {
  const groups = new Map<string, RawRecord[]>();
  for (const row of payments) {
    const id = String(row.Client_ID);
    groups.set(id, [...(groups.get(id) ?? []), row]);
  }
  return groups;
}

export function isPaid(row: RawRecord): boolean {
  return String(row["Payment Status"]).toUpperCase() === "Y";
}

export function overdueUnpaid(payments: RawRecord[]): RawRecord[] {
  return payments.filter((row) => !isPaid(row) && daysBetween(row.Due_Date) > 0);
}

export function nextPendingPayment(clientPayments: RawRecord[]): RawRecord | undefined {
  return clientPayments
    .filter((row) => !isPaid(row))
    .sort((a, b) => String(a.Due_Date).localeCompare(String(b.Due_Date)))[0];
}

export function lastPaidDate(clientPayments: RawRecord[]): string {
  return clientPayments
    .filter(isPaid)
    .map((row) => String(row.Due_Date))
    .sort()
    .at(-1) ?? "";
}

export function daysSinceLastPaid(clientPayments: RawRecord[]): number {
  const last = lastPaidDate(clientPayments);
  if (last) return daysBetween(last);
  const oldest = clientPayments.map((row) => String(row.Due_Date)).sort()[0];
  return oldest ? daysBetween(oldest) : 0;
}

export function clientSummaries(payments: RawRecord[], interactions: RawRecord[]): RawRecord[] {
  const groups = paymentsByClient(payments);
  const interactionsById = interactionMap(interactions);
  return Array.from(groups.entries()).map(([clientId, items]) => {
    const interaction = interactionsById.get(clientId);
    const paid = items.filter(isPaid);
    const unpaid = items.filter((row) => !isPaid(row));
    const next = nextPendingPayment(items);
    const escrow = escrowBalance(interaction);
    const days = daysSinceLastPaid(items);
    const pendingAmount = unpaid.reduce((sum, row) => sum + parseMoney(row.Amount), 0);
    const risk = days > 90 ? "Critical" : days > 60 ? "High" : days >= 30 ? "Medium" : "Low";
    return {
      Client_ID: clientId,
      Current_Creditor: String(next?.Current_Creditor ?? items[0]?.Current_Creditor ?? ""),
      Program: String(interaction?.Program ?? ""),
      Client_Status: String(interaction?.Client_Status ?? items[0]?.Client_Status ?? ""),
      Escrow: escrow,
      Completed: paid.length,
      Pending: unpaid.length,
      Paid_Amount: paid.reduce((sum, row) => sum + parseMoney(row.Amount), 0),
      Pending_Amount: pendingAmount,
      Settlement_Balance: items.reduce((sum, row) => sum + parseMoney(row.Settlement_Balance), 0),
      Original_Balance: items.reduce((sum, row) => sum + parseMoney(row.Original_Balance), 0),
      Next_Payment: parseMoney(next?.Amount),
      Next_Due_Date: String(next?.Due_Date ?? ""),
      Days_Since_Y: days,
      Risk: risk,
      Has_Funds: escrow >= parseMoney(next?.Amount),
      Active_Negative: String(interaction?.Client_Status).toLowerCase() === "active" && (escrow < 0 || escrow < pendingAmount)
    };
  });
}

export function dashboardKpis(payments: RawRecord[], interactions: RawRecord[]): Kpi[] {
  const summaries = clientSummaries(payments, interactions);
  const uniqueClients = new Set(payments.map((row) => row.Client_ID));
  const completed = payments.filter(isPaid);
  const pending = payments.filter((row) => !isPaid(row));
  const statusCount = (status: string) => summaries.filter((row) => String(row.Client_Status).toLowerCase() === status.toLowerCase()).length;
  return [
    { title: "Total Clientes", value: uniqueClients.size, tone: "info" },
    { title: "Activos", value: statusCount("Active"), tone: "positive" },
    { title: "NSF", value: statusCount("NSF"), tone: "danger" },
    { title: "Cancelados", value: summaries.filter((row) => String(row.Client_Status).toLowerCase().includes("cancelled")).length, tone: "danger" },
    { title: "Completion Rate", value: `${payments.length ? Math.round((completed.length / payments.length) * 100) : 0}%`, tone: "positive" },
    { title: "Pagos Completados", value: completed.length, tone: "positive" },
    { title: "Pagos Pendientes", value: pending.length, tone: "warning" },
    { title: "Monto Pagado", value: completed.reduce((sum, row) => sum + parseMoney(row.Amount), 0), tone: "positive" },
    { title: "Broken Settlements", value: brokenSettlements(payments, interactions).length, tone: "danger" },
    { title: "Casos Urgentes", value: brokenSettlements(payments, interactions).filter((row) => Number(row.Days_Since_Y) > 90).length, tone: "danger" },
    { title: "Alertas Reconciliación", value: reconciliationRows(payments).filter((row) => Number(row.Days_Overdue) <= 60).length, tone: "warning" },
    { title: "Sin Fondos", value: noFundsRows(payments, interactions).length, tone: "danger" },
    { title: "Monto Pendiente", value: pending.reduce((sum, row) => sum + parseMoney(row.Amount), 0), tone: "warning" },
    { title: "Active Negative", value: activeNegativeRows(payments, interactions).length, tone: "danger" },
    { title: "At Risk Current", value: atRiskRows(payments, interactions).length, tone: "warning" },
    { title: "On Hold", value: statusCount("On Hold"), tone: "neutral" }
  ];
}

export function brokenSettlements(payments: RawRecord[], interactions: RawRecord[]): RawRecord[] {
  const summaries = clientSummaries(payments, interactions);
  return summaries
    .filter((row) => Number(row.Days_Since_Y) > 60)
    .map((row) => ({
      ...row,
      Last_Y: lastPaidDate(payments.filter((payment) => payment.Client_ID === row.Client_ID)) || "Nunca",
      Action: Number(row.Days_Since_Y) > 90 ? "Escalar y validar cancelación del settlement" : "Contactar cliente y confirmar próximo pago"
    }));
}

export function reconciliationRows(payments: RawRecord[]): RawRecord[] {
  const groups = paymentsByClient(payments);
  return overdueUnpaid(payments)
    .filter((row) => String(row.Accounting_Status).toLowerCase() !== "cancelled")
    .map((row) => ({
      ...row,
      Days_Overdue: daysBetween(row.Due_Date),
      Last_Y: lastPaidDate(groups.get(String(row.Client_ID)) ?? []) || "Sin Y",
      Problem: lastPaidDate(groups.get(String(row.Client_ID)) ?? []) ? "Pago sin confirmar" : "Sin actividad",
      Action: "Reconciliar con banco/acreededor"
    }));
}

export function noFundsRows(payments: RawRecord[], interactions: RawRecord[]): RawRecord[] {
  const groups = paymentsByClient(payments);
  const interactionsById = interactionMap(interactions);
  return Array.from(groups.entries()).map(([clientId, items]) => {
    const interaction = interactionsById.get(clientId);
    const next = nextPendingPayment(items);
    const escrow = escrowBalance(interaction);
    const nextAmount = parseMoney(next?.Amount);
    return {
      Client_ID: clientId,
      Program: String(interaction?.Program ?? ""),
      Balance: escrow,
      Next_Payment: nextAmount,
      Shortfall: Math.max(0, nextAmount - escrow),
      Current_Creditor: String(next?.Current_Creditor ?? ""),
      Action: "Solicitar depósito antes del pago al acreedor"
    };
  }).filter((row) => Number(row.Next_Payment) > 0 && Number(row.Balance) < Number(row.Next_Payment));
}

export function atRiskRows(payments: RawRecord[], interactions: RawRecord[]): RawRecord[] {
  return clientSummaries(payments, interactions)
    .filter((row) => Number(row.Days_Since_Y) >= 30 && Number(row.Days_Since_Y) <= 60)
    .map((row) => ({ ...row, Projected_Deficit: Math.max(0, Number(row.Next_Payment) - Number(row.Escrow)), Action: "Seguimiento preventivo esta semana" }));
}

export function activeNegativeRows(payments: RawRecord[], interactions: RawRecord[]): RawRecord[] {
  return clientSummaries(payments, interactions)
    .filter((row) => row.Active_Negative)
    .map((row) => ({ ...row, Creditors: payments.filter((payment) => payment.Client_ID === row.Client_ID).map((payment) => payment.Current_Creditor).filter((item, index, all) => all.indexOf(item) === index).join(", "), Action: "Pausar pagos o pedir fondos" }));
}

export function urgentRows(payments: RawRecord[], interactions: RawRecord[]): RawRecord[] {
  const byClient = new Map<string, RawRecord>();
  for (const row of [...brokenSettlements(payments, interactions), ...activeNegativeRows(payments, interactions), ...noFundsRows(payments, interactions)]) {
    const clientId = String(row.Client_ID);
    const existing = byClient.get(clientId);
    const priority = Number(row.Days_Since_Y ?? 0) > 90 || Number(row.Balance ?? row.Escrow ?? 0) < 0 ? 3 : Number(row.Shortfall ?? 0) > 0 ? 2 : 1;
    if (!existing || priority > Number(existing.Priority)) {
      byClient.set(clientId, {
        ...row,
        Priority: priority,
        Severity: priority === 3 ? "CRÍTICO" : priority === 2 ? "URGENTE" : "ATENCIÓN",
        Reason: Number(row.Days_Since_Y ?? 0) > 90 ? "Más de 90 días sin pago" : Number(row.Balance ?? row.Escrow ?? 0) < 0 ? "Balance negativo" : "Fondos insuficientes",
        Recommended_Action: String(row.Action ?? "Revisar caso")
      });
    }
  }
  return Array.from(byClient.values()).sort((a, b) => Number(b.Priority) - Number(a.Priority));
}

export function alertRows(payments: RawRecord[], interactions: RawRecord[]): RawRecord[] {
  const alerts: RawRecord[] = [];
  const summaries = clientSummaries(payments, interactions);
  for (const row of brokenSettlements(payments, interactions)) {
    alerts.push({ Severity: Number(row.Days_Since_Y) > 90 ? "Critical" : "High", Client_ID: row.Client_ID, Current_Creditor: "", Description: `${row.Days_Since_Y} días sin Y`, Action: row.Action, Detected_Date: dateKey() });
  }
  for (const row of noFundsRows(payments, interactions)) {
    alerts.push({ Severity: "High", Client_ID: row.Client_ID, Current_Creditor: row.Current_Creditor, Description: `Shortfall ${row.Shortfall}`, Action: row.Action, Detected_Date: dateKey() });
  }
  for (const row of reconciliationRows(payments)) {
    alerts.push({ Severity: Number(row.Days_Overdue) > 30 ? "Medium" : "Low", Client_ID: row.Client_ID, Current_Creditor: row.Current_Creditor, Description: row.Problem, Action: row.Action, Detected_Date: dateKey() });
  }
  for (const row of summaries.filter((item) => String(item.Client_Status).toLowerCase() === "on hold")) {
    alerts.push({ Severity: "Low", Client_ID: row.Client_ID, Current_Creditor: row.Current_Creditor, Description: "Cliente On Hold", Action: "Validar pausa antes de próximo pago", Detected_Date: dateKey() });
  }
  for (const row of payments.filter((item) => !isPaid(item) && daysBetween(item.Due_Date) <= 0 && daysBetween(item.Due_Date) >= -7)) {
    alerts.push({ Severity: "Low", Client_ID: row.Client_ID, Current_Creditor: row.Current_Creditor, Description: `Próximo vencimiento ${row.Due_Date}`, Action: "Confirmar fondos disponibles", Detected_Date: dateKey() });
  }
  return alerts;
}

export function creditorRows(payments: RawRecord[]): RawRecord[] {
  const groups = new Map<string, RawRecord[]>();
  for (const row of payments) {
    const creditor = String(row.Current_Creditor || "Unknown");
    groups.set(creditor, [...(groups.get(creditor) ?? []), row]);
  }
  return Array.from(groups.entries()).map(([creditor, rows]) => {
    const paid = rows.filter(isPaid);
    const unpaid = rows.filter((row) => !isPaid(row));
    return {
      Current_Creditor: creditor,
      Clients: new Set(rows.map((row) => row.Client_ID)).size,
      Completed: paid.length,
      Total_Paid: paid.reduce((sum, row) => sum + parseMoney(row.Amount), 0),
      Total_Pending: unpaid.reduce((sum, row) => sum + parseMoney(row.Amount), 0),
      Completion_Rate: rows.length ? Math.round((paid.length / rows.length) * 100) : 0
    };
  }).sort((a, b) => Number(b.Clients) - Number(a.Clients));
}
