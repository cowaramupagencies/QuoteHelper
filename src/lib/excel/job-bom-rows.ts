import {
  buildCustomerQuoteLines,
  calculateItemPricing,
  calculateOptionTotals,
  calculateSectionTotals,
} from "@/lib/pricing/calculations";
import type { Quote } from "@/types";

/** Job BOM sheet columns A–O (matches CowAg Excel template). */
export const JOB_BOM_COLUMN_COUNT = 15;

export type JobBomRowKind =
  | "option-header"
  | "section-header"
  | "item"
  | "section-total"
  | "option-total";

export interface JobBomExportRow {
  kind: JobBomRowKind;
  cells: (string | number)[];
  isFree?: boolean;
}

function emptyRow(): (string | number)[] {
  return Array(JOB_BOM_COLUMN_COUNT).fill("");
}

function setCell(row: (string | number)[], index: number, value: string | number | null | undefined) {
  if (value == null || value === "") return;
  row[index] = value;
}

/** Same row layout as Job BOM export — paste into template starting at row 6, column A. */
export function buildJobBomExportRows(quote: Quote): JobBomExportRow[] {
  const rows: JobBomExportRow[] = [];

  for (const option of quote.options.sort((a, b) => a.sortOrder - b.sortOrder)) {
    const optionHeader = emptyRow();
    setCell(optionHeader, 5, option.name);
    rows.push({ kind: "option-header", cells: optionHeader });

    for (const section of option.sections
      .filter((s) => s.enabled)
      .sort((a, b) => a.sortOrder - b.sortOrder)) {
      const sectionItems = section.items.filter((i) => i.description || i.cowagPartNumber);
      if (sectionItems.length === 0) continue;

      const sectionHeader = emptyRow();
      setCell(sectionHeader, 5, section.name);
      rows.push({ kind: "section-header", cells: sectionHeader });

      for (const rawItem of section.items) {
        const item = calculateItemPricing(rawItem);
        const isFree = item.pricingState === "free";
        const itemRow = emptyRow();

        setCell(itemRow, 2, item.supplier ?? "");
        setCell(itemRow, 3, item.supplierPartNumber ?? "");
        setCell(itemRow, 4, isFree ? "FREE" : item.cowagPartNumber ?? "");
        setCell(itemRow, 5, item.description);
        setCell(itemRow, 6, item.quantity);
        setCell(itemRow, 7, item.costEach ?? "");
        setCell(itemRow, 8, item.costTotal ?? "");
        setCell(itemRow, 9, item.markupPercent ?? "");
        setCell(itemRow, 10, isFree ? 0 : item.sellEach ?? "");
        setCell(
          itemRow,
          11,
          isFree ? 0 : item.pricingState === "poa" ? "POA" : item.sellTotal ?? ""
        );
        setCell(itemRow, 12, item.marginDollar ?? "");
        setCell(itemRow, 13, item.marginPercent != null ? item.marginPercent / 100 : "");
        setCell(itemRow, 14, item.notes ?? "");

        rows.push({ kind: "item", cells: itemRow, isFree });
      }

      const sectionTotals = calculateSectionTotals(section);
      const sectionTotalRow = emptyRow();
      setCell(sectionTotalRow, 0, section.name);
      setCell(sectionTotalRow, 5, `${section.name} — section total`);
      setCell(sectionTotalRow, 8, sectionTotals.costTotal ?? "");
      setCell(sectionTotalRow, 11, sectionTotals.sellExGst);
      setCell(sectionTotalRow, 12, sectionTotals.marginDollar ?? "");
      setCell(
        sectionTotalRow,
        13,
        sectionTotals.marginPercent != null ? sectionTotals.marginPercent / 100 : ""
      );
      rows.push({ kind: "section-total", cells: sectionTotalRow });
    }

    const optionTotals = calculateOptionTotals(option);
    const optionTotalRow = emptyRow();
    setCell(optionTotalRow, 5, `${option.name} — option total`);
    setCell(optionTotalRow, 8, optionTotals.costTotal ?? "");
    setCell(optionTotalRow, 11, optionTotals.sellExGst);
    setCell(optionTotalRow, 12, optionTotals.marginDollar ?? "");
    setCell(
      optionTotalRow,
      13,
      optionTotals.marginPercent != null ? optionTotals.marginPercent / 100 : ""
    );
    rows.push({ kind: "option-total", cells: optionTotalRow });
  }

  return rows;
}

export function formatJobBomClipboardText(quote: Quote): string {
  return buildJobBomExportRows(quote)
    .map((row) =>
      row.cells
        .map((cell) => {
          if (cell == null || cell === "") return "";
          return String(cell).replace(/\t/g, " ").replace(/\r?\n/g, " ");
        })
        .join("\t")
    )
    .join("\n");
}

export function buildJobBomHeaderFields(quote: Quote) {
  return {
    quoteNumber: quote.quoteNumber,
    quoteDate: quote.quoteDate,
    customerId: quote.customer.customerId ?? "",
    customerName: quote.customer.name,
  };
}
