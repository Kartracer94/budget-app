"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { loadTransactions } from "@/lib/store";
import { Transaction, getDashboardBucket } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { buttonVariants } from "@/components/ui/button";

const CategoryPieChart = dynamic(
  () => import("@/components/charts").then((mod) => mod.CategoryPieChart),
  { ssr: false }
);

const MonthlyBarChart = dynamic(
  () => import("@/components/charts").then((mod) => mod.MonthlyBarChart),
  { ssr: false }
);

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
    months.add(t.date.slice(0, 7));
  }
  return Array.from(months).sort().reverse();
}

function formatMonth(ym: string): string {
  const [year, month] = ym.split("-");
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function formatMonthShort(ym: string): string {
  const [year, month] = ym.split("-");
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function getMonthlyTotals(transactions: Transaction[]) {
  const months: Record<string, { inflow: number; outflow: number }> = {};
  for (const t of transactions) {
    const ym = t.date.slice(0, 7);
    if (!months[ym]) months[ym] = { inflow: 0, outflow: 0 };
    if (t.direction === "inflow") {
      months[ym].inflow += t.amount;
    } else {
      months[ym].outflow += t.amount;
    }
  }
  return Object.entries(months)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, totals]) => ({
      month: formatMonthShort(month),
      Inflow: Math.round(totals.inflow * 100) / 100,
      Outflow: Math.round(totals.outflow * 100) / 100,
    }));
}

function ImportBanner() {
  const searchParams = useSearchParams();
  const imported = searchParams.get("imported");
  if (!imported) return null;
  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
      Successfully imported {imported} transactions.
    </div>
  );
}

function DashboardContent() {
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [mounted, setMounted] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState("all");

  useEffect(() => {
    setAllTransactions(loadTransactions());
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const availableMonths = getAvailableMonths(allTransactions);

  const transactions =
    selectedMonth === "all"
      ? allTransactions
      : allTransactions.filter((t) => t.date.startsWith(selectedMonth));

  const totalInflow = transactions
    .filter((t) => t.direction === "inflow")
    .reduce((sum, t) => sum + t.amount, 0);

  const totalOutflow = transactions
    .filter((t) => t.direction === "outflow")
    .reduce((sum, t) => sum + t.amount, 0);

  const netCashFlow = totalInflow - totalOutflow;

  const inflowCategories = groupByCategory(transactions, "inflow");
  const outflowCategories = groupByCategory(transactions, "outflow");
  const monthlyData = getMonthlyTotals(allTransactions);
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
      <Suspense>
        <ImportBanner />
      </Suspense>

      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cash flow overview across all accounts
          </p>
        </div>

        <select
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="all">All Time</option>
          {availableMonths.map((m) => (
            <option key={m} value={m}>
              {formatMonth(m)}
            </option>
          ))}
        </select>
      </div>

      {/* Monthly Bar Chart */}
      <MonthlyBarChart data={monthlyData} />

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
                      {t.source === "bank" ? "Bank" : t.source === "stock_rewards" ? "RSU" : "CC"}
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
  return <DashboardContent />;
}
