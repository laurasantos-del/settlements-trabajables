"use client";

import { useReports } from "@/lib/data-store";
import Link from "next/link";

export function Header() {
  const { lastLoaded, hasRealData, loading, error, reload } = useReports();
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background/85 px-4 py-4 backdrop-blur lg:ml-64 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs text-muted">{new Date().toLocaleDateString("es-ES", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
          <p className="text-sm text-neutral-300">{loading ? "Cargando datos desde FastAPI..." : hasRealData ? `Last load: ${lastLoaded || "just now"}` : "Sin datos reales cargados"}</p>
        </div>
        <nav className="flex flex-wrap gap-2 text-sm lg:hidden">
          <Link className="rounded-lg border border-border px-3 py-2 text-neutral-200" href="/">Dashboard</Link>
          <Link className="rounded-lg border border-border px-3 py-2 text-neutral-200" href="/finance">Finance</Link>
          <Link className="rounded-lg border border-border px-3 py-2 text-neutral-200" href="/settlements">Settlement</Link>
          <Link className="rounded-lg border border-border px-3 py-2 text-neutral-200" href="/retention">Retención</Link>
          <Link className="rounded-lg border border-border px-3 py-2 text-neutral-200" href="/sales">Sales</Link>
        </nav>
        <button className="rounded-lg border border-border px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-900" onClick={reload}>Reintentar</button>
      </div>
      {error ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-yellow-700 bg-yellow-950/40 p-3 text-sm text-yellow-100">
          <span>{error}</span>
          <button className="rounded-lg border border-yellow-700 px-3 py-1 text-yellow-50" onClick={reload}>Reintentar</button>
        </div>
      ) : null}
    </header>
  );
}
