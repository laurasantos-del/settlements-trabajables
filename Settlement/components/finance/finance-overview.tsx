"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useReports } from "@/lib/data-store";
import { dateKey, daysBetween, isSameDay, isSameMonth } from "@/lib/dates";
import { formatMoney, parseMoney } from "@/lib/money";
import type { RawRecord } from "@/lib/types";

// ─── types ────────────────────────────────────────────────────────────────────

type ColDef = {
  key: string;
  label: string;
  render?: (row: RawRecord) => ReactNode;
};

type CardDef = {
  id: string;
  label: string;
  value: string | number;
  subtext?: string;
  borderColor: string;
  badge?: { text: string; color: string; bg: string };
  rows: RawRecord[];
  columns: ColDef[];
  allHref?: string;
};

// ─── skeleton ─────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div
      className="animate-pulse"
      style={{
        background: "#141414",
        border: "1px solid #1f1f1f",
        borderRadius: 10,
        padding: 20,
        minHeight: 96,
      }}
    >
      <div style={{ height: 32, width: "55%", background: "#222", borderRadius: 4 }} />
      <div style={{ height: 10, width: "40%", background: "#1a1a1a", borderRadius: 4, marginTop: 10 }} />
    </div>
  );
}

// ─── expanded table ───────────────────────────────────────────────────────────

function ExpandedTable({
  open,
  rows,
  columns,
  allHref,
}: {
  open: boolean;
  rows: RawRecord[];
  columns: ColDef[];
  allHref?: string;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateRows: open ? "1fr" : "0fr",
        transition: "grid-template-rows 0.28s ease",
      }}
    >
      <div style={{ overflow: "hidden" }}>
        <div
          style={{
            background: "#0d0d0d",
            border: "1px solid #f97316",
            borderTop: "none",
            borderRadius: "0 0 10px 10px",
            padding: 16,
            marginBottom: 16,
          }}
        >
          {rows.length === 0 ? (
            <p style={{ fontSize: 13, color: "#555", textAlign: "center", padding: "12px 0" }}>
              Sin registros
            </p>
          ) : (
            <>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 400 }}>
                  <thead>
                    <tr>
                      {columns.map((c) => (
                        <th
                          key={c.key}
                          style={{
                            fontSize: 11,
                            color: "#666",
                            textTransform: "uppercase",
                            textAlign: "left",
                            padding: "4px 8px 8px",
                            borderBottom: "1px solid #1f1f1f",
                            letterSpacing: "0.05em",
                            fontWeight: 600,
                          }}
                        >
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 10).map((row, i) => (
                      <tr
                        key={i}
                        className="hover:bg-[#1a1a1a]"
                        style={{ transition: "background 0.1s" }}
                      >
                        {columns.map((c) => (
                          <td
                            key={c.key}
                            style={{
                              fontSize: 13,
                              color: "#d4d4d4",
                              padding: "7px 8px",
                              borderBottom: "1px solid #141414",
                            }}
                          >
                            {c.render ? c.render(row) : String(row[c.key] ?? "-")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > 10 && allHref && (
                <div style={{ marginTop: 12, textAlign: "right" }}>
                  <Link
                    href={allHref}
                    style={{ fontSize: 12, color: "#f97316", textDecoration: "none" }}
                  >
                    Ver todos ({rows.length}) →
                  </Link>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── card row ─────────────────────────────────────────────────────────────────

function CardRow({
  cards,
  gridClass,
  loading,
}: {
  cards: CardDef[];
  gridClass: string;
  loading: boolean;
}) {
  const [active, setActive] = useState<string | null>(null);

  function toggle(id: string) {
    setActive((prev) => (prev === id ? null : id));
  }

  const activeCard = active ? cards.find((c) => c.id === active) ?? null : null;

  return (
    <div>
      <div className={`grid gap-3 ${gridClass}`}>
        {loading
          ? Array.from({ length: cards.length }).map((_, i) => <Skeleton key={i} />)
          : cards.map((card) => {
              const isActive = active === card.id;
              return (
                <FinanceCard
                  key={card.id}
                  card={card}
                  isActive={isActive}
                  onToggle={() => toggle(card.id)}
                />
              );
            })}
      </div>
      <ExpandedTable
        open={active !== null}
        rows={activeCard?.rows ?? []}
        columns={activeCard?.columns ?? []}
        allHref={activeCard?.allHref}
      />
    </div>
  );
}

// ─── single card ──────────────────────────────────────────────────────────────

function FinanceCard({
  card,
  isActive,
  onToggle,
}: {
  card: CardDef;
  isActive: boolean;
  onToggle: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  const borderColor = isActive || hovered ? "#f97316" : card.borderColor;
  const radius = isActive ? "10px 10px 0 0" : "10px";

  return (
    <button
      onClick={onToggle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: "#141414",
        border: `1px solid ${borderColor}`,
        borderRadius: radius,
        padding: "20px",
        cursor: "pointer",
        transition: "border-color 0.2s, border-radius 0.15s",
        textAlign: "left",
        width: "100%",
        outline: "none",
        minHeight: 96,
      }}
    >
      {card.badge && (
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: card.badge.color,
            background: card.badge.bg,
            padding: "2px 7px",
            borderRadius: 4,
            marginBottom: 10,
            display: "inline-block",
            letterSpacing: "0.05em",
          }}
        >
          {card.badge.text}
        </span>
      )}
      <div
        style={{
          fontSize: 32,
          fontWeight: 700,
          color: "white",
          lineHeight: 1.1,
          marginBottom: 6,
        }}
      >
        {card.value}
      </div>
      <div
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          color: "#666",
          letterSpacing: "0.06em",
        }}
      >
        {card.label}
      </div>
      {card.subtext && (
        <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>{card.subtext}</div>
      )}
    </button>
  );
}

// ─── section header ───────────────────────────────────────────────────────────

function SectionTitle({ title }: { title: string }) {
  return (
    <h2
      style={{
        fontSize: 11,
        fontWeight: 700,
        color: "#555",
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        marginBottom: 14,
      }}
    >
      {title}
    </h2>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function clientName(row: RawRecord): string {
  return `${row["First Name"] ?? ""} ${row["Last Name"] ?? ""}`.trim() || "-";
}

function parseFee(val: unknown): number {
  const parsed = parseFloat(String(val ?? "").replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

// ─── main ─────────────────────────────────────────────────────────────────────

export function FinanceOverview() {
  const { store, loading } = useReports();

  const interactions = store.clientInteractions ?? [];
  const expectedPayments = store.expectedClientPayments ?? [];
  const settlementPayments = store.settlementPayments ?? [];
  const paymentsCleared = store.paymentsCleared ?? [];

  // ── Section 1: Client Deposits ──────────────────────────────────────────────

  const activeClients = useMemo(
    () => interactions.filter((r) => r["Client Status"] === "Active"),
    [interactions]
  );
  const nsfClients = useMemo(
    () => interactions.filter((r) => String(r["Client Status"]).toLowerCase().includes("nsf")),
    [interactions]
  );
  const onHoldClients = useMemo(
    () => interactions.filter((r) => r["Client Status"] === "On Hold"),
    [interactions]
  );
  const waitingClients = useMemo(
    () => interactions.filter((r) => r["Client Status"] === "Waiting for first payment"),
    [interactions]
  );
  const depositsToday = useMemo(
    () =>
      expectedPayments.filter(
        (r) =>
          String(r["Payment Status"]).trim() === "Scheduled" &&
          isSameDay(r["Scheduled Draft Date"])
      ),
    [expectedPayments]
  );
  const depositsTodaySum = useMemo(
    () => depositsToday.reduce((s, r) => s + parseMoney(r["Amount"]), 0),
    [depositsToday]
  );

  const interactionCols: ColDef[] = [
    { key: "_name", label: "Nombre", render: clientName },
    { key: "Client ID", label: "Client ID" },
    {
      key: "Monthly Payment Amount",
      label: "Monthly Payment",
      render: (r) => formatMoney(r["Monthly Payment Amount"]),
    },
    {
      key: "Total Enrolled Debt",
      label: "Total Debt",
      render: (r) => formatMoney(r["Total Enrolled Debt"]),
    },
  ];

  const depositCols: ColDef[] = [
    { key: "_name", label: "Cliente", render: clientName },
    { key: "Amount", label: "Monto", render: (r) => formatMoney(r["Amount"]) },
    { key: "Scheduled Draft Date", label: "Fecha" },
    { key: "Payment Status", label: "Status" },
  ];

  const depositsSection: CardDef[] = [
    {
      id: "active",
      label: "Activos",
      value: activeClients.length,
      borderColor: "#22c55e",
      rows: activeClients,
      columns: interactionCols,
      allHref: "/finance/client-deposits",
    },
    {
      id: "nsf",
      label: "NSF",
      value: nsfClients.length,
      borderColor: "#ef4444",
      rows: nsfClients,
      columns: interactionCols,
      allHref: "/finance/client-deposits",
    },
    {
      id: "onhold",
      label: "On Hold",
      value: onHoldClients.length,
      borderColor: "#eab308",
      rows: onHoldClients,
      columns: interactionCols,
      allHref: "/finance/client-deposits",
    },
    {
      id: "waiting",
      label: "Waiting First Payment",
      value: waitingClients.length,
      borderColor: "#f97316",
      rows: waitingClients,
      columns: interactionCols,
      allHref: "/finance/client-deposits",
    },
    {
      id: "deposits",
      label: "Depósitos Hoy",
      value: depositsToday.length,
      subtext: formatMoney(depositsTodaySum),
      borderColor: "#3b82f6",
      rows: depositsToday,
      columns: depositCols,
      allHref: "/finance/client-deposits",
    },
  ];

  // ── Section 2: Pagos al Acreedor ────────────────────────────────────────────

  const last60Paid = useMemo(
    () =>
      settlementPayments.filter((r) => {
        if (String(r["Payment Status"]) !== "Y") return false;
        const d = daysBetween(r["Due Date"]);
        return d >= 0 && d <= 60;
      }),
    [settlementPayments]
  );

  const activeSettlementsCount = useMemo(() => {
    const keys = new Set<string>();
    for (const r of last60Paid) keys.add(`${r["Client ID"]}-${r["Current Creditor"]}`);
    return keys.size;
  }, [last60Paid]);

  const moneyOut = useMemo(
    () => last60Paid.reduce((s, r) => s + Math.abs(parseMoney(r["Amount"])), 0),
    [last60Paid]
  );

  const pagosHoy = useMemo(
    () => settlementPayments.filter((r) => isSameDay(r["Due Date"])),
    [settlementPayments]
  );
  const pagosHoySum = useMemo(
    () => pagosHoy.reduce((s, r) => s + Math.abs(parseMoney(r["Amount"])), 0),
    [pagosHoy]
  );

  const legalAccounts = useMemo(
    () =>
      settlementPayments.filter((r) =>
        /legal|attorney|law/i.test(String(r["Current Creditor"] ?? ""))
      ),
    [settlementPayments]
  );

  const paymentCols: ColDef[] = [
    { key: "Client ID", label: "Cliente" },
    { key: "Current Creditor", label: "Acreedor" },
    { key: "Due Date", label: "Fecha" },
    {
      key: "Amount",
      label: "Monto",
      render: (r) => formatMoney(Math.abs(parseMoney(r["Amount"]))),
    },
    { key: "Payment Status", label: "Status" },
  ];

  const pagosSection: CardDef[] = [
    {
      id: "activos",
      label: "Negocios Activos",
      value: activeSettlementsCount,
      borderColor: "#22c55e",
      rows: last60Paid,
      columns: paymentCols,
      allHref: "/finance/creditor-payments",
    },
    {
      id: "saliendo",
      label: "Dinero Saliendo",
      value: formatMoney(moneyOut),
      borderColor: "#f97316",
      rows: last60Paid,
      columns: paymentCols,
      allHref: "/finance/creditor-payments",
    },
    {
      id: "hoy",
      label: "Pagos Hoy",
      value: pagosHoy.length,
      subtext: formatMoney(pagosHoySum),
      borderColor: "#3b82f6",
      rows: pagosHoy,
      columns: paymentCols,
      allHref: "/finance/creditor-payments",
    },
    {
      id: "legal",
      label: "En Legal",
      value: legalAccounts.length,
      borderColor: "#ef4444",
      rows: legalAccounts,
      columns: paymentCols,
      allHref: "/finance/creditor-payments",
    },
  ];

  // ── Section 3: Revenue ──────────────────────────────────────────────────────

  const feeEsperado = useMemo(
    () => activeClients.reduce((s, r) => s + parseFee(r["Settlement Fee"]), 0),
    [activeClients]
  );
  const activeWithFee = useMemo(
    () => activeClients.filter((r) => parseFee(r["Settlement Fee"]) > 0),
    [activeClients]
  );

  const clearedThisMonth = useMemo(
    () => paymentsCleared.filter((r) => isSameMonth(r["Date Cleared"])),
    [paymentsCleared]
  );
  const clearedSum = useMemo(
    () => clearedThisMonth.reduce((s, r) => s + parseMoney(r["Draft Amount"]), 0),
    [clearedThisMonth]
  );

  const deudaActivos = useMemo(
    () => activeClients.reduce((s, r) => s + parseMoney(r["Total Enrolled Debt"]), 0),
    [activeClients]
  );

  const retainerTotal = useMemo(
    () => paymentsCleared.reduce((s, r) => s + parseMoney(r["Retainer Amount"]), 0),
    [paymentsCleared]
  );
  const clearedWithRetainer = useMemo(
    () => paymentsCleared.filter((r) => parseMoney(r["Retainer Amount"]) > 0),
    [paymentsCleared]
  );

  const feeCols: ColDef[] = [
    { key: "_name", label: "Cliente", render: clientName },
    {
      key: "Total Enrolled Debt",
      label: "Deuda",
      render: (r) => formatMoney(r["Total Enrolled Debt"]),
    },
    {
      key: "Settlement Fee",
      label: "Fee Esperado",
      render: (r) => formatMoney(parseFee(r["Settlement Fee"])),
    },
  ];

  const clearedCols: ColDef[] = [
    { key: "Client ID", label: "Cliente" },
    { key: "Date Cleared", label: "Fecha" },
    { key: "Draft Amount", label: "Monto", render: (r) => formatMoney(r["Draft Amount"]) },
  ];

  const deudaCols: ColDef[] = [
    { key: "_name", label: "Cliente", render: clientName },
    { key: "Client ID", label: "Client ID" },
    {
      key: "Total Enrolled Debt",
      label: "Deuda Enrollada",
      render: (r) => formatMoney(r["Total Enrolled Debt"]),
    },
  ];

  const retainerCols: ColDef[] = [
    { key: "Client ID", label: "Cliente" },
    { key: "Date Cleared", label: "Fecha" },
    {
      key: "Retainer Amount",
      label: "Retainer",
      render: (r) => formatMoney(r["Retainer Amount"]),
    },
  ];

  const revenueSection: CardDef[] = [
    {
      id: "fee",
      label: "Fee Esperado",
      value: formatMoney(feeEsperado),
      borderColor: "#22c55e",
      rows: activeWithFee,
      columns: feeCols,
      allHref: "/finance/revenue",
    },
    {
      id: "cleared",
      label: "Pagos Cleared Este Mes",
      value: formatMoney(clearedSum),
      subtext: `${clearedThisMonth.length} pagos`,
      borderColor: "#3b82f6",
      rows: clearedThisMonth,
      columns: clearedCols,
      allHref: "/finance/revenue",
    },
    {
      id: "deuda",
      label: "Deuda Enrollada Activos",
      value: formatMoney(deudaActivos),
      borderColor: "#f97316",
      rows: activeClients,
      columns: deudaCols,
      allHref: "/finance/client-deposits",
    },
    {
      id: "retainer",
      label: "Retainer Total",
      value: formatMoney(retainerTotal),
      subtext: `${clearedWithRetainer.length} registros`,
      borderColor: "#8b5cf6",
      rows: clearedWithRetainer,
      columns: retainerCols,
      allHref: "/finance/revenue",
    },
  ];

  // ── Section 4: Alertas de Reconciliación ────────────────────────────────────

  type AlertRow = RawRecord & { _days: number; _category: string };

  const alerts = useMemo((): AlertRow[] => {
    return settlementPayments
      .filter((r) => String(r["Payment Status"]) !== "Y")
      .map((r) => {
        const d = daysBetween(r["Due Date"]);
        const cat =
          d > 90
            ? "Broken Settlement"
            : d > 60
            ? "Posible Broken"
            : d > 30
            ? "Riesgo Alto"
            : d > 15
            ? "Alerta Media"
            : d >= 1
            ? "En seguimiento"
            : "";
        return { ...r, _days: d, _category: cat } as AlertRow;
      })
      .filter((r) => r._days >= 1);
  }, [settlementPayments]);

  const alertCols: ColDef[] = [
    { key: "Client ID", label: "Cliente" },
    { key: "Current Creditor", label: "Acreedor" },
    {
      key: "Amount",
      label: "Monto",
      render: (r) => formatMoney(Math.abs(parseMoney(r["Amount"]))),
    },
    { key: "Due Date", label: "Due Date" },
    { key: "_days", label: "Días vencido" },
  ];

  const seg = (cat: string): RawRecord[] =>
    alerts.filter((r) => r._category === cat);

  const alertsSection: CardDef[] = [
    {
      id: "seg1",
      label: "En Seguimiento",
      value: seg("En seguimiento").length,
      borderColor: "#3b82f6",
      badge: { text: "1–15 días", color: "#3b82f6", bg: "#3b82f620" },
      rows: seg("En seguimiento"),
      columns: alertCols,
      allHref: "/finance/alertas",
    },
    {
      id: "seg2",
      label: "Alerta Media",
      value: seg("Alerta Media").length,
      borderColor: "#eab308",
      badge: { text: "16–30 días", color: "#eab308", bg: "#eab30820" },
      rows: seg("Alerta Media"),
      columns: alertCols,
      allHref: "/finance/alertas",
    },
    {
      id: "seg3",
      label: "Riesgo Alto",
      value: seg("Riesgo Alto").length,
      borderColor: "#f97316",
      badge: { text: "31–60 días", color: "#f97316", bg: "#f9731620" },
      rows: seg("Riesgo Alto"),
      columns: alertCols,
      allHref: "/finance/alertas",
    },
    {
      id: "seg4",
      label: "Posible Broken",
      value: seg("Posible Broken").length,
      borderColor: "#ef4444",
      badge: { text: "61–90 días", color: "#ef4444", bg: "#ef444420" },
      rows: seg("Posible Broken"),
      columns: alertCols,
      allHref: "/finance/alertas",
    },
    {
      id: "seg5",
      label: "Broken Settlement",
      value: seg("Broken Settlement").length,
      borderColor: "#7f1d1d",
      badge: { text: "+90 días", color: "#fca5a5", bg: "#7f1d1d40" },
      rows: seg("Broken Settlement"),
      columns: alertCols,
      allHref: "/finance/alertas",
    },
  ];

  // ── render ───────────────────────────────────────────────────────────────────

  const todayLabel = new Date().toLocaleDateString("es-ES", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ marginBottom: 40 }}>
        <p className="label">Finance</p>
        <h1 style={{ fontSize: 30, fontWeight: 700, color: "white", margin: "8px 0 4px" }}>
          Finance Overview
        </h1>
        <p style={{ fontSize: 13, color: "#555", marginBottom: 20, textTransform: "capitalize" }}>
          {todayLabel}
        </p>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          {[
            ["/finance/client-deposits", "Client Deposits →"],
            ["/finance/pagos-acreedor", "Pagos al Acreedor →"],
            ["/finance/revenue", "Revenue →"],
            ["/finance/alertas", "Alertas →"],
          ].map(([href, label]) => (
            <Link
              key={href}
              href={href}
              style={{ fontSize: 13, color: "#f97316", textDecoration: "none" }}
              className="hover:text-orange-300"
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      {/* ── Section 1: Client Deposits ── */}
      <section style={{ marginBottom: 48 }}>
        <SectionTitle title="Client Deposits" />
        <CardRow
          cards={depositsSection}
          gridClass="grid-cols-2 md:grid-cols-3 xl:grid-cols-5"
          loading={loading}
        />
      </section>

      {/* ── Section 2: Pagos al Acreedor ── */}
      <section style={{ marginBottom: 48 }}>
        <SectionTitle title="Pagos al Acreedor" />
        <CardRow
          cards={pagosSection}
          gridClass="grid-cols-2 xl:grid-cols-4"
          loading={loading}
        />
      </section>

      {/* ── Section 3: Revenue ── */}
      <section style={{ marginBottom: 48 }}>
        <SectionTitle title="Revenue" />
        <CardRow
          cards={revenueSection}
          gridClass="grid-cols-2 xl:grid-cols-4"
          loading={loading}
        />
        <div
          style={{
            background: "#451a03",
            border: "1px solid #92400e",
            borderRadius: 8,
            padding: "10px 16px",
            marginTop: 16,
            fontSize: 13,
            color: "#fde68a",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          ⚠️ Commissions no disponible para este usuario
        </div>
      </section>

      {/* ── Section 4: Alertas de Reconciliación ── */}
      <section>
        <SectionTitle title="Alertas de Reconciliación" />
        <CardRow
          cards={alertsSection}
          gridClass="grid-cols-2 md:grid-cols-3 xl:grid-cols-5"
          loading={loading}
        />
      </section>
    </div>
  );
}
