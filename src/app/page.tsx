"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { PieLabelRenderProps } from "recharts";
import { loadTransactions } from "@/lib/store";
import { Transaction, getDashboardBucket } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { buttonVariants } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

function groupByCategory(
  transactions: Transaction[],
  direction: "inflow" | "outflow"
) {
  const groups: Record<string, number> = {};
  for (const t of transactions) {
    if (t.direction !== direction) continue;
    const bucket = getDashboardBucket(t.category);
    groups[bucket] = (groups[bucket] || 0) + t.amount;
  }
  return Object.entries(groups)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value }));
}

function getAvailableMonths(transactions: Transaction[]): string[] {
  const months = new Set<string>();
  for (const t of transactions) {
    months.add(t.date.slice(0, 7)); // YYYY-MM
  }
  return Array.from(months).sort().reverse();
}

function formatMonth(ym: string): string {
  const [year, month] = ym.split("-");
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

interface PieTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number }>;
}

function CustomTooltip({ active, payload }: PieTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-md">
      <p className="font-medium">{payload[0].name}</p>
      <p className="font-mono text-muted-foreground">{formatCurrency(payload[0].value)}</p>
    </div>
  );
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

function CategoryPieChart({
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
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  formatter={(value: string) => (
                    <span className="text-xs text-foreground">{value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
        {/* Legend with amounts */}
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

function DashboardContent() {
  const searchParams = useSearchParams();
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [mounted, setMounted] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string>("all");

  const imported = searchParams.get("imported");

  useEffect(() => {
    const txns = loadTransactions();
    setAllTransactions(txns);
    setMounted(true);
  }, []);

  const availableMonths = useMemo(() => getAvailableMonths(allTransactions), [allTransactions]);

  const transactions = useMemo(() => {
    if (selectedMonth === "all") return allTransactions;
    return allTransactions.filter((t) => t.date.startsWith(selectedMonth));
  }, [allTransactions, selectedMonth]);

  if (!mounted) return null;

  const totalInflow = transactions
    .filter((t) => t.direction === "inflow")
    .reduce((sum, t) => sum + t.amount, 0);

  const totalOutflow = transactions
    .filter((t) => t.direction === "outflow")
    .reduce((sum, t) => sum + t.amount, 0);

  const netCashFlow = totalInflow - totalOutflow;

  const inflowCategories = groupByCategory(transactions, "inflow");
  const outflowCategories = groupByCategory(transactions, "outflow");

  const recentTransactions = transactions.slice(0, 10);

  if (allTransactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <p className="text-muted-foreground">No transactions yet.</p>
        <Link href="/upload" className={buttonVariants()}>
          Upload Statements
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {imported && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
          Successfully imported {imported} transactions.
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cash flow overview across all accounts
          </p>
        </div>

        {/* Month Filter */}
        <Tabs value={selectedMonth} onValueChange={setSelectedMonth}>
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="all" className="text-xs">All Time</TabsTrigger>
            {availableMonths.map((m) => (
              <TabsTrigger key={m} value={m} className="text-xs">
                {formatMonth(m)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Inflows
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold font-mono text-emerald-400">
              {formatCurrency(totalInflow)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Outflows
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold font-mono text-red-400">
              {formatCurrency(totalOutflow)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Net Cash Flow
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={`text-2xl font-semibold font-mono ${
                netCashFlow >= 0 ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {netCashFlow >= 0 ? "+" : ""}
              {formatCurrency(netCashFlow)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Pie Charts */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <CategoryPieChart
          data={inflowCategories}
          title="Inflows by Category"
          emptyMessage="No inflows for this period"
        />
        <CategoryPieChart
          data={outflowCategories}
          title="Outflows by Category"
          emptyMessage="No outflows for this period"
        />
      </div>

      <Separator />

      {/* Recent Transactions */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium">Recent Transactions</h2>
          <Link href="/transactions" className={buttonVariants({ variant: "outline", size: "sm" })}>
            View All
          </Link>
        </div>
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {recentTransactions.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between px-4 py-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Badge
                      variant={
                        t.direction === "inflow" ? "default" : "secondary"
                      }
                      className="shrink-0 text-xs"
                    >
                      {t.source === "bank" ? "Bank" : "CC"}
                    </Badge>
                    <div className="min-w-0">
                      <p className="text-sm truncate">{t.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.date} &middot; {t.category}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-sm font-mono shrink-0 ml-4 ${
                      t.direction === "inflow"
                        ? "text-emerald-400"
                        : "text-red-400"
                    }`}
                  >
                    {t.direction === "inflow" ? "+" : "-"}
                    {formatCurrency(t.amount)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense>
      <DashboardContent />
    </Suspense>
  );
}
