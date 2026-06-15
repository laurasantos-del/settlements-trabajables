import { writeFileSync } from "fs";

const SCREENS = [
  { id: "dashboard", name: "Dashboard", route: "/", kpis: ["New Enrollments", "Total Enrolled Debt", "Client Deposits", "Creditor Payments", "Cancelled", "Broken Settlements", "Activos", "NSF", "On Hold", "Depósitos hoy", "Negociables", "Settlements mes", "Broken", "Alertas"], charts: ["Clients by Status (Donut)", "Monthly Activity (Bars)"], tables: ["Alertas críticas"] },
  { id: "finance-overview", name: "Finance Overview", route: "/finance", sections: ["Client Deposits (expandable)", "Pagos al Acreedor (expandable)", "Revenue", "Alertas Reconciliación"], kpis: ["Activos", "NSF", "On Hold", "Waiting", "Depósitos hoy", "Negocios Activos", "Dinero Saliendo", "Fees Agendados", "Fees Cobrados"] },
  { id: "client-deposits", name: "Client Deposits", route: "/finance/client-deposits", kpis: ["Active", "NSF", "On Hold", "Waiting", "Promised to Pay"], tables: ["Pagos Scheduled"], extras: ["Date range picker"] },
  { id: "creditor-payments", name: "Pagos al Acreedor", route: "/finance/creditor-payments-overview", kpis: ["Negocios Activos", "Dinero Saliendo", "Pagos en Rango", "En Legal"], tables: ["Settlement Payment Report"], extras: ["Date range picker"] },
  { id: "revenue", name: "Revenue", route: "/finance/revenue", kpis: ["Fees Agendados", "Fees Cobrados", "Pagos Cleared este mes", "Commissions warning"], tables: ["Payments Cleared"] },
  { id: "alerts", name: "Alertas Reconciliación", route: "/finance/alerts", kpis: ["En seguimiento", "Medio", "Riesgo Alto", "Posible Broken", "Broken Settlement"], tables: ["Alertas"] },
  { id: "settlement-overview", name: "Settlement Overview", route: "/settlement", kpis: ["Negociables", "Settlements Activos", "Alertas", "Settlements Mes", "Broken Creditor", "No Posibles"] },
  { id: "creditor-status", name: "Creditor Status", route: "/settlement/creditor-status", kpis: ["Status count cards (up to 12)"], tables: ["Creditor Status"], extras: ["Search filter"] },
  { id: "monthly", name: "Settlements del Mes", route: "/settlement/monthly", kpis: ["Count", "Deuda negociada", "Monto", "Ahorro"], tables: ["Settlements"] },
  { id: "futures", name: "Futuros", route: "/settlement/futures", kpis: ["Sin acuerdo", "Con fondos", "Negociables 55%"], tables: ["Cuentas futuras"] },
  { id: "negociables", name: "Negociables", route: "/settlement/negociables", kpis: ["Clientes negociables", "Con deudas listas", "Escrow total", "Deudas pendientes"], tables: ["Clientes negociables"] },
  { id: "not-possible", name: "No Posibles", route: "/settlement/not-possible", kpis: ["S40", "S50", "REMOVEPEND", "ADDPEND"], tables: ["No Posibles"] },
  { id: "broken", name: "Rotos", route: "/settlement/broken", tables: ["Settlements Rotos"] },
  { id: "plan", name: "Settlement Plan", route: "/settlement/plan", tables: ["Plan (monthly est, 55%, first settlement month)"] },
  { id: "sales", name: "Sales", route: "/sales", kpis: ["Total Signed", "First Payment", "Missing", "Completion Rate", "Enrolled Debt", "Expected/Actual", "Recovery %", "Past Due", "Future", "Complete", "Partial"], charts: ["Timing by First Payment", "Sales Rep Activity"], tables: ["Sales Rep Performance", "First Payment Performance", "Missing", "Partial", "Future", "Past Due"], note: "Demo data" },
  { id: "retention", name: "Retención", route: "/retention", kpis: ["Total Enrolled", "Active Paying", "Never Paid Left", "Cancelled After Paying", "Graduated", "Debt Lost", "Debt Retained"], charts: ["Segment Donut", "Cancellations by Month", "Tenure Buckets", "Cancellation Reasons"], tables: ["Sales Rep Table", "Client Detail"], extras: ["Filters: segment, rep, program, state, year"] },
  { id: "settings", name: "Settings", route: "/settings", note: "Configuration placeholder" },
  { id: "nsf-tickets", name: "NSF Tickets", route: "/tickets/nsf", tabs: ["Review", "Created Today"], tables: ["Proposed tickets", "Editable subject/content"], actions: ["Refresh NSF", "Create in HubSpot"] },
  { id: "csbo-tickets", name: "CS/BO Alerts", route: "/tickets/csbo", tabs: ["Review", "Created Today"], actions: ["Refresh", "Create in HubSpot"] },
  { id: "tomorrow", name: "Pagos Mañana", route: "/payments/tomorrow", sections: ["Incoming — client deposits", "Outgoing — creditor payments"], tables: ["Payment tables with totals"] }
];

const NAV_MAIN = ["Dashboard", "Finance", "NSF Tickets", "CS/BO Alerts", "Pagos Mañana", "Settlement", "Retención", "Sales", "Settings"];
const NAV_FINANCE = ["Overview", "Client Deposits", "Pagos al Acreedor", "Revenue", "Alertas"];
const NAV_SETTLEMENT = ["Overview", "Creditor Status", "Settlements del Mes", "Futuros", "No Posibles", "Rotos", "Plan", "Negociables"];

function text(id, content, x, y, w, h, opts = {}) {
  return { id, type: "text", content, x, y, width: w, height: h, fill: opts.fill || "$text-secondary", fontSize: opts.fontSize || 12, fontWeight: opts.fontWeight };
}

function kpiCard(id, title, x, y) {
  return {
    id,
    type: "frame",
    name: `KPI — ${title}`,
    x,
    y,
    width: 200,
    height: 100,
    fill: "$bg-panel",
    cornerRadius: 10,
    layout: "vertical",
    children: [
      { id: `${id}-label`, type: "text", content: title.toUpperCase(), fill: "$text-muted", fontSize: 10, fontWeight: "600" },
      { id: `${id}-val`, type: "text", content: "1,234", fill: "$text-primary", fontSize: 28, fontWeight: "700" }
    ]
  };
}

function tableBlock(id, title, x, y, w, h) {
  return {
    id,
    type: "frame",
    name: `Table — ${title}`,
    x,
    y,
    width: w,
    height: h,
    fill: "$bg-panel",
    cornerRadius: 10,
    layout: "vertical",
    children: [
      { id: `${id}-title`, type: "text", content: title, fill: "$text-primary", fontSize: 14, fontWeight: "600" },
      { id: `${id}-rows`, type: "frame", name: "Rows", width: "fill_container", height: "fill_container", fill: "$bg-elevated", children: [
        { id: `${id}-row1`, type: "text", content: "Column headers → data rows → pagination", fill: "$text-muted", fontSize: 11 }
      ]}
    ]
  };
}

function sidebar(id, x, y, h, items, active) {
  return {
    id,
    type: "frame",
    name: "Sidebar",
    x,
    y,
    width: 240,
    height: h,
    fill: "$bg-panel",
    layout: "vertical",
    children: [
      { id: `${id}-brand`, type: "text", content: "Settlements CRM", fill: "$text-primary", fontSize: 14, fontWeight: "700" },
      ...items.map((label, i) => ({
        id: `${id}-nav-${i}`,
        type: "text",
        content: label,
        fill: label === active ? "$accent" : "$text-secondary",
        fontSize: 13,
        fontWeight: label === active ? "600" : "400"
      })),
      { id: `${id}-user`, type: "text", content: "Laura Santos · Operator", fill: "$text-muted", fontSize: 11 }
    ]
  };
}

function screenFrame(screen, col, row) {
  const W = 1280;
  const H = 820;
  const gap = 80;
  const x = col * (W + gap);
  const y = 1200 + row * (H + gap);
  const id = `screen-${screen.id}`;
  const kpis = screen.kpis || [];
  const kpiRow = kpis.slice(0, 6).map((k, i) => kpiCard(`${id}-kpi-${i}`, k, 260 + (i % 3) * 210, 80 + Math.floor(i / 3) * 110));

  const mainChildren = [
    { id: `${id}-header-label`, type: "text", content: "SETTLEMENTS CRM", fill: "$text-muted", fontSize: 11, fontWeight: "600" },
    { id: `${id}-header-title`, type: "text", content: screen.name, fill: "$text-primary", fontSize: 28, fontWeight: "700" },
    { id: `${id}-route`, type: "text", content: screen.route, fill: "$text-muted", fontSize: 11 },
    ...kpiRow,
  ];

  if (screen.charts?.length) {
    screen.charts.forEach((c, i) => {
      mainChildren.push({
        id: `${id}-chart-${i}`,
        type: "frame",
        name: c,
        x: 260 + (i % 2) * 480,
        y: 320,
        width: 460,
        height: 220,
        fill: "$bg-panel",
        cornerRadius: 10,
        children: [{ id: `${id}-chart-${i}-lbl`, type: "text", content: c, fill: "$text-primary", fontSize: 13, fontWeight: "600" }]
      });
    });
  }

  if (screen.tables?.length) {
    mainChildren.push(tableBlock(`${id}-table`, screen.tables[0], 260, 560, 960, 200));
  }

  if (screen.sections?.length) {
    mainChildren.push({
      id: `${id}-sections`,
      type: "text",
      content: "Sections: " + screen.sections.join(" · "),
      fill: "$text-secondary",
      fontSize: 11
    });
  }

  if (screen.note) {
    mainChildren.push({ id: `${id}-note`, type: "text", content: `Note: ${screen.note}`, fill: "$warning", fontSize: 11 });
  }

  const navItems = screen.route.startsWith("/finance") ? NAV_FINANCE : screen.route.startsWith("/settlement") ? NAV_SETTLEMENT : NAV_MAIN;

  return {
    id,
    type: "frame",
    name: `Screen — ${screen.name}`,
    x,
    y,
    width: W,
    height: H,
    fill: "$bg-app",
    layout: "horizontal",
    children: [
      sidebar(`${id}-sidebar`, 0, 0, H, navItems, screen.name.split(" ")[0]),
      {
        id: `${id}-main`,
        type: "frame",
        name: "Main Content",
        width: "fill_container",
        height: "fill_container",
        layout: "vertical",
        children: mainChildren
      }
    ]
  };
}

const screenFrames = SCREENS.map((s, i) => screenFrame(s, i % 4, Math.floor(i / 4)));

const doc = {
  version: "2.13",
  variables: {
    "bg-app": { type: "color", value: "#0f0f0f" },
    "bg-panel": { type: "color", value: "#141414" },
    "bg-elevated": { type: "color", value: "#1a1a1a" },
    "bg-card": { type: "color", value: "#1f1f1f" },
    "text-primary": { type: "color", value: "#ffffff" },
    "text-secondary": { type: "color", value: "#a0a0a0" },
    "text-muted": { type: "color", value: "#666666" },
    accent: { type: "color", value: "#f97316" },
    positive: { type: "color", value: "#22c55e" },
    warning: { type: "color", value: "#eab308" },
    danger: { type: "color", value: "#ef4444" },
    info: { type: "color", value: "#3b82f6" },
    radius: { type: "number", value: 10 },
    "sidebar-width": { type: "number", value: 240 },
    spacing: { type: "number", value: 16 }
  },
  children: [
    {
      id: "readme",
      type: "note",
      name: "HOW TO SEE ALL SCREENS",
      x: 0,
      y: 0,
      width: 600,
      height: 200,
      fill: "$warning",
      content: "This file maps ALL 20 CRM screens from components/crm.tsx.\n\nIn Pencil: View → Zoom to Fit (or scroll right/down).\nScreens start at Y=1200 in a 4-column grid.\n\nTo get pixel-perfect UI: Cmd+K → paste prompt from design/PENCIL-BRIEF.md section 3.\nSource code: components/crm.tsx (1368 lines, 17 exported pages)."
    },
    {
      id: "sitemap",
      type: "frame",
      name: "CRM Sitemap — 20 Screens",
      x: 640,
      y: 0,
      width: 900,
      height: 1100,
      fill: "$bg-panel",
      layout: "vertical",
      children: SCREENS.map((s, i) => ({
        id: `map-${s.id}`,
        type: "text",
        content: `${i + 1}. ${s.name} (${s.route}) — ${[...(s.kpis || []), ...(s.tables || []), ...(s.charts || [])].slice(0, 4).join(", ")}`,
        fill: "$text-secondary",
        fontSize: 12
      }))
    },
    {
      id: "import-prompt",
      type: "prompt",
      name: "FULL IMPORT PROMPT — Cmd+K",
      x: 1600,
      y: 0,
      width: 560,
      height: 500,
      fill: "$bg-elevated",
      content: "Import the COMPLETE Settlements CRM from this workspace.\n\nMUST READ ENTIRE FILE: components/crm.tsx (all 17 exported page functions).\nAlso: components/layout/sidebar.tsx, components/tickets/ticket-review.tsx, components/payments/tomorrow-payments.tsx, components/dashboard/kpi-card.tsx, components/ui/*.\n\nRecreate ALL 20 screens already wireframed in this .pen file with full visual fidelity:\nDashboard, Finance (5 pages), Settlement (8 pages), Sales, Retention, Settings, NSF Tickets, CS/BO Tickets, Pagos Mañana.\n\nUse dark theme variables. Improve clarity: section grouping, labels, mobile nav drawer."
    },
    {
      id: "components-lib",
      type: "frame",
      name: "Shared Components",
      x: 0,
      y: 220,
      width: 580,
      height: 900,
      fill: "$bg-panel",
      layout: "vertical",
      children: [
        { id: "comp-kpi", type: "frame", name: "KpiCard", reusable: true, width: 220, height: 110, fill: "$bg-card", cornerRadius: 10, children: [
          { id: "comp-kpi-title", type: "text", content: "KPI TITLE", fill: "$text-muted", fontSize: 10 },
          { id: "comp-kpi-value", type: "text", content: "$12,450", fill: "$text-primary", fontSize: 32, fontWeight: "700" },
          { id: "comp-kpi-badge", type: "text", content: "positive", fill: "$positive", fontSize: 10 }
        ]},
        { id: "comp-header", type: "frame", name: "Page Header", reusable: true, width: 400, height: 80, children: [
          { id: "comp-header-eyebrow", type: "text", content: "SETTLEMENTS CRM", fill: "$text-muted", fontSize: 11 },
          { id: "comp-header-title", type: "text", content: "Page Title", fill: "$text-primary", fontSize: 28, fontWeight: "700" }
        ]},
        { id: "comp-sidebar-ref", type: "ref", ref: "comp-kpi", x: 0, y: 200 }
      ]
    },
    ...screenFrames
  ]
};

writeFileSync("design/settlements-crm.pen", JSON.stringify(doc, null, 2));
console.log(`Generated design/settlements-crm.pen with ${SCREENS.length} screens`);
