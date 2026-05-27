import type { RawRecord } from "@/lib/types";

const BASE = process.env.NEXT_PUBLIC_API_BASE || "/api/proxy";

type ApiPayload = RawRecord[] | { records?: RawRecord[]; clients?: RawRecord[]; data?: RawRecord[]; count?: number };

function extractRecords(payload: ApiPayload): RawRecord[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.records)) return payload.records;
  if (Array.isArray(payload.clients)) return payload.clients;
  if (Array.isArray(payload.data)) return payload.data;
  if (typeof payload.count === "number") return [{ count: payload.count }];
  return [];
}

async function getRecords(path: string): Promise<RawRecord[]> {
  try {
    const response = await fetch(`${BASE}${path}`);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const payload = (await response.json()) as ApiPayload;
    return extractRecords(payload);
  } catch (error) {
    console.error(`FastAPI request failed: ${path}`, error);
    return [];
  }
}

export async function isFastApiReachable(): Promise<boolean> {
  try {
    const response = await fetch(`${BASE}/data/summary`);
    return response.ok;
  } catch (error) {
    console.error("FastAPI is not reachable", error);
    return false;
  }
}

export async function fetchSettlements() {
  return getRecords("/settlements");
}

export async function fetchClientInteractions() {
  return getRecords("/data/client-interactions");
}

export async function fetchExpectedPayments() {
  return getRecords("/data/expected-client-payments");
}

export async function fetchSettlementPayments() {
  return getRecords("/data/settlement-payment-report");
}

export async function fetchNewEnrollments() {
  return getRecords("/data/new-enrollments");
}

export async function fetchCreditorStatus() {
  return getRecords("/data/creditor-status");
}

export async function fetchSettlementsPerDate() {
  return getRecords("/data/settlements-per-date");
}

export async function fetchPaymentsCleared() {
  return getRecords("/data/payments-cleared");
}

export async function fetchPaymentNSF() {
  return getRecords("/data/payment-nsf?limit=3000");
}

export async function fetchSummaryReport() {
  return getRecords("/data/summary-report");
}

export async function fetchCommissions() {
  return getRecords("/data/commissions");
}
