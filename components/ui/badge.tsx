import type { ReactNode } from "react";

const tones = {
  positive: "border-emerald-800 bg-emerald-950 text-emerald-300",
  warning: "border-orange-800 bg-orange-950 text-orange-300",
  danger: "border-red-800 bg-red-950 text-red-300",
  info: "border-blue-800 bg-blue-950 text-blue-300",
  yellow: "border-yellow-700 bg-yellow-950 text-yellow-300",
  neutral: "border-neutral-800 bg-neutral-900 text-neutral-300"
};

export function Badge({ tone = "neutral", children }: { tone?: keyof typeof tones; children: ReactNode }) {
  return <span className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}
