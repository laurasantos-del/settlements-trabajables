"use client";

import { SEGMENTS } from "@/lib/metrics/retention-metrics";
import type { LifecycleClient } from "@/lib/types";

function unique(rows: LifecycleClient[], key: string) {
  return Array.from(new Set(rows.map((row) => String(row[key] ?? "").trim()).filter(Boolean))).sort();
}

export function FiltersBar({
  rows,
  filters,
  setFilters
}: {
  rows: LifecycleClient[];
  filters: Record<string, string>;
  setFilters: (filters: Record<string, string>) => void;
}) {
  const options = {
    salesRep: unique(rows, "Sales Rep"),
    program: unique(rows, "Program"),
    state: unique(rows, "State"),
    year: unique(rows, "Enrollment Date").map((date) => date.slice(0, 4)).filter((value, index, all) => all.indexOf(value) === index)
  };

  function update(key: string, value: string) {
    setFilters({ ...filters, [key]: value });
  }

  return (
    <section className="card-pad">
      <div className="grid gap-3 md:grid-cols-5">
        <select className="input-dark" value={filters.segment ?? ""} onChange={(event) => update("segment", event.target.value)}>
          <option value="">All segments</option>
          {Object.entries(SEGMENTS).map(([key, segment]) => <option key={key} value={key}>{segment.label}</option>)}
        </select>
        <select className="input-dark" value={filters.salesRep ?? ""} onChange={(event) => update("salesRep", event.target.value)}>
          <option value="">All sales reps</option>
          {options.salesRep.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select className="input-dark" value={filters.program ?? ""} onChange={(event) => update("program", event.target.value)}>
          <option value="">All programs</option>
          {options.program.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select className="input-dark" value={filters.state ?? ""} onChange={(event) => update("state", event.target.value)}>
          <option value="">All states</option>
          {options.state.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select className="input-dark" value={filters.year ?? ""} onChange={(event) => update("year", event.target.value)}>
          <option value="">All years</option>
          {options.year.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </div>
    </section>
  );
}
