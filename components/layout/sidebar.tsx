"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, Banknote, BarChart3, CircleDollarSign, CreditCard, FileSpreadsheet, Handshake, HeartPulse, Home, LayoutDashboard, LineChart, Settings, Siren, TrendingUp, Users, WalletCards } from "lucide-react";
import { cn } from "@/lib/utils";

const modules = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/finance", label: "Finance", icon: CircleDollarSign },
  { href: "/settlements", label: "Settlement", icon: Handshake },
  { href: "/retention", label: "Retención", icon: HeartPulse },
  { href: "/sales", label: "Sales", icon: TrendingUp },
  { href: "/settings", label: "Settings", icon: Settings }
];

const subnav = {
  finance: [
    { href: "/finance", label: "Overview", icon: CircleDollarSign },
    { href: "/finance/client-deposits", label: "Client Deposit", icon: Users },
    { href: "/finance/creditor-payments", label: "Creditor Payments", icon: CreditCard },
    { href: "/finance/revenue", label: "Revenue", icon: LineChart },
    { href: "/finance/alertas", label: "Alertas", icon: AlertTriangle }
  ],
  creditorPayments: [
    { href: "/finance/creditor-payments", label: "Overview", icon: BarChart3 },
    { href: "/finance/creditor-payments/dashboard", label: "Dashboard", icon: Home },
    { href: "/finance/creditor-payments/clients", label: "Clientes", icon: Users },
    { href: "/finance/creditor-payments/creditors", label: "Acreedores", icon: Banknote },
    { href: "/finance/creditor-payments/broken", label: "Broken Settlements", icon: HeartPulse },
    { href: "/finance/creditor-payments/no-funds", label: "Sin Fondos", icon: WalletCards },
    { href: "/finance/creditor-payments/at-risk", label: "At Risk", icon: AlertTriangle },
    { href: "/finance/creditor-payments/active-negative", label: "Active Negative", icon: Siren },
    { href: "/finance/creditor-payments/urgent", label: "Urgentes", icon: Siren }
  ],
  settlement: [
    { href: "/settlements", label: "Overview", icon: BarChart3 },
    { href: "/settlements/creditor-status", label: "Creditor Status", icon: FileSpreadsheet },
    { href: "/settlements/settlements-mes", label: "Settlements del Mes", icon: BarChart3 },
    { href: "/settlements/settlements-futuros", label: "Settlements Futuros", icon: LineChart },
    { href: "/settlements/no-posibles", label: "No Posibles", icon: AlertTriangle },
    { href: "/settlements/rotos", label: "Rotos", icon: HeartPulse },
    { href: "/settlement/plan", label: "Settlement Plan", icon: FileSpreadsheet }
  ],
  retention: [
    { href: "/retention", label: "Overview", icon: BarChart3 },
    { href: "/retention/lifecycle", label: "Lifecycle Dashboard", icon: HeartPulse },
    { href: "/retention/cancellations", label: "Cancellations", icon: AlertTriangle },
    { href: "/retention/sales", label: "Sales Rep Performance", icon: Users },
    { href: "/retention/clients", label: "Client Detail", icon: FileSpreadsheet }
  ],
  sales: [
    { href: "/sales", label: "Overview", icon: TrendingUp },
    { href: "/sales/dashboard", label: "Sales Dashboard", icon: BarChart3 },
    { href: "/sales/performance", label: "Salesperson Performance", icon: Users },
    { href: "/sales/payments", label: "Payment Tables", icon: CreditCard },
    { href: "/sales/chat", label: "Chat", icon: LineChart }
  ]
};

function detect(pathname: string): keyof typeof subnav | null {
  if (pathname.startsWith("/finance/creditor-payments")) return "creditorPayments";
  if (pathname.startsWith("/finance")) return "finance";
  if (pathname.startsWith("/settlement")) return "settlement";
  if (pathname.startsWith("/settlements")) return "settlement";
  if (pathname.startsWith("/retention")) return "retention";
  if (pathname.startsWith("/sales")) return "sales";
  return null;
}

export function Sidebar() {
  const pathname = usePathname();
  const section = detect(pathname);
  const items = section ? subnav[section] : modules;
  const backHref = section === "creditorPayments" ? "/finance" : "/";
  const sectionLabel = section === "creditorPayments" ? "Finance" : section ? section[0].toUpperCase() + section.slice(1) : "";
  const sectionRoot = section === "creditorPayments" ? "/finance/creditor-payments" : section === "settlement" ? "/settlements" : section ? `/${section}` : "/";

  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-border bg-card p-4 lg:flex">
      <div>
        {section ? (
          <Link href={backHref} className="mb-4 block border-b border-border pb-4 text-sm font-semibold text-muted hover:text-white">← {sectionLabel}</Link>
        ) : (
          <div className="mb-6 px-2 text-base font-bold text-white">Settlements CRM</div>
        )}
        <nav className="grid gap-1">
          {items.map((item) => {
            const active = pathname === item.href || (item.href !== "/" && item.href !== sectionRoot && pathname.startsWith(`${item.href}/`));
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className={cn("flex items-center gap-3 rounded-lg border-l-2 border-transparent px-3 py-2 text-sm text-neutral-400 hover:bg-[#1a1a1a] hover:text-white", active && "border-accent bg-[#1f1f1f] text-white")}>
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="mt-auto flex items-center gap-3 border-t border-border pt-4">
        <div className="grid h-9 w-9 place-items-center rounded-full bg-[#1f1f1f] text-xs font-bold text-white">LS</div>
        <div>
          <p className="text-xs font-semibold text-white">Laura Santos</p>
          <p className="text-[11px] text-muted">Operator</p>
        </div>
      </div>
    </aside>
  );
}
