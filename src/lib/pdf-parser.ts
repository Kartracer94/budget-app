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

export function isSchwabStockPDF(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").toLowerCase();
  return (
    normalized.includes("restricted stock") &&
    (normalized.includes("lapse") || normalized.includes("exercise date"))
  );
}

/**
 * Extract all dollar amounts from text
 */
function findDollarAmounts(text: string): number[] {
  const matches = text.match(/\$[\d,]+\.\d{2}/g) || [];
  return matches.map(parseAmount);
}

/**
 * Extract all dates (MM/DD/YY or MM/DD/YYYY) from text
 */
function findDates(text: string): string[] {
  const matches = text.match(/\d{2}\/\d{2}\/\d{2,4}/g) || [];
  return matches;
}

/**
 * Extract Award IDs (SG3-XXXXX pattern)
 */
function findAwardIds(text: string): string[] {
  const matches = text.match(/SG\d-\d{5}/g) || [];
  return [...new Set(matches)];
}

/**
 * Parse the Lapse Summary section from page 2.
 * The summary has a known structure — we extract by the order of values.
 */
function parseLapseSummary(pageText: string) {
  const normalized = pageText.replace(/\s+/g, " ");

  // Check this page has Lapse Summary
  if (!/lapse\s*summary/i.test(normalized)) return null;

  const dates = findDates(normalized);
  const amounts = findDollarAmounts(normalized);

  // Extract the exercise date (first date on the page)
  const exerciseDate = dates[0] || "";

  // Look for Transaction Share Amount — a bare integer after "Exercise Date" line
  const sharesMatch = normalized.match(/(?:exercise\s*date|transaction\s*share)\D+(\d{2,4})\b/i);
  const totalShares = sharesMatch ? parseInt(sharesMatch[1]) : 0;

  // Shares Withheld — a decimal number like 182.0000
  const withheldMatch = normalized.match(/(\d+)\.0000\s/);
  const sharesWithheld = withheldMatch ? parseInt(withheldMatch[1]) : 0;

  // Find key dollar amounts from Lapse Summary
  // Order in text: Total Share Cost ($0.00), Gross Proceeds, then later Net Cash, Net Value, Net Proceeds
  // Also Total Tax Paid appears in Tax Summary

  // Gross Proceeds is typically the largest non-tax amount
  const grossProceeds = amounts.length > 0 ? Math.max(...amounts.filter(a => a > 100)) : 0;

  // Net Value/Proceeds — appears after "Net Value" or "Net Proceeds"
  const netMatch = normalized.match(/net\s*(?:value|proceeds)\s*\$?([\d,]+\.\d{2})/i);
  const netValue = netMatch ? parseAmount(netMatch[1]) : 0;

  // Total Tax Paid
  const taxMatch = normalized.match(/total\s*tax\s*paid\s*\$?([\d,]+\.\d{2})/i);
  const totalTaxPaid = taxMatch ? parseAmount(taxMatch[1]) : 0;

  // Net Shares
  const netSharesMatch = normalized.match(/net\s*shares\s*(\d+)/i);
  const netShares = netSharesMatch ? parseInt(netSharesMatch[1]) : 0;

  return {
    exerciseDate,
    totalShares,
    sharesWithheld,
    netShares,
    grossProceeds,
    netValue,
    totalTaxPaid,
  };
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

/**
 * Parse Lapse Detail sections from page 3+.
 * Each detail block has an Award ID and associated amounts.
 */
function parseLapseDetails(allText: string): LapseDetail[] {
  const normalized = allText.replace(/\s+/g, " ");
  const awardIds = findAwardIds(normalized);

  if (awardIds.length === 0) return [];

  const details: LapseDetail[] = [];

  // Split text around each "Lapse Detail" occurrence
  const detailBlocks = normalized.split(/lapse\s*detail\s*-?\s*rsu/i).slice(1);

  for (const block of detailBlocks) {
    const awardIdMatch = block.match(/SG\d-\d{5}/);
    if (!awardIdMatch) continue;

    const awardId = awardIdMatch[0];
    const dates = findDates(block);
    const amounts = findDollarAmounts(block);

    // Award Date is typically the first date, Exercise Date the second
    const awardDate = dates[0] || "";
    const exerciseDate = dates[1] || dates[0] || "";

    // Transaction Share Amount — look for bare integer after share-related text
    const txnSharesMatch = block.match(/(?:transaction\s*share\s*amount|amount)\s*(\d{2,4})\b/i)
      || block.match(/\b(\d{2,4})\s*(?:0\.0000|shares?\s*sold)/i);
    const transactionShares = txnSharesMatch ? parseInt(txnSharesMatch[1]) : 0;

    // Shares Withheld
    const withheldMatch = block.match(/(?:shares?\s*withheld|withheld)\s*(\d+)/i)
      || block.match(/(\d+)\.0000\s/);
    const sharesWithheld = withheldMatch ? parseInt(withheldMatch[1]) : 0;

    // Net Shares
    const netSharesMatch = block.match(/net\s*shares?\s*(\d+)/i);
    const netShares = netSharesMatch ? parseInt(netSharesMatch[1]) : 0;

    // Gross Proceeds — largest dollar amount in the block
    const grossProceeds = amounts.length > 0 ? Math.max(...amounts) : 0;

    // Net Value — look for the text pattern or take second-largest amount
    const netValueMatch = block.match(/net\s*(?:value|proceeds)\s*\$?([\d,]+\.\d{2})/i);
    let netValue = netValueMatch ? parseAmount(netValueMatch[1]) : 0;

    // If no explicit net value found, look for repeated amount (net value = net proceeds)
    if (!netValue && amounts.length >= 2) {
      const sorted = [...amounts].sort((a, b) => b - a);
      // Net value is usually the second distinct amount
      netValue = sorted.find(a => a !== grossProceeds && a > 0) || 0;
    }

    // FMV
    const fmvMatch = block.match(/\$(\d+\.\d{4})/);
    const fmv = fmvMatch ? parseFloat(fmvMatch[1]) : 0;

    if (grossProceeds > 0) {
      details.push({
        awardId,
        awardDate,
        exerciseDate,
        transactionShares,
        sharesWithheld,
        netShares,
        grossProceeds,
        netValue,
        fairMarketValue: fmv,
      });
    }
  }

  return details;
}

export function parseSchwabStockPDF(text: string): ImportResult {
  const transactions: Transaction[] = [];
  const errors: string[] = [];

  const summary = parseLapseSummary(text);
  const details = parseLapseDetails(text);

  // Determine exercise date
  const exerciseDate = summary?.exerciseDate || details[0]?.exerciseDate || "";
  const isoDate = parseDate(exerciseDate);

  // Detect company name
  const companyMatch = text.match(/(Samsara|[\w]+)\s+Inc\./i);
  const company = companyMatch ? companyMatch[0] : "Company";

  // Find FMV from Tax Details
  const fmvMatch = text.match(/\$(\d+\.\d{4})/);
  const fmv = fmvMatch ? parseFloat(fmvMatch[1]) : 0;

  if (details.length > 0) {
    for (const detail of details) {
      const detailDate = parseDate(detail.exerciseDate || exerciseDate);
      transactions.push({
        id: generateId(),
        date: detailDate,
        description: `RSU Vest — ${company} (${detail.awardId})`,
        amount: detail.netValue || detail.grossProceeds,
        direction: "inflow",
        source: "stock_rewards",
        category: "RSU Vest",
        awardId: detail.awardId,
        sharesVested: detail.transactionShares,
        sharesWithheld: detail.sharesWithheld,
        netShares: detail.netShares,
        grossProceeds: detail.grossProceeds,
        taxWithheld: detail.grossProceeds - (detail.netValue || detail.grossProceeds),
        fairMarketValue: detail.fairMarketValue || fmv,
      });
    }
  } else if (summary) {
    transactions.push({
      id: generateId(),
      date: isoDate,
      description: `RSU Vest — ${company}`,
      amount: summary.netValue || summary.grossProceeds,
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
  }

  // Tax withholding outflow
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

  // If we got nothing from structured parsing, try a fallback approach
  if (transactions.length === 0) {
    // Look for any dollar amounts and dates in the whole text
    const allAmounts = findDollarAmounts(text);
    const allDates = findDates(text);

    if (allAmounts.length > 0 && allDates.length > 0) {
      const grossProceeds = Math.max(...allAmounts);
      const date = parseDate(allDates[0]);

      // Find tax total
      const taxMatch = text.replace(/\s+/g, " ").match(/total\s*tax\s*paid\s*\$?([\d,]+\.\d{2})/i);
      const taxPaid = taxMatch ? parseAmount(taxMatch[1]) : 0;
      const netValue = taxPaid > 0 ? grossProceeds - taxPaid : grossProceeds;

      transactions.push({
        id: generateId(),
        date,
        description: `RSU Vest — ${company}`,
        amount: netValue,
        direction: "inflow",
        source: "stock_rewards",
        category: "RSU Vest",
        grossProceeds,
        taxWithheld: taxPaid,
      });

      if (taxPaid > 0) {
        transactions.push({
          id: generateId(),
          date,
          description: `RSU Tax Withheld — ${company}`,
          amount: taxPaid,
          direction: "outflow",
          source: "stock_rewards",
          category: "RSU Tax Withheld",
        });
      }
    } else {
      errors.push("Could not extract financial data from the PDF. Please check the file format.");
    }
  }

  return { source: "stock_rewards", transactions, errors };
}

export async function extractPDFText(file: File): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    // Join items with spaces, add newlines between items that have large Y gaps
    let lastY: number | null = null;
    const parts: string[] = [];
    for (const item of content.items) {
      if (!("str" in item) || !item.str) continue;
      const y = "transform" in item ? (item.transform as number[])[5] : 0;
      if (lastY !== null && Math.abs(y - lastY) > 5) {
        parts.push("\n");
      }
      parts.push(item.str);
      lastY = y;
    }
    pages.push(parts.join(" "));
  }

  return pages.join("\n\n");
}
