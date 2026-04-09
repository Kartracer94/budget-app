import { Transaction, ImportResult, categorize } from "./types";

let idCounter = 0;
function generateId(): string {
  return `txn_${Date.now()}_${idCounter++}`;
}

function parseAmount(raw: string): number {
  return parseFloat(raw.replace(/[$,]/g, "")) || 0;
}

function parseDate(raw: string): string {
  // Handles MM/DD/YYYY format
  const parts = raw.trim().split("/");
  if (parts.length === 3) {
    const [month, day, year] = parts;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  return raw.trim();
}

function detectDelimiter(header: string): string {
  if (header.includes("\t")) return "\t";
  if (header.includes(",")) return ",";
  return "\t";
}

function splitRow(line: string, delimiter: string): string[] {
  if (delimiter === ",") {
    // Handle quoted CSV fields
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        fields.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    fields.push(current.trim());
    return fields;
  }
  return line.split(delimiter).map((f) => f.trim());
}

const BANK_HEADERS = ["date", "status", "type", "checknumber", "description", "withdrawal", "deposit", "runningbalance"];
const CREDIT_HEADERS = ["date", "description", "card member", "account #", "amount"];

export function detectSource(headerLine: string): "bank" | "credit_card" | null {
  const lower = headerLine.toLowerCase();
  if (lower.includes("withdrawal") && lower.includes("deposit") && lower.includes("runningbalance")) {
    return "bank";
  }
  if (lower.includes("card member") && lower.includes("account #")) {
    return "credit_card";
  }
  // Looser matching
  const delimiter = detectDelimiter(headerLine);
  const fields = splitRow(headerLine, delimiter).map((f) => f.toLowerCase().replace(/\s+/g, ""));
  if (fields.some((f) => f === "withdrawal") && fields.some((f) => f === "deposit")) {
    return "bank";
  }
  if (fields.some((f) => f === "cardmember") && fields.some((f) => f.includes("account"))) {
    return "credit_card";
  }
  return null;
}

function parseBankCSV(lines: string[], delimiter: string): ImportResult {
  const transactions: Transaction[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const fields = splitRow(line, delimiter);
    if (fields.length < 7) {
      errors.push(`Row ${i + 1}: expected at least 7 fields, got ${fields.length}`);
      continue;
    }

    const [dateStr, , , , description, withdrawalStr, depositStr, balanceStr] = fields;

    const withdrawal = parseAmount(withdrawalStr);
    const deposit = parseAmount(depositStr);

    if (withdrawal === 0 && deposit === 0) {
      errors.push(`Row ${i + 1}: no amount found`);
      continue;
    }

    const isInflow = deposit > 0;
    const amount = isInflow ? deposit : withdrawal;

    transactions.push({
      id: generateId(),
      date: parseDate(dateStr),
      description: description.trim(),
      amount,
      direction: isInflow ? "inflow" : "outflow",
      source: "bank",
      category: categorize(description),
      runningBalance: parseAmount(balanceStr) || undefined,
    });
  }

  return { source: "bank", transactions, errors };
}

function parseCreditCardCSV(lines: string[], delimiter: string): ImportResult {
  const transactions: Transaction[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const fields = splitRow(line, delimiter);
    if (fields.length < 5) {
      errors.push(`Row ${i + 1}: expected at least 5 fields, got ${fields.length}`);
      continue;
    }

    const [dateStr, description, cardMember, accountNum, amountStr] = fields;
    const rawAmount = parseAmount(amountStr);

    // Amex: negative = payments/credits, positive = charges
    // From a cash flow perspective:
    // - Charges (positive) are outflows (you spent money)
    // - Payments (negative) are just transfers (already captured in bank statement)
    const isPayment = rawAmount < 0;
    const amount = Math.abs(rawAmount);

    transactions.push({
      id: generateId(),
      date: parseDate(dateStr),
      description: description.trim(),
      amount,
      direction: isPayment ? "inflow" : "outflow",
      source: "credit_card",
      category: categorize(description),
      cardMember: cardMember.trim(),
      accountNumber: accountNum.trim(),
    });
  }

  return { source: "credit_card", transactions, errors };
}

export function parseCSV(content: string): ImportResult {
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    return { source: "bank", transactions: [], errors: ["File is empty or has no data rows"] };
  }

  const headerLine = lines[0];
  const delimiter = detectDelimiter(headerLine);
  const source = detectSource(headerLine);

  if (!source) {
    return {
      source: "bank",
      transactions: [],
      errors: [
        "Could not detect file format. Expected bank statement (Date/Status/Type/CheckNumber/Description/Withdrawal/Deposit/RunningBalance) or credit card statement (Date/Description/Card Member/Account #/Amount).",
      ],
    };
  }

  if (source === "bank") {
    return parseBankCSV(lines, delimiter);
  }
  return parseCreditCardCSV(lines, delimiter);
}
