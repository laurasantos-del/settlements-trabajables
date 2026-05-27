"use client";

import { KpiCard } from "@/components/dashboard/kpi-card";
import { retentionKpis } from "@/lib/metrics/retention-metrics";
import type { LifecycleClient } from "@/lib/types";

export function RetentionKpiCards({ rows }: { rows: LifecycleClient[] }) {
  const tones = ["neutral", "positive", "danger", "warning", "info", "positive", "danger"] as const;
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {retentionKpis(rows).map((kpi, index) => <KpiCard key={kpi.title} kpi={{ ...kpi, tone: tones[index] }} />)}
    </section>
  );
}
