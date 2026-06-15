"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type CreateResult,
  type ProposedTicket,
  type TicketKind,
  createTickets,
  getCreatedToday,
  getTicketPreview,
  refreshNsf,
  refreshStore,
} from "@/lib/api";

type Tab = "review" | "today";

export function TicketReview({ kind, title }: { kind: TicketKind; title: string }) {
  const [tab, setTab] = useState<Tab>("review");
  const [tickets, setTickets] = useState<ProposedTicket[]>([]);
  const [today, setToday] = useState<Record<string, unknown>[]>([]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [results, setResults] = useState<CreateResult[] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [preview, createdToday] = await Promise.all([
      getTicketPreview(kind),
      getCreatedToday(kind),
    ]);
    setTickets(preview);
    setToday(createdToday);
    setOffline(preview.length === 0 && createdToday.length === 0);
    // default-check every "new" ticket
    const next: Record<string, boolean> = {};
    preview.forEach((t) => {
      next[t.dedup_key] = t.status === "new";
    });
    setChecked(next);
    setLoading(false);
  }, [kind]);

  useEffect(() => {
    load();
  }, [load]);

  const update = (key: string, patch: Partial<ProposedTicket>) =>
    setTickets((prev) => prev.map((t) => (t.dedup_key === key ? { ...t, ...patch } : t)));

  const selected = useMemo(
    () => tickets.filter((t) => checked[t.dedup_key] && t.status === "new"),
    [tickets, checked]
  );

  const onRefresh = async () => {
    setBusy(true);
    await (kind === "nsf" ? refreshNsf() : refreshStore());
    // give the background job a moment, then reload
    setTimeout(() => {
      load();
      setBusy(false);
    }, 3000);
  };

  const onCreate = async () => {
    if (selected.length === 0) return;
    if (!window.confirm(`Create ${selected.length} ticket(s) in HubSpot?`)) return;
    setBusy(true);
    const res = await createTickets(kind, selected);
    setResults(res);
    setBusy(false);
    await load();
  };

  if (loading) return <div className="p-6 text-sm text-neutral-400">Loading…</div>;

  if (offline)
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mt-4 text-sm text-amber-400">
          Backend offline or no data yet. Start the backend and click Refresh.
        </p>
        <button onClick={onRefresh} className="mt-3 rounded bg-neutral-700 px-3 py-1 text-sm">
          Refresh
        </button>
      </div>
    );

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{title}</h1>
        <div className="flex gap-2">
          <button
            onClick={onRefresh}
            disabled={busy}
            className="rounded bg-neutral-700 px-3 py-1 text-sm disabled:opacity-50"
          >
            {busy ? "Working…" : "Refresh data"}
          </button>
        </div>
      </div>

      <div className="mt-4 flex gap-4 border-b border-neutral-700 text-sm">
        <button
          onClick={() => setTab("review")}
          className={tab === "review" ? "border-b-2 border-blue-400 pb-2" : "pb-2 text-neutral-400"}
        >
          To review ({tickets.filter((t) => t.status === "new").length})
        </button>
        <button
          onClick={() => setTab("today")}
          className={tab === "today" ? "border-b-2 border-blue-400 pb-2" : "pb-2 text-neutral-400"}
        >
          Created today ({today.length})
        </button>
      </div>

      {tab === "review" ? (
        <>
          <table className="mt-4 w-full text-left text-sm">
            <thead className="text-neutral-400">
              <tr>
                <th className="w-8"></th>
                <th>Client</th>
                <th>Subject</th>
                <th>Message</th>
                <th>Priority</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => {
                const already = t.status === "already_created";
                return (
                  <tr key={t.dedup_key} className="border-t border-neutral-800 align-top">
                    <td className="py-2">
                      <input
                        type="checkbox"
                        disabled={already}
                        checked={!!checked[t.dedup_key] && !already}
                        onChange={(e) =>
                          setChecked((c) => ({ ...c, [t.dedup_key]: e.target.checked }))
                        }
                      />
                    </td>
                    <td className="py-2">{t.client_id}</td>
                    <td className="py-2">
                      <input
                        className="w-48 bg-transparent outline-none focus:border-b focus:border-neutral-600"
                        value={t.subject}
                        disabled={already}
                        onChange={(e) => update(t.dedup_key, { subject: e.target.value })}
                      />
                    </td>
                    <td className="py-2">
                      <textarea
                        className="w-64 bg-transparent outline-none focus:border focus:border-neutral-700"
                        rows={2}
                        value={t.content}
                        disabled={already}
                        onChange={(e) => update(t.dedup_key, { content: e.target.value })}
                      />
                    </td>
                    <td className="py-2">
                      <select
                        className="bg-neutral-900"
                        value={t.priority}
                        disabled={already}
                        onChange={(e) => update(t.dedup_key, { priority: e.target.value })}
                      >
                        <option value="LOW">LOW</option>
                        <option value="MEDIUM">MEDIUM</option>
                        <option value="HIGH">HIGH</option>
                      </select>
                    </td>
                    <td className="py-2">
                      {already ? (
                        <span className="text-neutral-500">⚪ already created</span>
                      ) : (
                        <span className="text-green-400">🟢 new</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={onCreate}
              disabled={busy || selected.length === 0}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              Create selected ({selected.length})
            </button>
          </div>

          {results && (
            <div className="mt-4 rounded border border-neutral-700 p-3 text-sm">
              <div className="font-medium">Results</div>
              <ul className="mt-2 space-y-1">
                {results.map((r) => (
                  <li key={r.dedup_key}>
                    {r.result === "created" &&
                      `✅ ${r.dedup_key} → #${r.hubspot_id}${r.orphan ? " 🟠 (no contact)" : ""}`}
                    {r.result === "skipped" && `⏭️ ${r.dedup_key} — ${r.reason}`}
                    {r.result === "error" && `❌ ${r.dedup_key} — ${r.reason}`}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <table className="mt-4 w-full text-left text-sm">
          <thead className="text-neutral-400">
            <tr>
              <th>Client</th>
              <th>HubSpot ID</th>
              <th>Rule</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {today.map((r, i) => (
              <tr key={i} className="border-t border-neutral-800">
                <td className="py-2">{String(r.client_id)}</td>
                <td className="py-2">#{String(r.hubspot_id)}</td>
                <td className="py-2">{String(r.rule)}</td>
                <td className="py-2">{String(r.created_at).slice(11, 16)}</td>
              </tr>
            ))}
            {today.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 text-neutral-500">
                  Nothing created today yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
