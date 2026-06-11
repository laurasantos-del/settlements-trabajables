import { parseMoney } from "@/lib/api";
import { Badge } from "@/components/ui/badge";

export type KpiTone = "positive" | "warning" | "danger" | "info" | "yellow" | "neutral";

function moneyLike(title: string) {
  return /amount|monto|debt|deuda|fee|cash|dinero|revenue|balance|ahorro|cleared|paid/i.test(title);
}

function displayValue(value: string | number, title: string) {
  if (typeof value === "number" && moneyLike(title)) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(parseMoney(value));
  }
  return value;
}

export function KpiCard(props: { title: string; value: string | number; subtitle?: string; tone?: KpiTone } | { kpi: { title: string; value: string | number; subtitle?: string; tone?: KpiTone } }) {
  const { title, value, subtitle, tone = "neutral" } = "kpi" in props ? props.kpi : props;
  return (
    <article className="rounded-[10px] border border-[#1f1f1f] bg-[#141414] p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#666]">{title}</p>
        <Badge tone={tone}>{tone}</Badge>
      </div>
      <div className="mt-4 break-words text-3xl font-bold leading-tight text-white">{displayValue(value, title)}</div>
      {subtitle ? <p className="mt-2 text-xs text-[#666]">{subtitle}</p> : null}
    </article>
  );
}
