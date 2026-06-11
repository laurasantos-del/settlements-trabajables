"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const main = [
  ["Dashboard", "/"],
  ["Finance", "finance"],
  ["NSF Tickets", "/tickets/nsf"],
  ["CS/BO Alerts", "/tickets/csbo"],
  ["Pagos Mañana", "/payments/tomorrow"],
  ["Settlement", "settlement"],
  ["Retención", "/retention"],
  ["Sales", "/sales"],
  ["Settings", "/settings"]
] as const;

const finance = [
  ["Overview", "/finance"],
  ["Client Deposits", "/finance/client-deposits"],
  ["Pagos al Acreedor", "/finance/creditor-payments-overview"],
  ["Revenue", "/finance/revenue"],
  ["Alertas", "/finance/alerts"],
  ["Creditor Payments CRM", "/finance/creditor-payments-overview"]
] as const;

const settlement = [
  ["Overview", "/settlement"],
  ["Creditor Status", "/settlement/creditor-status"],
  ["Settlements del Mes", "/settlement/monthly"],
  ["Futuros", "/settlement/futures"],
  ["No Posibles", "/settlement/not-possible"],
  ["Rotos", "/settlement/broken"],
  ["Plan", "/settlement/plan"],
  ["Negociables", "/settlement/negociables"]
] as const;

function Item({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link className={`block rounded-md border-l-2 px-3 py-2 text-sm ${active ? "border-[#f97316] bg-[#1f1f1f] text-white" : "border-transparent text-[#a0a0a0] hover:bg-[#1a1a1a] hover:text-white"}`} href={href}>
      {label}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const auto = pathname.startsWith("/finance") ? "finance" : pathname.startsWith("/settlement") ? "settlement" : "";
  const [mode, setMode] = useState<"" | "finance" | "settlement">(auto as "" | "finance" | "settlement");
  const [hideSubmenu, setHideSubmenu] = useState(false);
  const current = hideSubmenu ? "" : mode || auto;
  const list = current === "finance" ? finance : current === "settlement" ? settlement : main;

  useEffect(() => {
    if (!pathname.startsWith("/finance") && !pathname.startsWith("/settlement")) {
      setHideSubmenu(false);
      setMode("");
    }
  }, [pathname]);

  const handleSection = (href: "finance" | "settlement") => {
    setHideSubmenu(false);
    setMode(href);
  };

  return (
    <aside className="fixed left-0 top-0 z-40 hidden h-screen w-[240px] border-r border-[#1f1f1f] bg-[#141414] p-4 lg:flex lg:flex-col">
      {current ? (
        <button className="mb-3 border-b border-[#1f1f1f] pb-3 text-left text-sm text-[#a0a0a0] hover:text-white" onClick={() => setHideSubmenu(true)}>← {current === "finance" ? "Finance" : "Settlement"}</button>
      ) : (
        <div className="mb-6 text-sm font-bold text-white">Settlements CRM</div>
      )}
      <nav className="grid gap-1">
        {list.map(([label, href]) => {
          if (href === "finance" || href === "settlement") {
            return <button key={label} className="rounded-md border-l-2 border-transparent px-3 py-2 text-left text-sm text-[#a0a0a0] hover:bg-[#1a1a1a] hover:text-white" onClick={() => handleSection(href)}>{label}</button>;
          }
          return <Item key={href} label={label} href={href} active={pathname === href} />;
        })}
      </nav>
      <div className="mt-auto flex items-center gap-3 border-t border-[#1f1f1f] pt-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1f1f1f] text-sm font-bold text-white">LS</div>
        <div><p className="text-sm font-semibold text-white">Laura Santos</p><p className="text-xs text-[#666]">Operator</p></div>
      </div>
    </aside>
  );
}
