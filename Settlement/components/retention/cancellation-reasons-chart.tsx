"use client";

import { Bars } from "@/components/ui/charts";
import type { LifecycleClient } from "@/lib/types";

const translations: Record<string, string> = {
  "CAN Nunca pago": "Never made a payment",
  "CAN Cliente incapaz de contact": "Could not contact client",
  "CAN Insatisfaccion con el servicio": "Dissatisfied with service",
  "CAN Problemas financieros": "Financial hardship",
  "CAN Fue con otra compania": "Went to competitor"
};

export function CancellationReasonsChart({ rows }: { rows: LifecycleClient[] }) {
  const counts = new Map<string, number>();
  for (const row of rows.filter((item) => item._segment.includes("cancelled"))) {
    const reason = String(row["Cancellation Reasons"] ?? "Unknown") || "Unknown";
    const label = translations[reason] ?? reason;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const data = Array.from(counts.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 12);
  return (
    <section className="card-pad">
      <h2 className="font-semibold text-white">Cancellation Reasons</h2>
      <Bars data={data} horizontal />
    </section>
  );
}
