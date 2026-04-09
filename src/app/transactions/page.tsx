"use client";

import { useEffect, useState, useMemo } from "react";
import { loadTransactions, clearTransactions, saveTransactions } from "@/lib/store";
import { Transaction } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [mounted, setMounted] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<"all" | "bank" | "credit_card">("all");
  const [directionFilter, setDirectionFilter] = useState<"all" | "inflow" | "outflow">("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    setTransactions(loadTransactions());
    setMounted(true);
  }, []);

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (sourceFilter !== "all" && t.source !== sourceFilter) return false;
      if (directionFilter !== "all" && t.direction !== directionFilter) return false;
      if (search && !t.description.toLowerCase().includes(search.toLowerCase()) && !t.category.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [transactions, sourceFilter, directionFilter, search]);

  const handleClear = () => {
    if (confirm("Clear all imported transactions? This cannot be undone.")) {
      clearTransactions();
      setTransactions([]);
    }
  };

  if (!mounted) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Transactions</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {transactions.length} total transactions
          </p>
        </div>
        {transactions.length > 0 && (
          <Button variant="destructive" size="sm" onClick={handleClear}>
            Clear All
          </Button>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap items-center gap-4">
            <input
              type="text"
              placeholder="Search descriptions..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring w-64"
            />
            <Tabs value={sourceFilter} onValueChange={(v) => setSourceFilter(v as typeof sourceFilter)}>
              <TabsList>
                <TabsTrigger value="all">All Sources</TabsTrigger>
                <TabsTrigger value="bank">Bank</TabsTrigger>
                <TabsTrigger value="credit_card">Credit Card</TabsTrigger>
              </TabsList>
            </Tabs>
            <Tabs value={directionFilter} onValueChange={(v) => setDirectionFilter(v as typeof directionFilter)}>
              <TabsList>
                <TabsTrigger value="all">All Flows</TabsTrigger>
                <TabsTrigger value="inflow">Inflows</TabsTrigger>
                <TabsTrigger value="outflow">Outflows</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardContent>
      </Card>

      {/* Transaction Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-[120px]">Category</TableHead>
                <TableHead className="w-[80px]">Source</TableHead>
                <TableHead className="w-[60px]">Flow</TableHead>
                <TableHead className="text-right w-[120px]">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No transactions found.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono text-xs">{t.date}</TableCell>
                    <TableCell className="text-sm">
                      {t.description}
                      {t.cardMember && (
                        <span className="text-xs text-muted-foreground ml-2">
                          ({t.cardMember})
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {t.category}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">
                        {t.source === "bank" ? "Bank" : "CC"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`text-xs font-medium ${
                          t.direction === "inflow"
                            ? "text-emerald-400"
                            : "text-red-400"
                        }`}
                      >
                        {t.direction === "inflow" ? "IN" : "OUT"}
                      </span>
                    </TableCell>
                    <TableCell
                      className={`text-right font-mono text-sm ${
                        t.direction === "inflow"
                          ? "text-emerald-400"
                          : "text-red-400"
                      }`}
                    >
                      {t.direction === "inflow" ? "+" : "-"}
                      {formatCurrency(t.amount)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {filtered.length > 0 && (
        <p className="text-xs text-muted-foreground text-right">
          Showing {filtered.length} of {transactions.length} transactions
        </p>
      )}
    </div>
  );
}
