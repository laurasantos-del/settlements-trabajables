"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { RecordRow } from "@/lib/api";

export type Column = {
  key: string;
  label: string;
  render?: (row: RecordRow) => ReactNode;
};

export function DataTable({ title, subtitle, rows, columns, pageSize = 15 }: { title: string; subtitle?: string; rows: RecordRow[]; columns: Column[]; pageSize?: number }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return rows.filter((row) => Object.values(row).join(" ").toLowerCase().includes(q));
  }, [rows, query]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <section className="overflow-hidden rounded-[10px] border border-[#1f1f1f] bg-[#141414]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1f1f1f] p-4">
        <div>
          <h2 className="font-semibold text-white">{title}</h2>
          {subtitle ? <p className="mt-1 text-xs text-[#666]">{subtitle}</p> : null}
          <p className="text-xs text-[#666]">{filtered.length} records</p>
        </div>
        <input className="rounded-md border border-[#1f1f1f] bg-[#0f0f0f] px-3 py-2 text-sm text-neutral-200 outline-none" placeholder="Search..." value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr>{columns.map((c) => <th key={c.key} className="border-b border-[#1f1f1f] px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[#666]">{c.label}</th>)}</tr>
          </thead>
          <tbody>
            {visible.length ? visible.map((row, i) => (
              <tr key={i} className="hover:bg-[#1a1a1a]">
                {columns.map((c) => <td key={c.key} className="border-b border-[#1a1a1a] px-3 py-3 align-top text-[#d4d4d4]">{c.render ? c.render(row) : String(row[c.key] ?? "-")}</td>)}
              </tr>
            )) : <tr><td className="px-3 py-10 text-center text-[#666]" colSpan={columns.length}>No data available</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end gap-3 border-t border-[#1f1f1f] p-4 text-sm text-[#666]">
        <button disabled={page <= 1} className="rounded-md border border-[#1f1f1f] px-3 py-1 disabled:opacity-40" onClick={() => setPage(page - 1)}>Previous</button>
        <span>Page {page} of {pages}</span>
        <button disabled={page >= pages} className="rounded-md border border-[#1f1f1f] px-3 py-1 disabled:opacity-40" onClick={() => setPage(page + 1)}>Next</button>
      </div>
    </section>
  );
}
