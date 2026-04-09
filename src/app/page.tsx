"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { loadTransactions } from "@/lib/store";
import { Transaction } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { buttonVariants } from "@/components/ui/button";

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
    groups[t.category] = (groups[t.category] || 0) + t.amount;
  }
  return Object.entries(groups)
    .sort((a, b) => b[1] - a[1])
    .map(([category, total]) => ({ category, total }));
}

function DashboardContent() {
  const searchParams = useSearchParams();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [mounted, setMounted] = useState(false);

  const imported = searchParams.get("imported");

  useEffect(() => {
    setTransactions(loadTransactions());
    setMounted(true);
  }, []);

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

  if (transactions.length === 0) {
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

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Cash flow overview across all accounts
        </p>
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

      {/* Category Breakdowns */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Inflows by Category
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {inflowCategories.map(({ category, total }) => (
              <div key={category} className="flex items-center justify-between">
                <span className="text-sm">{category}</span>
                <span className="text-sm font-mono text-emerald-400">
                  {formatCurrency(total)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Outflows by Category
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {outflowCategories.map(({ category, total }) => (
              <div key={category} className="flex items-center justify-between">
                <span className="text-sm">{category}</span>
                <span className="text-sm font-mono text-red-400">
                  {formatCurrency(total)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
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
