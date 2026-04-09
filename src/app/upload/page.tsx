"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { parseCSV } from "@/lib/parsers";
import { extractPDFText, isSchwabStockPDF, parseSchwabStockPDF } from "@/lib/pdf-parser";
import { addTransactions } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Transaction } from "@/lib/types";

const SOURCE_LABELS: Record<string, string> = {
  bank: "Bank",
  credit_card: "Credit Card",
  stock_rewards: "Stock Rewards",
};

export default function UploadPage() {
  const router = useRouter();
  const [dragOver, setDragOver] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState<
    { fileName: string; count: number; source: string; errors: string[]; transactions: Transaction[] }[]
  >([]);

  const addResult = useCallback(
    (fileName: string, source: string, transactions: Transaction[], errors: string[]) => {
      setResults((prev) => [
        ...prev,
        { fileName, count: transactions.length, source, errors, transactions },
      ]);
    },
    []
  );

  const processFile = useCallback(
    async (file: File) => {
      const name = file.name.toLowerCase();

      if (name.endsWith(".pdf")) {
        setProcessing(true);
        try {
          const text = await extractPDFText(file);
          if (isSchwabStockPDF(text)) {
            const result = parseSchwabStockPDF(text);
            addResult(file.name, result.source, result.transactions, result.errors);
          } else {
            addResult(file.name, "unknown", [], [
              "PDF does not appear to be a Schwab Restricted Stock Activity statement.",
            ]);
          }
        } catch (err) {
          addResult(file.name, "unknown", [], [
            `Failed to parse PDF: ${err instanceof Error ? err.message : "unknown error"}`,
          ]);
        } finally {
          setProcessing(false);
        }
      } else {
        // CSV/TSV
        const reader = new FileReader();
        reader.onload = (e) => {
          const content = e.target?.result as string;
          const result = parseCSV(content);
          addResult(file.name, result.source, result.transactions, result.errors);
        };
        reader.readAsText(file);
      }
    },
    [addResult]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const files = Array.from(e.dataTransfer.files).filter(
        (f) =>
          f.name.toLowerCase().endsWith(".csv") ||
          f.name.toLowerCase().endsWith(".tsv") ||
          f.name.toLowerCase().endsWith(".txt") ||
          f.name.toLowerCase().endsWith(".pdf")
      );
      files.forEach(processFile);
    },
    [processFile]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      files.forEach(processFile);
      e.target.value = "";
    },
    [processFile]
  );

  const handleImport = () => {
    const allTxns = results.flatMap((r) => r.transactions);
    const combined = addTransactions(allTxns);
    router.push(`/?imported=${allTxns.length}&total=${combined.length}`);
  };

  const totalTransactions = results.reduce((sum, r) => sum + r.count, 0);
  const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Upload Statements</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Drop your bank/credit card CSVs or Schwab stock reward PDFs here.
        </p>
      </div>

      <Card
        className={`border-2 border-dashed transition-colors cursor-pointer ${
          dragOver ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => document.getElementById("file-input")?.click()}
      >
        <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="text-4xl">&#128196;</div>
          <p className="text-sm font-medium">
            {processing ? "Processing PDF..." : "Drag & drop files here, or click to browse"}
          </p>
          <p className="text-xs text-muted-foreground">
            CSV/TSV (bank &amp; credit card) and PDF (Schwab stock rewards)
          </p>
          <input
            id="file-input"
            type="file"
            accept=".csv,.tsv,.txt,.pdf"
            multiple
            className="hidden"
            onChange={handleFileInput}
          />
        </CardContent>
      </Card>

      {results.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">Parsed Files</h2>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">
                {totalTransactions} transactions ready
              </span>
              <Button onClick={handleImport} disabled={totalTransactions === 0}>
                Import All
              </Button>
            </div>
          </div>

          {results.map((r, i) => (
            <Card key={i}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium font-mono">
                    {r.fileName}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">
                      {SOURCE_LABELS[r.source] || r.source}
                    </Badge>
                    <Badge variant="outline">{r.count} transactions</Badge>
                  </div>
                </div>
              </CardHeader>
              {/* Show stock reward details */}
              {r.source === "stock_rewards" && r.transactions.length > 0 && (
                <CardContent className="pt-0 pb-3">
                  <div className="text-xs space-y-1 text-muted-foreground">
                    {r.transactions
                      .filter((t) => t.direction === "inflow")
                      .map((t) => (
                        <div key={t.id} className="flex justify-between">
                          <span>
                            {t.awardId} — {t.sharesVested} shares vested, {t.netShares} net
                          </span>
                          <span className="font-mono text-emerald-400">
                            ${t.amount.toFixed(2)}
                          </span>
                        </div>
                      ))}
                    {r.transactions
                      .filter((t) => t.direction === "outflow")
                      .map((t) => (
                        <div key={t.id} className="flex justify-between">
                          <span>Tax withheld</span>
                          <span className="font-mono text-red-400">
                            -${t.amount.toFixed(2)}
                          </span>
                        </div>
                      ))}
                  </div>
                </CardContent>
              )}
              {r.errors.length > 0 && (
                <CardContent className="pt-0">
                  <div className="text-xs text-destructive space-y-1">
                    {r.errors.map((err, j) => (
                      <p key={j}>{err}</p>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          ))}

          {totalErrors > 0 && (
            <p className="text-xs text-muted-foreground">
              {totalErrors} row(s) had parsing errors and were skipped.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
