export type TransactionSource = "bank" | "credit_card" | "stock_rewards";
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
  // Stock reward fields
  awardId?: string;
  sharesVested?: number;
  sharesWithheld?: number;
  netShares?: number;
  grossProceeds?: number;
  taxWithheld?: number;
  fairMarketValue?: number;
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

export function categorize(description: string): string {
  const upper = description.toUpperCase();
  for (const [category, keywords] of Object.entries(CATEGORIES)) {
    if (keywords.some((kw) => upper.includes(kw.toUpperCase()))) {
      return category;
    }
  }
  return "Other";
}

/**
 * Maps granular transaction categories (especially from Amex) into broader
 * dashboard buckets. The raw category is preserved on each transaction for
 * the detail view.
 */
const DASHBOARD_BUCKET_MAP: Record<string, string> = {
  // Amex prefixed categories
  "restaurant": "Dining",
  "merchandise & supplies-groceries": "Groceries",
  "merchandise & supplies": "Shopping",
  "travel-lodging": "Travel",
  "travel-airline": "Travel",
  "travel": "Travel",
  "transportation": "Transportation",
  "entertainment": "Entertainment",
  "fees & adjustments": "Fees",
  "business services": "Business Services",
  "communication": "Utilities",
  "other": "Other",
  // Stock rewards
  "rsu vest": "Stock Rewards",
  "rsu tax withheld": "Stock Rewards",
  "stock rewards": "Stock Rewards",
};

export function getDashboardBucket(category: string): string {
  const lower = category.toLowerCase();

  // Direct match first
  if (DASHBOARD_BUCKET_MAP[lower]) {
    return DASHBOARD_BUCKET_MAP[lower];
  }

  // Prefix match for Amex sub-categories like "Restaurant-Bar & Café"
  for (const [prefix, bucket] of Object.entries(DASHBOARD_BUCKET_MAP)) {
    if (lower.startsWith(prefix)) {
      return bucket;
    }
  }

  // Our keyword-based categories (Payroll, Rent, Transfers, etc.) pass through
  if (CATEGORIES[category]) {
    return category;
  }

  return "Other";
}
