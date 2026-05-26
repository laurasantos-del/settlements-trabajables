import { formatMoney } from "@/lib/money";
import type { Kpi } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

function display(value: string | number, title: string) {
  const moneyLike = /debt|amount|money|cash|fee|revenue|monto|deuda|balance|savings|retainer|expected|received|difference/i.test(title);
  return typeof value === "number" && moneyLike ? formatMoney(value) : value;
}

export function KpiCard({ kpi }: { kpi: Kpi }) {
  return (
    <article className="card-pad min-h-[140px]">
      <div className="flex items-start justify-between gap-3">
        <p className="label">{kpi.title}</p>
        <Badge tone={kpi.tone ?? "neutral"}>{kpi.tone ?? "neutral"}</Badge>
      </div>
      <div className="mt-5 break-words text-2xl font-bold leading-tight text-white 2xl:text-3xl">{display(kpi.value, kpi.title)}</div>
      {kpi.subtitle ? <p className="mt-2 text-xs text-muted">{kpi.subtitle}</p> : null}
    </article>
  );
}
