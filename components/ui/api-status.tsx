"use client";

export function ApiStatus({ loading, error, retry }: { loading: boolean; error: string; retry: () => void }) {
  if (loading) return <div className="card-pad text-center text-muted">Cargando...</div>;
  if (!error) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-yellow-700 bg-yellow-950/40 p-4 text-sm text-yellow-100">
      <span>{error}</span>
      <button className="rounded-lg border border-yellow-700 px-3 py-1" onClick={retry}>Reintentar</button>
    </div>
  );
}
