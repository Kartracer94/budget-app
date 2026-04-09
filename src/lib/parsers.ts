import { Transaction, ImportResult, categorize, isTransferCategory } from "./types";

let idCounter = 0;
function generateId(): string {
  return `txn_${Date.now()}_${idCounter++}`;
}

function parseAmount(raw: string): number {
  return parseFloat(raw.replace(/[$,]/g, "")) || 0;
}

function parseDate(raw: string): string {
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

/**
 * Split a row by delimiter, respecting quoted fields.
 * Handles both comma and tab delimiters with quoted multi-line content.
 */
function splitRow(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current.trim());
  return fields;
}

/**
 * Reassemble multi-line quoted fields that were split by newlines.
 * Returns logical rows where each row is a complete record.
 */
function reassembleQuotedRows(rawLines: string[], delimiter: string): string[] {
  const rows: string[] = [];
  let current = "";
  let openQuotes = false;

  for (const line of rawLines) {
    if (!openQuotes) {
      current = line;
    } else {
      // Continue the previous row — this line is inside a quoted field
      current += "\n" + line;
    }

    // Count unescaped quotes to determine if we're inside a quoted field
    let quotes = 0;
    for (const char of current) {
      if (char === '"') quotes++;
    }
    openQuotes = quotes % 2 !== 0;

    if (!openQuotes) {
      rows.push(current);
      current = "";
    }
  }

  // Push any remaining content
  if (current.trim()) {
    rows.push(current);
  }

  return rows;
}

export function detectSource(headerLine: string): "bank" | "credit_card" | null {
  const lower = headerLine.toLowerCase();
  if (lower.includes("withdrawal") && lower.includes("deposit")) {
    return "bank";
  }
  if (lower.includes("card member") && lower.includes("account")) {
    return "credit_card";
  }
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

    const isDeposit = deposit > 0;
    const amount = isDeposit ? deposit : withdrawal;
    const category = categorize(description);

    const direction: "inflow" | "outflow" =
      isDeposit && !isTransferCategory(category) ? "inflow" : "outflow";

    transactions.push({
      id: generateId(),
      date: parseDate(dateStr),
      description: description.trim(),
      amount,
      direction,
      source: "bank",
      category,
      runningBalance: parseAmount(balanceStr) || undefined,
    });
  }

  return { source: "bank", transactions, errors };
}

function parseCreditCardCSV(lines: string[], delimiter: string, headerFields: string[]): ImportResult {
  const transactions: Transaction[] = [];
  const errors: string[] = [];

  // Find column indices by header name (handles both 5-col and 13-col Amex exports)
  const colIndex = (name: string) => {
    const lower = name.toLowerCase();
    return headerFields.findIndex((h) => h.toLowerCase().includes(lower));
  };

  const dateIdx = colIndex("date");
  const descIdx = colIndex("description");
  const memberIdx = colIndex("card member");
  const accountIdx = colIndex("account");
  const amountIdx = colIndex("amount");
  const categoryIdx = colIndex("category");

  if (dateIdx < 0 || descIdx < 0 || amountIdx < 0) {
    return {
      source: "credit_card",
      transactions: [],
      errors: ["Could not locate required columns (Date, Description, Amount) in header."],
    };
  }

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const fields = splitRow(line, delimiter);

    // Need at least enough fields to reach the Amount column
    const minFields = amountIdx + 1;
    if (fields.length < minFields) {
      errors.push(`Row ${i + 1}: expected at least ${minFields} fields, got ${fields.length}`);
      continue;
    }

    const dateStr = fields[dateIdx];
    const description = fields[descIdx];
    const cardMember = memberIdx >= 0 && fields[memberIdx] ? fields[memberIdx] : "";
    const accountNum = accountIdx >= 0 && fields[accountIdx] ? fields[accountIdx] : "";
    const amountStr = fields[amountIdx];
    const amexCategory = categoryIdx >= 0 && fields[categoryIdx] ? fields[categoryIdx] : "";

    const rawAmount = parseAmount(amountStr);
    if (rawAmount === 0 && !amountStr.includes("0")) continue;

    // Amex: negative = payments/credits, positive = charges
    const isPayment = rawAmount < 0;
    const amount = Math.abs(rawAmount);

    // Use Amex category if available, fall back to keyword matching
    const category = amexCategory || categorize(description);

    transactions.push({
      id: generateId(),
      date: parseDate(dateStr),
      description: description.trim(),
      amount,
      direction: isPayment ? "inflow" : "outflow",
      source: "credit_card",
      category,
      cardMember: cardMember.trim(),
      accountNumber: accountNum.trim(),
    });
  }

  return { source: "credit_card", transactions, errors };
}

export function parseCSV(content: string): ImportResult {
  const rawLines = content.split(/\r?\n/);
  if (rawLines.length < 2) {
    return { source: "bank", transactions: [], errors: ["File is empty or has no data rows"] };
  }

  const headerLine = rawLines[0];
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

  // Reassemble multi-line quoted fields into logical rows
  const lines = reassembleQuotedRows(rawLines, delimiter);

  if (source === "bank") {
    return parseBankCSV(lines, delimiter);
  }

  const headerFields = splitRow(lines[0], delimiter);
  return parseCreditCardCSV(lines, delimiter, headerFields);
}
