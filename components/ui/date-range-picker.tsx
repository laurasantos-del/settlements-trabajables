"use client";

import { dateKey } from "@/lib/dates";

type DateRangePickerProps = {
  startDate: string;
  endDate: string;
  onChange: (start: string, end: string) => void;
  defaultStartDate?: string;
  defaultEndDate?: string;
};

type Preset = {
  label: string;
  range: () => [string, string];
};

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfWeek(date: Date): Date {
  const next = new Date(date);
  const day = next.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  return addDays(next, offset);
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function startOfYear(date: Date): Date {
  return new Date(date.getFullYear(), 0, 1);
}

function formatFullDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(year, month - 1, day));
}

function formatShortDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(year, month - 1, day));
}

export function formatDateRange(start: string, end: string): string {
  return `${formatFullDate(start)} — ${formatFullDate(end)}`;
}

export function formatDateRangeBadge(start: string, end: string): string {
  return `${formatShortDate(start)} — ${formatShortDate(end)}`;
}

export function todayRange(): [string, string] {
  const today = dateKey();
  return [today, today];
}

export function yesterdayRange(): [string, string] {
  const yesterday = dateKey(addDays(new Date(), -1));
  return [yesterday, yesterday];
}

export function thisWeekRange(): [string, string] {
  return [dateKey(startOfWeek(new Date())), dateKey(new Date())];
}

export function thisMonthRange(): [string, string] {
  return [dateKey(startOfMonth(new Date())), dateKey(new Date())];
}

export function lastMonthRange(): [string, string] {
  const today = new Date();
  const month = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  return [dateKey(startOfMonth(month)), dateKey(endOfMonth(month))];
}

export function lastMonthsRange(months: number): [string, string] {
  const today = new Date();
  return [dateKey(new Date(today.getFullYear(), today.getMonth() - months + 1, 1)), dateKey(today)];
}

export function thisYearRange(): [string, string] {
  return [dateKey(startOfYear(new Date())), dateKey(new Date())];
}

const presets: Preset[] = [
  { label: "Hoy", range: todayRange },
  { label: "Ayer", range: yesterdayRange },
  { label: "Esta semana", range: thisWeekRange },
  { label: "Este mes", range: thisMonthRange },
  { label: "Mes pasado", range: lastMonthRange },
  { label: "Últimos 3 meses", range: () => lastMonthsRange(3) },
  { label: "Últimos 6 meses", range: () => lastMonthsRange(6) },
  { label: "Este año", range: thisYearRange }
];

export function DateRangePicker({ startDate, endDate, onChange, defaultStartDate, defaultEndDate }: DateRangePickerProps) {
  const isCustom = !presets.some((preset) => {
    const [start, end] = preset.range();
    return start === startDate && end === endDate;
  });
  const isDefault = defaultStartDate === startDate && defaultEndDate === endDate;

  return (
    <section className="card-pad grid gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="label">Date range</p>
          <p className="mt-1 text-sm font-semibold text-white">{formatDateRange(startDate, endDate)}</p>
        </div>
        {!isDefault && defaultStartDate && defaultEndDate ? (
          <button className="rounded-lg border border-orange-500/40 bg-orange-950/40 px-3 py-1 text-xs font-semibold text-orange-200 hover:bg-orange-900/50" onClick={() => onChange(defaultStartDate, defaultEndDate)}>
            X {formatDateRangeBadge(startDate, endDate)}
          </button>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {presets.map((preset) => {
          const [start, end] = preset.range();
          const active = start === startDate && end === endDate;
          return (
            <button
              key={preset.label}
              className={`rounded-lg border px-3 py-2 text-xs font-semibold ${active ? "border-accent bg-orange-950/60 text-orange-100" : "border-border text-neutral-300 hover:bg-neutral-900"}`}
              onClick={() => onChange(start, end)}
            >
              {preset.label}
            </button>
          );
        })}
        <span className={`rounded-lg border px-3 py-2 text-xs font-semibold ${isCustom ? "border-accent bg-orange-950/60 text-orange-100" : "border-border text-neutral-400"}`}>Rango personalizado</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input className="input-dark" type="date" value={startDate} onChange={(event) => onChange(event.target.value, endDate)} />
        <span className="text-xs text-muted">to</span>
        <input className="input-dark" type="date" value={endDate} onChange={(event) => onChange(startDate, event.target.value)} />
      </div>
    </section>
  );
}
