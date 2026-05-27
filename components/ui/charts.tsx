"use client";

import { Bar, BarChart, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function DonutChart({ data }: { data: { label: string; value: number; color?: string }[] }) {
  return (
    <div className="h-[260px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="label" innerRadius={55} outerRadius={90} paddingAngle={2}>
            {data.map((item, index) => <Cell key={index} fill={item.color ?? ["#22c55e", "#f97316", "#3b82f6", "#ef4444", "#6b7280"][index % 5]} />)}
          </Pie>
          <Tooltip formatter={(value: number, name: string) => [value, name]} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Bars({ data, horizontal = false }: { data: { label: string; value: number; color?: string }[]; horizontal?: boolean }) {
  return (
    <div className="h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ left: horizontal ? 80 : 0, right: 12 }}>
          {horizontal ? <XAxis type="number" hide /> : <XAxis dataKey="label" tick={{ fill: "#666", fontSize: 11 }} />}
          {horizontal ? <YAxis type="category" dataKey="label" tick={{ fill: "#999", fontSize: 11 }} /> : <YAxis tick={{ fill: "#666", fontSize: 11 }} />}
          <Tooltip />
          <Bar dataKey="value" radius={[6, 6, 0, 0]}>
            {data.map((item, index) => <Cell key={index} fill={item.color ?? "#f97316"} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function GroupedBars({ data }: { data: { label: string; deposits: number; creditorPayments: number }[] }) {
  return (
    <div className="h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: 0, right: 12 }}>
          <XAxis dataKey="label" tick={{ fill: "#666", fontSize: 11 }} />
          <YAxis tick={{ fill: "#666", fontSize: 11 }} />
          <Tooltip />
          <Legend wrapperStyle={{ color: "#999", fontSize: 12 }} />
          <Bar dataKey="deposits" name="Deposits" fill="#3b82f6" radius={[6, 6, 0, 0]} />
          <Bar dataKey="creditorPayments" name="Creditor Payments" fill="#f97316" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
