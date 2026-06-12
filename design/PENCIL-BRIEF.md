# Settlements CRM → Pencil.dev

This folder prepares the project for [Pencil.dev](https://pencil.dev) so you can redesign the UI for clarity and easier understanding.

## 1. Install Pencil in Cursor

1. Open **Extensions** (`Cmd+Shift+X`)
2. Search **Pencil**
3. Click **Install**
4. Complete activation (email)
5. Verify: **Settings → Tools & MCP** → Pencil appears

Optional CLI (terminal batch runs):

```bash
npm install -g @pencil.dev/cli
pencil login
```

## 2. Open the design file

1. Open `design/settlements-crm.pen` in Cursor
2. Confirm the **Pencil icon** appears in the editor toolbar
3. **Zoom to fit** — the canvas has 20 screens in a grid starting at Y≈1200:
   - Use **View → Zoom to Fit** (or pinch/scroll out) — you won't see everything at 100% zoom
   - Scroll **right** for more columns, **down** for more rows
   - Top-left **yellow note** explains the layout; **sitemap frame** lists all 20 screens

To regenerate the wireframe map after code changes:

```bash
node design/generate-pen.mjs
```

## 3. Send the project to Pencil (recommended prompt)

With `design/settlements-crm.pen` open:

1. In Pencil, use **Set Repository** (or ensure this workspace root is linked) so Pencil can read `components/crm.tsx`
2. Press **Cmd+K** and paste:

```
Import the COMPLETE Settlements CRM into this .pen file.

CRITICAL: Read the ENTIRE components/crm.tsx file (1368 lines). It exports 17 page components:
DashboardPage, FinanceOverviewPage, ClientDepositsPage, CreditorPaymentsOverviewPage, RevenuePage, AlertsPage, SettlementOverviewPage, CreditorStatusPage, MonthlySettlementsPage, FuturesPage, NegotiablesPage, NotPossiblePage, BrokenSettlementPage, SettlementPlanPage, SalesPage, RetentionPage, SettingsPage.

Also read:
- components/layout/sidebar.tsx
- components/tickets/ticket-review.tsx (NSF + CS/BO)
- components/payments/tomorrow-payments.tsx
- components/dashboard/kpi-card.tsx
- components/ui/data-table.tsx, charts.tsx, badge.tsx, date-range-picker.tsx

Replace ALL 20 wireframe screens in this .pen file with pixel-accurate designs (see sitemap frame).

Design goals:
- Dark theme using variables in this .pen file
- Group KPIs: Operations | Risk | Settlements
- Section titles + descriptions
- Scannable tables with status pills
- Mobile sidebar drawer
- 8px spacing grid

Stack: Next.js 14, Tailwind CSS.
```

## 4. CLI batch (after `pencil login`)

From the project root:

```bash
pencil --workspace . --tasks design/pencil-tasks.json
```

## 5. Sync design back to code

After you approve the Pencil designs:

```
Update components/crm.tsx and components/layout/sidebar.tsx to match the Pencil designs.
Keep all existing API calls and business logic from lib/api.ts.
Only change layout, typography, spacing, and visual hierarchy.
```

## Screen map (current app)

| Module | Route | Component |
|--------|-------|-----------|
| Dashboard | `/` | `DashboardPage` |
| Finance | `/finance/*` | `FinancePage`, deposits, creditor payments |
| Settlement | `/settlement/*` | Overview, creditor status, monthly, futures, negociables, broken |
| Tickets | `/tickets/nsf`, `/tickets/csbo` | `TicketReview` |
| Payments | `/payments/tomorrow` | `TomorrowPayments` |
| Retention | `/retention/*` | `RetentionPage` |
| Sales | `/sales/*` | `SalesPage` (demo data) |

## Design tokens (from code)

| Token | Value | Usage |
|-------|-------|-------|
| App background | `#0f0f0f` | `body` |
| Panel | `#141414` | Sidebar, cards |
| Border | `#1f1f1f` | Card borders |
| Text | `#e5e5e5` / `#a0a0a0` | Primary / secondary |
| Accent | `#f97316` | Active nav, CTAs |
