"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import type { PieLabelRenderProps } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const CHART_COLORS = [
  "#34d399", "#60a5fa", "#f472b6", "#facc15", "#a78bfa",
  "#fb923c", "#2dd4bf", "#e879f9", "#818cf8", "#f87171",
  "#4ade80", "#38bdf8", "#c084fc", "#fbbf24", "#f43f5e",
];

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function renderCustomLabel(props: PieLabelRenderProps) {
  const cx = props.cx as number;
  const cy = props.cy as number;
  const midAngle = props.midAngle as number;
  const innerRadius = props.innerRadius as number;
  const outerRadius = props.outerRadius as number;
  const percent = props.percent as number;
  if (percent < 0.05) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={500}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

interface PieTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number }>;
}

function PieChartTooltip({ active, payload }: PieTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-md">
      <p className="font-medium">{payload[0].name}</p>
      <p className="font-mono text-muted-foreground">{formatCurrency(payload[0].value)}</p>
    </div>
  );
}

interface BarTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}

function BarChartTooltip({ active, payload, label }: BarTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-md">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} className="font-mono" style={{ color: entry.color }}>
          {entry.name}: {formatCurrency(entry.value)}
        </p>
      ))}
    </div>
  );
}

export function CategoryPieChart({
  data,
  title,
  emptyMessage,
}: {
  data: { name: string; value: number }[];
  title: string;
  emptyMessage: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">{emptyMessage}</p>
        ) : (
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  dataKey="value"
                  labelLine={false}
                  label={renderCustomLabel}
                >
                  {data.map((_, index) => (
                    <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<PieChartTooltip />} />
                <Legend
                  formatter={(value: string) => (
                    <span className="text-xs text-foreground">{value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
        {data.length > 0 && (
          <div className="mt-4 space-y-2">
            {data.map(({ name, value }, i) => (
              <div key={name} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div
                    className="h-3 w-3 rounded-sm shrink-0"
                    style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                  />
                  <span>{name}</span>
                </div>
                <span className="font-mono text-muted-foreground">{formatCurrency(value)}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function MonthlyBarChart({
  data,
}: {
  data: { month: string; Inflow: number; Outflow: number }[];
}) {
  if (data.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Monthly Inflows vs Outflows</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 20%)" />
              <XAxis
                dataKey="month"
                tick={{ fill: "hsl(0 0% 64%)", fontSize: 12 }}
                axisLine={{ stroke: "hsl(0 0% 20%)" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "hsl(0 0% 64%)", fontSize: 12 }}
                axisLine={{ stroke: "hsl(0 0% 20%)" }}
                tickLine={false}
                tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip content={<BarChartTooltip />} />
              <Legend
                formatter={(value: string) => (
                  <span className="text-xs text-foreground">{value}</span>
                )}
              />
              <Bar dataKey="Inflow" fill="#34d399" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Outflow" fill="#f87171" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
