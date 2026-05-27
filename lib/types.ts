export type ReportType =
  | "settlements"
  | "newEnrollments"
  | "clientInteractions"
  | "expectedClientPayments"
  | "settlementPayments"
  | "settlementsPerDate"
  | "creditorStatus"
  | "paymentsCleared"
  | "paymentNSF"
  | "summaryReport"
  | "commissions"
  | "clientLifecycle";

export type RawRecord = Record<string, string | number | boolean | null | undefined>;

export type ReportStore = Partial<Record<ReportType, RawRecord[]>>;

export type Kpi = {
  title: string;
  value: string | number;
  subtitle?: string;
  tone?: "positive" | "warning" | "danger" | "info" | "neutral";
};

export type Option = {
  label: string;
  value: string;
};

export type LifecycleSegment =
  | "no_pay_cancelled"
  | "no_pay_active"
  | "paid_1_2_cancelled"
  | "paid_3plus_cancelled"
  | "graduated"
  | "active_paying"
  | "other";

export type LifecycleClient = RawRecord & {
  _segment: LifecycleSegment;
  _cancellationDate?: string;
  _monthsInProgram?: number;
  _isFlagged?: boolean;
  _isAtRisk?: boolean;
};
