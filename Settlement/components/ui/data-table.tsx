"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { RawRecord } from "@/lib/types";
import { exportCsv } from "@/lib/export-csv";

type Column = {
  key: string;
  label: string;
  render?: (row: RawRecord) => ReactNode;
};

export function DataTable({ rows, columns, title, subtitle, pageSize = 15 }: { rows: RawRecord[]; columns: Column[]; title?: string; subtitle?: string; pageSize?: number }) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState(columns[0]?.key ?? "");
  const [page, setPage] = useState(1);
  const filtered = useMemo(() => {
    const normalized = query.toLowerCase();
    return rows
      .filter((row) => Object.values(row).join(" ").toLowerCase().includes(normalized))
      .sort((a, b) => String(a[sortKey] ?? "").localeCompare(String(b[sortKey] ?? "")));
  }, [rows, query, sortKey]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
        <div>
          <h2 className="font-semibold text-white">{title ?? "Data"}</h2>
          {subtitle ? <p className="mt-1 text-xs text-muted">{subtitle}</p> : null}
          <p className="text-xs text-muted">{filtered.length} records</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent" placeholder="Search..." value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} />
          <button className="rounded-lg border border-border px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-900" onClick={() => exportCsv(`${title ?? "export"}.csv`, filtered)}>Export CSV</button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="soft-table">
          <thead>
            <tr>{columns.map((column) => <th key={column.key} className="cursor-pointer" onClick={() => setSortKey(column.key)}>{column.label}</th>)}</tr>
          </thead>
          <tbody>
            {visible.length ? visible.map((row, index) => (
              <tr key={index}>{columns.map((column) => <td key={column.key}>{column.render ? column.render(row) : String(row[column.key] ?? "-")}</td>)}</tr>
            )) : (
              <tr><td colSpan={columns.length} className="py-10 text-center text-muted">No data available</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-end gap-3 border-t border-border p-4 text-sm text-muted">
        <button className="rounded-lg border border-border px-3 py-1 disabled:opacity-40" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
        <span>Page {page} of {totalPages}</span>
        <button className="rounded-lg border border-border px-3 py-1 disabled:opacity-40" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</button>
      </div>
    </section>
  );
}
