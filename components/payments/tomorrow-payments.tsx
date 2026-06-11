"use client";

import { useEffect, useState } from "react";
import { type TomorrowPayments, getTomorrowPayments } from "@/lib/api";

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export function TomorrowPaymentsView() {
  const [data, setData] = useState<TomorrowPayments | null>(null);

  useEffect(() => {
    getTomorrowPayments().then(setData);
  }, []);

  if (!data) return <div className="p-6 text-sm text-neutral-400">Loading…</div>;

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">
        Payments for tomorrow {data.date && `(${data.date})`}
      </h1>
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded border border-neutral-700 p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-green-400">Incoming — client deposits</h2>
            <span className="text-sm text-neutral-300">{money(data.incoming_total)}</span>
          </div>
          <PaymentTable rows={data.incoming} />
        </section>
        <section className="rounded border border-neutral-700 p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-amber-400">Outgoing — creditor payments</h2>
            <span className="text-sm text-neutral-300">{money(data.outgoing_total)}</span>
          </div>
          <PaymentTable rows={data.outgoing} showCreditor />
        </section>
      </div>
    </div>
  );
}

function PaymentTable({
  rows,
  showCreditor = false,
}: {
  rows: TomorrowPayments["incoming"];
  showCreditor?: boolean;
}) {
  if (rows.length === 0)
    return <p className="mt-4 text-sm text-neutral-500">No payments scheduled for tomorrow.</p>;
  return (
    <table className="mt-3 w-full text-left text-sm">
      <thead className="text-neutral-400">
        <tr>
          <th>Client</th>
          {showCreditor && <th>Creditor</th>}
          <th>Amount</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-t border-neutral-800">
            <td className="py-2">{r.name || r.client_id}</td>
            {showCreditor && <td className="py-2">{r.creditor}</td>}
            <td className="py-2">{money(r.amount)}</td>
            <td className="py-2">{r.status}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
