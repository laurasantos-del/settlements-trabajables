"use client";

import { Bar, BarChart, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function Donut({ data }: { data: { name: string; value: number; color?: string }[] }) {
  return (
    <div className="h-[280px]">
      <ResponsiveContainer>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={58} outerRadius={92} paddingAngle={2}>
            {data.map((d, i) => <Cell key={i} fill={d.color ?? ["#22c55e", "#f97316", "#3b82f6", "#ef4444", "#eab308", "#6b7280"][i % 6]} />)}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Bars({ data, horizontal = false }: { data: { name?: string; label?: string; value: number; color?: string }[]; horizontal?: boolean }) {
  const rows = data.map((d) => ({ name: d.name ?? d.label ?? "", value: d.value, color: d.color }));
  return (
    <div className="h-[300px]">
      <ResponsiveContainer>
        <BarChart data={rows} layout={horizontal ? "vertical" : "horizontal"} margin={{ left: horizontal ? 80 : 0, right: 12 }}>
          {horizontal ? <XAxis type="number" hide /> : <XAxis dataKey="name" tick={{ fill: "#666", fontSize: 11 }} />}
          {horizontal ? <YAxis type="category" dataKey="name" tick={{ fill: "#999", fontSize: 11 }} /> : <YAxis tick={{ fill: "#666", fontSize: 11 }} />}
          <Tooltip />
          <Bar dataKey="value" radius={[6, 6, 0, 0]}>
            {rows.map((d, i) => <Cell key={i} fill={d.color ?? "#f97316"} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DoubleBars({ data }: { data: { name: string; deposits: number; creditorPayments: number }[] }) {
  return (
    <div className="h-[300px]">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ right: 12 }}>
          <XAxis dataKey="name" tick={{ fill: "#666", fontSize: 11 }} />
          <YAxis tick={{ fill: "#666", fontSize: 11 }} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="deposits" fill="#3b82f6" name="Deposits" radius={[6, 6, 0, 0]} />
          <Bar dataKey="creditorPayments" fill="#f97316" name="Creditor Payments" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DonutChart({ data }: { data: { label?: string; name?: string; value: number; color?: string }[] }) {
  return <Donut data={data.map((d) => ({ name: d.name ?? d.label ?? "", value: d.value, color: d.color }))} />;
}

export function GroupedBars({ data }: { data: { label?: string; name?: string; deposits: number; creditorPayments: number }[] }) {
  return <DoubleBars data={data.map((d) => ({ name: d.name ?? d.label ?? "", deposits: d.deposits, creditorPayments: d.creditorPayments }))} />;
}
