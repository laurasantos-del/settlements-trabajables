import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { dateKey, parseDate } from "@/lib/dates";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function isInDateRange(dateStr: string, start: string, end: string): boolean {
  if (!dateStr) return false;
  const parsed = parseDate(dateStr);
  const d = parsed ? dateKey(parsed) : String(dateStr).substring(0, 10);
  return d >= start && d <= end;
}

export function clientStatus(row: Record<string, unknown>): string {
  return String(row["Client Status"] ?? row.Client_Status ?? "").trim();
}

export function reconciliationCategory(days: number): string {
  if (days > 30) return "Broken Settlement";
  if (days > 20) return "Posible Broken";
  if (days > 15) return "Riesgo Alto";
  if (days > 10) return "Medio";
  if (days >= 1) return "En seguimiento";
  return "";
}

export function reconciliationTone(category: string): "positive" | "warning" | "danger" | "info" | "neutral" {
  if (category === "En seguimiento") return "info";
  if (category === "Medio" || category === "Riesgo Alto") return "warning";
  if (category === "Posible Broken" || category === "Broken Settlement") return "danger";
  return "neutral";
}
