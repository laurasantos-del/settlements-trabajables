"use client";

function key(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function todayRange(): [string, string] {
  const today = key(new Date());
  return [today, today];
}

export function yesterdayRange(): [string, string] {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const y = key(d);
  return [y, y];
}

export function thisWeekRange(): [string, string] {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - now.getDay());
  return [key(start), key(now)];
}

export function thisMonthRange(): [string, string] {
  const now = new Date();
  return [key(new Date(now.getFullYear(), now.getMonth(), 1)), key(now)];
}

export function lastMonthRange(): [string, string] {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 0);
  return [key(start), key(end)];
}

export function thisYearRange(): [string, string] {
  const now = new Date();
  return [key(new Date(now.getFullYear(), 0, 1)), key(now)];
}

export function lastMonthsRange(months: number): [string, string] {
  const now = new Date();
  return [key(new Date(now.getFullYear(), now.getMonth() - months + 1, 1)), key(now)];
}

export function formatRange(start: string, end: string) {
  const fmt = new Intl.DateTimeFormat("en-US", { day: "2-digit", month: "short", year: "numeric" });
  return `${fmt.format(new Date(`${start}T00:00:00`))} — ${fmt.format(new Date(`${end}T00:00:00`))}`;
}

export const formatDateRange = formatRange;
export const formatDateRangeBadge = formatRange;

const presets = [
  ["Hoy", todayRange],
  ["Ayer", yesterdayRange],
  ["Esta semana", thisWeekRange],
  ["Este mes", thisMonthRange],
  ["Mes pasado", lastMonthRange]
] as const;

export function DateRangePicker(props: { start?: string; end?: string; startDate?: string; endDate?: string; defaultStartDate?: string; defaultEndDate?: string; onChange: (start: string, end: string) => void }) {
  const start = props.start ?? props.startDate ?? props.defaultStartDate ?? todayRange()[0];
  const end = props.end ?? props.endDate ?? props.defaultEndDate ?? todayRange()[1];
  const onChange = props.onChange;
  return (
    <section className="rounded-[10px] border border-[#1f1f1f] bg-[#141414] p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#666]">Date range</p>
      <p className="mt-1 text-sm font-semibold text-white">{formatRange(start, end)}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {presets.map(([label, range]) => (
          <button key={label} className="rounded-md border border-[#1f1f1f] px-3 py-1 text-xs text-neutral-300 hover:border-[#f97316] hover:text-white" onClick={() => onChange(...range())}>
            {label}
          </button>
        ))}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <input className="rounded-md border border-[#1f1f1f] bg-[#0f0f0f] px-3 py-2 text-sm" type="date" value={start} onChange={(e) => onChange(e.target.value, end)} />
        <input className="rounded-md border border-[#1f1f1f] bg-[#0f0f0f] px-3 py-2 text-sm" type="date" value={end} onChange={(e) => onChange(start, e.target.value)} />
      </div>
    </section>
  );
}
