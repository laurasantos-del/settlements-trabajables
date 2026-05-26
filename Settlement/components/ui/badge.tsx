import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

const tones = {
  positive: "border-emerald-900/70 bg-emerald-950/70 text-emerald-300",
  warning: "border-orange-900/70 bg-orange-950/70 text-orange-300",
  danger: "border-red-900/70 bg-red-950/70 text-red-300",
  info: "border-blue-900/70 bg-blue-950/70 text-blue-300",
  neutral: "border-neutral-800 bg-neutral-900 text-neutral-300"
};

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: keyof typeof tones }) {
  return <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold", tones[tone])}>{children}</span>;
}
