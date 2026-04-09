export type TransactionSource = "bank" | "credit_card";
export type FlowDirection = "inflow" | "outflow";

export interface Transaction {
  id: string;
  date: string; // ISO date string
  description: string;
  amount: number; // always positive
  direction: FlowDirection;
  source: TransactionSource;
  category: string;
  cardMember?: string;
  accountNumber?: string;
  runningBalance?: number;
}

export interface ImportResult {
  source: TransactionSource;
  transactions: Transaction[];
  errors: string[];
}

export const CATEGORIES: Record<string, string[]> = {
  Payroll: ["PAYROLL", "PALMER WEISS", "SAMSARA NETWORKS"],
  "Credit Card Payment": ["AMEX EPAYMENT", "EPAYMENT ACH PMT"],
  Rent: ["APPFOLIO", "CHANDLER PROPERT"],
  Transfers: ["VENMO PAYMENT", "VENMO CASHOUT", "ZELLE", "Electronic Deposit"],
  Insurance: ["NORTHWESTERN MU", "GEICO", "STATE FARM"],
  "ATM / Cash": ["ATM", "CASH WITHDRAWAL"],
  Interest: ["Interest Paid", "INTADJUST"],
  "Bank Fees": ["ATM Fee Rebate", "ATMREBATE", "Service Charge"],
  Groceries: ["TRADER JOE", "SAFEWAY", "WHOLE FOODS", "GROCERY"],
  Dining: ["DOORDASH", "UBER EATS", "GRUBHUB", "RESTAURANT", "DUSAN"],
  Shopping: ["TARGET", "AMAZON", "WALMART"],
  Travel: ["HOTEL", "AIRLINE", "AIRBNB", "UNITED", "DELTA", "SOUTHWEST"],
  Utilities: ["PG&E", "COMCAST", "VERIZON", "AT&T"],
  Entertainment: ["NETFLIX", "SPOTIFY", "HULU", "DISNEY"],
};

// Categories that are fund movements, not true income — always treat as transfers
// even when they appear in the Deposit column
const TRANSFER_CATEGORIES = new Set(["Transfers", "Credit Card Payment", "Bank Fees", "Interest"]);

export function isTransferCategory(category: string): boolean {
  return TRANSFER_CATEGORIES.has(category);
}

export function categorize(description: string): string {
  const upper = description.toUpperCase();
  for (const [category, keywords] of Object.entries(CATEGORIES)) {
    if (keywords.some((kw) => upper.includes(kw.toUpperCase()))) {
      return category;
    }
  }
  return "Other";
}
