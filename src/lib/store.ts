import { Transaction } from "./types";

const STORAGE_KEY = "budget_transactions";

export function loadTransactions(): Transaction[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Transaction[];
  } catch {
    return [];
  }
}

export function saveTransactions(transactions: Transaction[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
}

export function addTransactions(newTxns: Transaction[]): Transaction[] {
  const existing = loadTransactions();
  // Deduplicate by date + description + amount + direction
  const keys = new Set(
    existing.map((t) => `${t.date}|${t.description}|${t.amount}|${t.direction}`)
  );
  const unique = newTxns.filter(
    (t) => !keys.has(`${t.date}|${t.description}|${t.amount}|${t.direction}`)
  );
  const combined = [...existing, ...unique].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  saveTransactions(combined);
  return combined;
}

export function clearTransactions(): void {
  localStorage.removeItem(STORAGE_KEY);
}
