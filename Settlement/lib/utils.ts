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
