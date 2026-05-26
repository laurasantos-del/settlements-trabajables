export function parseDate(value: unknown): Date | null {
  const text = String(value ?? "").trim();
  if (!text) return null;

  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    return new Date(`${text.slice(0, 10)}T00:00:00`);
  }

  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (slash) {
    const a = Number(slash[1]);
    const b = Number(slash[2]);
    const year = Number(slash[3].length === 2 ? `20${slash[3]}` : slash[3]);
    const monthFirst = a <= 12;
    return monthFirst ? new Date(year, a - 1, b) : new Date(year, b - 1, a);
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function dateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isSameDay(value: unknown, day = new Date()): boolean {
  const parsed = parseDate(value);
  return parsed ? dateKey(parsed) === dateKey(day) : false;
}

export function isSameMonth(value: unknown, day = new Date()): boolean {
  const parsed = parseDate(value);
  return parsed ? parsed.getFullYear() === day.getFullYear() && parsed.getMonth() === day.getMonth() : false;
}

export function daysBetween(value: unknown, base = new Date()): number {
  const parsed = parseDate(value);
  if (!parsed) return 0;
  return Math.floor((new Date(dateKey(base)).getTime() - parsed.getTime()) / 86_400_000);
}

export function monthLabel(date = new Date()): string {
  return new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" }).format(date);
}
