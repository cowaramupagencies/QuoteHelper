import ExcelJS from "exceljs";
import path from "path";
import { GST_RATE, calculateOptionTotals, buildCustomerQuoteLines } from "@/lib/pricing/calculations";
import { estimateScopeLastRowHeight, getScopeCapacityStatus } from "@/lib/scope/capacity";
import { buildJobBomExportRows } from "@/lib/excel/job-bom-rows";
import type { Quote } from "@/types";

const TEMPLATE_PATH = path.join(process.cwd(), "data/templates/quotation-template.xlsx");

const BOM_DATA_START_ROW = 6;
/** Sample data in template occupies rows 6–27 */
const BOM_TEMPLATE_LAST_ROW = 27;

const QUOTE_SCOPE_HEADER_ROW = 68;
const QUOTE_SCOPE_LABEL_ROW = 69;
const QUOTE_SCOPE_BODY_START = 70;
const QUOTE_SCOPE_BODY_END = 82;
const QUOTE_SCOPE_GAP_ROW = 83;

const QUOTE_PRICING_HEADER_ROW = 84;
const QUOTE_PRICING_START_ROW = 87;
const QUOTE_PRICING_CLEAR_UNTIL = 108;

const BOM_COLS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O"] as const;
const QUOTE_COLS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"] as const;

const OPTION_HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { theme: 1 },
};

const ITEM_ROW_FILL = {
  type: "pattern",
  pattern: "solid",
  fgColor: { theme: 0, tint: -0.1499984740745262 },
} as ExcelJS.Fill;

const FREE_CODE_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFFC000" },
};

const BOM_BLACK_FONT: Partial<ExcelJS.Font> = {
  name: "Calibri",
  size: 11,
  color: { argb: "FF000000" },
};

const BOM_BLACK_FONT_BOLD: Partial<ExcelJS.Font> = {
  ...BOM_BLACK_FONT,
  bold: true,
  size: 10,
};

const SCOPE_FONT: Partial<ExcelJS.Font> = { name: "Ebrima", size: 14 };
const SCOPE_BODY_MERGE = `A${QUOTE_SCOPE_BODY_START}:L${QUOTE_SCOPE_BODY_END}`;

function stripFormulas(workbook: ExcelJS.Workbook) {
  for (const sheet of workbook.worksheets) {
    sheet.eachRow((row) => {
      row.eachCell({ includeEmpty: true }, (cell) => {
        const model = (cell as ExcelJS.Cell & {
          model?: { formula?: string; sharedFormula?: string; result?: ExcelJS.CellValue };
        }).model;
        if (model?.formula || model?.sharedFormula) {
          cell.value = model.result ?? null;
        }
      });
    });
  }
}

function setRowVisible(sheet: ExcelJS.Worksheet, row: number, visible: boolean) {
  const r = sheet.getRow(row);
  r.hidden = !visible;
  if (!visible) r.height = 0;
}

function hideRowRange(sheet: ExcelJS.Worksheet, startRow: number, endRow: number) {
  clearRowRange(sheet, startRow, endRow, QUOTE_COLS);
  for (let row = startRow; row <= endRow; row++) {
    setRowVisible(sheet, row, false);
  }
}

function hideBomRowRange(bomSheet: ExcelJS.Worksheet, startRow: number, endRow: number) {
  clearRowRange(bomSheet, startRow, endRow, BOM_COLS);
  for (let row = startRow; row <= endRow; row++) {
    setRowVisible(bomSheet, row, false);
  }
}

function showRowRange(sheet: ExcelJS.Worksheet, startRow: number, endRow: number) {
  for (let row = startRow; row <= endRow; row++) {
    setRowVisible(sheet, row, true);
    if (sheet.getRow(row).height === 0) sheet.getRow(row).height = 15;
  }
}

function resetCellStyle(cell: ExcelJS.Cell) {
  cell.fill = { type: "pattern", pattern: "none" };
  cell.font = { name: "Calibri", size: 11 };
  cell.border = {};
}

function clearCell(sheet: ExcelJS.Worksheet, address: string) {
  const cell = sheet.getCell(address);
  cell.value = null;
  resetCellStyle(cell);
}

function clearRowRange(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  endRow: number,
  cols: readonly string[]
) {
  for (let row = startRow; row <= endRow; row++) {
    for (const col of cols) {
      clearCell(sheet, `${col}${row}`);
    }
  }
}

function applyOptionHeaderStyle(sheet: ExcelJS.Worksheet, row: number) {
  const r = sheet.getRow(row);
  r.height = 33;
  for (const col of BOM_COLS) {
    const cell = sheet.getCell(`${col}${row}`);
    cell.fill = OPTION_HEADER_FILL;
    cell.font = { bold: true, color: { theme: 1 } };
  }
}

function applyItemRowStyle(sheet: ExcelJS.Worksheet, row: number, isFree: boolean) {
  const r = sheet.getRow(row);
  r.height = 33;
  for (const col of BOM_COLS) {
    const cell = sheet.getCell(`${col}${row}`);
    cell.fill = ITEM_ROW_FILL;
    cell.font = { ...BOM_BLACK_FONT };
  }
  if (isFree) {
    const freeCell = sheet.getCell(`E${row}`);
    freeCell.fill = FREE_CODE_FILL;
    freeCell.font = { ...BOM_BLACK_FONT, bold: true };
  }
}

const SECTION_HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF00866A" },
};

function applySectionHeaderStyle(sheet: ExcelJS.Worksheet, row: number) {
  sheet.getRow(row).height = 28;
  for (const col of BOM_COLS) {
    const cell = sheet.getCell(`${col}${row}`);
    cell.fill = SECTION_HEADER_FILL;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
  }
}

function applySectionSubtotalStyle(sheet: ExcelJS.Worksheet, row: number) {
  sheet.getRow(row).height = 24;
  for (const col of BOM_COLS) {
    const cell = sheet.getCell(`${col}${row}`);
    cell.fill = ITEM_ROW_FILL;
    cell.font = { ...BOM_BLACK_FONT_BOLD };
  }
}

function applyOptionSubtotalStyle(sheet: ExcelJS.Worksheet, row: number) {
  sheet.getRow(row).height = 28;
  for (const col of BOM_COLS) {
    const cell = sheet.getCell(`${col}${row}`);
    cell.fill = OPTION_HEADER_FILL;
    cell.font = { bold: true, color: { theme: 1 }, size: 10 };
  }
}

function removeTemplateBomRows(bomSheet: ExcelJS.Worksheet, lastUsedRow: number) {
  if (lastUsedRow < BOM_TEMPLATE_LAST_ROW) {
    hideBomRowRange(bomSheet, lastUsedRow + 1, BOM_TEMPLATE_LAST_ROW);
  }
}

function clearScopeBodyMerges(sheet: ExcelJS.Worksheet) {
  try {
    sheet.unMergeCells(SCOPE_BODY_MERGE);
  } catch {
    // merge may not exist
  }
  for (let row = QUOTE_SCOPE_BODY_START; row <= QUOTE_SCOPE_BODY_END; row++) {
    try {
      sheet.unMergeCells(`A${row}:L${row}`);
    } catch {
      // ignore
    }
  }
  try {
    sheet.unMergeCells(`A${QUOTE_SCOPE_LABEL_ROW}:L${QUOTE_SCOPE_LABEL_ROW}`);
  } catch {
    // ignore
  }
}

function clearCellBorders(sheet: ExcelJS.Worksheet, startRow: number, endRow: number, cols: readonly string[]) {
  for (let row = startRow; row <= endRow; row++) {
    for (const col of cols) {
      sheet.getCell(`${col}${row}`).border = {};
    }
  }
}

function writeScope(sheet: ExcelJS.Worksheet, scopeText: string) {
  clearScopeBodyMerges(sheet);
  clearRowRange(sheet, QUOTE_SCOPE_HEADER_ROW, QUOTE_SCOPE_GAP_ROW, QUOTE_COLS);

  const trimmed = scopeText.trim();
  if (!trimmed) {
    hideRowRange(sheet, QUOTE_SCOPE_HEADER_ROW, QUOTE_SCOPE_GAP_ROW);
    return;
  }

  showRowRange(sheet, QUOTE_SCOPE_HEADER_ROW, QUOTE_SCOPE_BODY_END);
  hideRowRange(sheet, QUOTE_SCOPE_GAP_ROW, QUOTE_SCOPE_GAP_ROW);

  sheet.getCell(`A${QUOTE_SCOPE_HEADER_ROW}`).value = "Scope of Works and Supply";

  const proposalCell = sheet.getCell(`A${QUOTE_SCOPE_LABEL_ROW}`);
  proposalCell.value = "Proposal:";
  proposalCell.font = { ...SCOPE_FONT, underline: true };
  proposalCell.alignment = { vertical: "top", wrapText: true };
  sheet.mergeCells(`A${QUOTE_SCOPE_LABEL_ROW}:L${QUOTE_SCOPE_LABEL_ROW}`);

  for (let row = QUOTE_SCOPE_BODY_START; row <= QUOTE_SCOPE_BODY_END; row++) {
    const boxHeight = estimateScopeLastRowHeight(trimmed);
    sheet.getRow(row).height =
      row === QUOTE_SCOPE_BODY_END ? boxHeight : 15;
  }

  sheet.mergeCells(SCOPE_BODY_MERGE);
  const scopeCell = sheet.getCell(`A${QUOTE_SCOPE_BODY_START}`);
  scopeCell.value = trimmed;
  scopeCell.font = getScopeCapacityStatus(trimmed).isOverLimit
    ? { ...SCOPE_FONT, color: { argb: "FFCC0000" } }
    : SCOPE_FONT;
  scopeCell.alignment = { horizontal: "left", vertical: "top", wrapText: true };
  clearCellBorders(sheet, QUOTE_SCOPE_LABEL_ROW, QUOTE_SCOPE_BODY_END, QUOTE_COLS);
}

function writeJobBom(bomSheet: ExcelJS.Worksheet, quote: Quote) {
  showRowRange(bomSheet, BOM_DATA_START_ROW, BOM_TEMPLATE_LAST_ROW);
  clearRowRange(bomSheet, BOM_DATA_START_ROW, BOM_TEMPLATE_LAST_ROW, BOM_COLS);

  bomSheet.getCell("B2").value = quote.quoteNumber;
  bomSheet.getCell("G2").value = quote.customer.customerId ?? "";
  bomSheet.getCell("G3").value = quote.customer.name;
  bomSheet.getCell("B3").value = quote.quoteDate;

  let bomRow = BOM_DATA_START_ROW;
  let lastUsedRow = BOM_DATA_START_ROW - 1;

  for (const exportRow of buildJobBomExportRows(quote)) {
    exportRow.cells.forEach((value, index) => {
      if (value === "" || value == null) return;
      bomSheet.getCell(`${BOM_COLS[index]}${bomRow}`).value = value;
    });

    switch (exportRow.kind) {
      case "option-header":
        applyOptionHeaderStyle(bomSheet, bomRow);
        break;
      case "section-header":
        applySectionHeaderStyle(bomSheet, bomRow);
        break;
      case "item":
        applyItemRowStyle(bomSheet, bomRow, exportRow.isFree ?? false);
        break;
      case "section-total":
        applySectionSubtotalStyle(bomSheet, bomRow);
        break;
      case "option-total":
        applyOptionSubtotalStyle(bomSheet, bomRow);
        break;
    }

    lastUsedRow = bomRow;
    bomRow++;
  }

  removeTemplateBomRows(bomSheet, lastUsedRow);
}

function writeCustomerPricing(quoteSheet: ExcelJS.Worksheet, quote: Quote) {
  clearRowRange(quoteSheet, QUOTE_PRICING_START_ROW, QUOTE_PRICING_CLEAR_UNTIL, QUOTE_COLS);
  showRowRange(quoteSheet, QUOTE_PRICING_HEADER_ROW, QUOTE_PRICING_CLEAR_UNTIL);

  const pricingMode = quote.customerPricingMode ?? "itemised";
  let quoteRow = QUOTE_PRICING_START_ROW;
  const sortedOptions = quote.options.sort((a, b) => a.sortOrder - b.sortOrder);

  for (let optionIndex = 0; optionIndex < sortedOptions.length; optionIndex++) {
    const option = sortedOptions[optionIndex];
    const totals = calculateOptionTotals(option);
    const lines = buildCustomerQuoteLines(option, pricingMode);

    quoteSheet.getCell(`A${quoteRow}`).value = option.name;
    quoteSheet.getCell(`A${quoteRow}`).font = { bold: true };
    quoteRow++;

    for (const line of lines) {
      quoteSheet.getCell(`A${quoteRow}`).value = line.label;
      quoteSheet.getCell(`I${quoteRow}`).value = line.exGst;
      quoteSheet.getCell(`K${quoteRow}`).value = line.exGst * (1 + GST_RATE);
      quoteRow++;
    }

    quoteSheet.getCell(`A${quoteRow}`).value = `${option.name} Total`;
    quoteSheet.getCell(`I${quoteRow}`).value = totals.sellExGst;
    quoteSheet.getCell(`K${quoteRow}`).value = totals.sellIncGst;
    quoteRow++;

    if (optionIndex < sortedOptions.length - 1) {
      quoteRow++;
    }
  }

  if (quoteRow <= QUOTE_PRICING_CLEAR_UNTIL) {
    hideRowRange(quoteSheet, quoteRow, QUOTE_PRICING_CLEAR_UNTIL);
  }
}

function writeQuotationHeader(quoteSheet: ExcelJS.Worksheet, quote: Quote) {
  quoteSheet.getCell("A21").value = `Estimate #${quote.quoteNumber}`;
  quoteSheet.getCell("A24").value = new Date(quote.quoteDate).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const firstName = quote.customer.name.split(" ")[0] || "Customer";
  quoteSheet.getCell("A27").value = `Dear ${firstName},`;

  quoteSheet.getCell("B63").value = quote.customer.name;
  quoteSheet.getCell("B65").value = quote.customer.mobile ?? quote.customer.phone ?? "";
  quoteSheet.getCell("B66").value = quote.customer.email ?? "";
  quoteSheet.getCell("H63").value = quote.delivery.address ?? "";
  quoteSheet.getCell("H64").value = quote.delivery.suburb ?? "";
  quoteSheet.getCell("H66").value = quote.delivery.startDate ?? "TBC";
}

export async function generateQuoteWorkbook(quote: Quote): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(TEMPLATE_PATH);
  stripFormulas(workbook);

  const bomSheet = workbook.getWorksheet("Job BOM");
  const quoteSheet = workbook.getWorksheet("Quotation");

  if (!bomSheet || !quoteSheet) {
    throw new Error("Template sheets not found");
  }

  writeJobBom(bomSheet, quote);
  writeQuotationHeader(quoteSheet, quote);
  writeScope(quoteSheet, quote.scopeText);
  writeCustomerPricing(quoteSheet, quote);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export {
  BOM_DATA_START_ROW,
  QUOTE_PRICING_START_ROW,
  QUOTE_PRICING_CLEAR_UNTIL,
  QUOTE_SCOPE_BODY_START,
  clearRowRange,
};
