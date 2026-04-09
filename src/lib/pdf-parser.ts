import { Transaction, ImportResult } from "./types";

let idCounter = 0;
function generateId(): string {
  return `txn_${Date.now()}_${idCounter++}`;
}

function parseDate(raw: string): string {
  const parts = raw.trim().split("/");
  if (parts.length === 3) {
    const [month, day, year] = parts;
    const fullYear = year.length === 2 ? `20${year}` : year;
    return `${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  return raw.trim();
}

function parseAmount(raw: string): number {
  return parseFloat(raw.replace(/[$,]/g, "")) || 0;
}

interface LapseDetail {
  awardId: string;
  awardDate: string;
  exerciseDate: string;
  transactionShares: number;
  sharesWithheld: number;
  netShares: number;
  grossProceeds: number;
  netValue: number;
  fairMarketValue: number;
}

interface LapseSummary {
  exerciseDate: string;
  totalShares: number;
  sharesWithheld: number;
  netShares: number;
  grossProceeds: number;
  netValue: number;
  totalTaxPaid: number;
}

function extractField(text: string, label: string): string | null {
  // Match "Label" followed by value on the same line or after whitespace
  const patterns = [
    new RegExp(`${label}\\s+([\\d/]+|\\$[\\d,.]+|[\\d,.]+)`, "i"),
    new RegExp(`${label}\\s*\\n\\s*([\\d/]+|\\$[\\d,.]+|[\\d,.]+)`, "i"),
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1].trim();
  }
  return null;
}

function parseLapseSummary(text: string): LapseSummary | null {
  const summaryMatch = text.match(/Lapse Summary[\s\S]*?(?=Tax Summary|Lapse Detail|$)/i);
  if (!summaryMatch) return null;
  const section = summaryMatch[0];

  const exerciseDate = extractField(section, "Exercise Date");
  const totalShares = extractField(section, "Transaction Share Amount");
  const sharesWithheld = extractField(section, "Shares Withheld");
  const netShares = extractField(section, "Net Shares");
  const grossProceeds = extractField(section, "Gross Proceeds");
  const netValue = extractField(section, "Net Value");

  // Get total tax from Tax Summary
  const taxMatch = text.match(/Total Tax Paid\s+\$?([\d,.]+)/i);
  const totalTaxPaid = taxMatch ? parseAmount(taxMatch[1]) : 0;

  if (!exerciseDate || !grossProceeds) return null;

  return {
    exerciseDate: exerciseDate,
    totalShares: totalShares ? parseFloat(totalShares) : 0,
    sharesWithheld: sharesWithheld ? parseFloat(sharesWithheld) : 0,
    netShares: netShares ? parseFloat(netShares) : 0,
    grossProceeds: parseAmount(grossProceeds),
    netValue: netValue ? parseAmount(netValue) : 0,
    totalTaxPaid,
  };
}

function parseLapseDetails(text: string): LapseDetail[] {
  const details: LapseDetail[] = [];
  // Split on "Lapse Detail - RSU" sections
  const sections = text.split(/Lapse Detail\s*-\s*RSU/i).slice(1);

  for (const section of sections) {
    const awardId = extractField(section, "Award ID");
    const awardDate = extractField(section, "Award Date");
    const exerciseDate = extractField(section, "Exercise Date");
    const transactionShares = extractField(section, "Transaction Share Amount");
    const sharesWithheld = extractField(section, "Shares Withheld");
    const netShares = extractField(section, "Net Shares");
    const grossProceeds = extractField(section, "Gross Proceeds");
    const netValue = extractField(section, "Net Value");

    // Try to find FMV from tax details
    const fmvMatch = section.match(/\$(\d+\.\d{4})/);

    if (awardId && grossProceeds) {
      details.push({
        awardId: awardId,
        awardDate: awardDate || "",
        exerciseDate: exerciseDate || "",
        transactionShares: transactionShares ? parseFloat(transactionShares) : 0,
        sharesWithheld: sharesWithheld ? parseFloat(sharesWithheld) : 0,
        netShares: netShares ? parseFloat(netShares) : 0,
        grossProceeds: parseAmount(grossProceeds),
        netValue: netValue ? parseAmount(netValue) : 0,
        fairMarketValue: fmvMatch ? parseFloat(fmvMatch[1]) : 0,
      });
    }
  }

  return details;
}

export function isSchwabStockPDF(text: string): boolean {
  return (
    text.includes("Restricted Stock Activity") &&
    (text.includes("Lapse Summary") || text.includes("Lapse Detail"))
  );
}

export function parseSchwabStockPDF(text: string): ImportResult {
  const transactions: Transaction[] = [];
  const errors: string[] = [];

  const summary = parseLapseSummary(text);
  const details = parseLapseDetails(text);

  // Determine exercise date from summary or first detail
  const exerciseDate = summary?.exerciseDate || details[0]?.exerciseDate || "";
  const isoDate = parseDate(exerciseDate);

  // Detect company name
  const companyMatch = text.match(/(?:Samsara|[\w]+)\s+Inc\./i);
  const company = companyMatch ? companyMatch[0] : "Company";

  // Find FMV from Tax Details section
  const fmvMatch = text.match(/Fair Market\s*Value[\s\S]*?\$(\d+\.\d{4})/i);
  const fmv = fmvMatch ? parseFloat(fmvMatch[1]) : 0;

  if (details.length > 0) {
    // Create individual transactions per award
    for (const detail of details) {
      const detailDate = parseDate(detail.exerciseDate || exerciseDate);

      // Net value (inflow) — what you actually received
      transactions.push({
        id: generateId(),
        date: detailDate,
        description: `RSU Vest — ${company} (${detail.awardId})`,
        amount: detail.netValue,
        direction: "inflow",
        source: "stock_rewards",
        category: "RSU Vest",
        awardId: detail.awardId,
        sharesVested: detail.transactionShares,
        sharesWithheld: detail.sharesWithheld,
        netShares: detail.netShares,
        grossProceeds: detail.grossProceeds,
        taxWithheld: detail.grossProceeds - detail.netValue,
        fairMarketValue: detail.fairMarketValue || fmv,
      });
    }
  } else if (summary) {
    // Fallback: single summary transaction
    transactions.push({
      id: generateId(),
      date: isoDate,
      description: `RSU Vest — ${company}`,
      amount: summary.netValue,
      direction: "inflow",
      source: "stock_rewards",
      category: "RSU Vest",
      sharesVested: summary.totalShares,
      sharesWithheld: summary.sharesWithheld,
      netShares: summary.netShares,
      grossProceeds: summary.grossProceeds,
      taxWithheld: summary.totalTaxPaid,
      fairMarketValue: fmv,
    });
  } else {
    errors.push("Could not find Lapse Summary or Lapse Details in the PDF.");
  }

  // Also create a tax withholding outflow transaction for the total
  if (summary && summary.totalTaxPaid > 0) {
    transactions.push({
      id: generateId(),
      date: isoDate,
      description: `RSU Tax Withheld — ${company}`,
      amount: summary.totalTaxPaid,
      direction: "outflow",
      source: "stock_rewards",
      category: "RSU Tax Withheld",
    });
  }

  return { source: "stock_rewards", transactions, errors };
}

export async function extractPDFText(file: File): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist");
  // Use the bundled worker
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    pages.push(text);
  }

  return pages.join("\n");
}
