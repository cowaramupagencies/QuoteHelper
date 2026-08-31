import type { ParsedCatalogueCsv } from "@/types/catalogue-imports";

const FIELD_ALIASES: Record<string, string[]> = {
  cowagCode: [
    "cowag_code",
    "cowag code",
    "cowag pt no",
    "cowag part number",
    "code",
    "stock code",
    "item code",
    "part number",
    "part_no",
    "part no",
  ],
  supplierPartNumber: [
    "supplier part number",
    "supplier_part_number",
    "supplier stock",
    "supplier_stock",
  ],
  supplier: [
    "supplier",
    "supplier name",
    "supplier company",
    "supplier code",
    "supplier pt no",
    "supplier pt number",
    "vendor",
    "vendor name",
  ],
  description: ["description", "desc", "product description", "product name", "name", "item description"],
  unit: ["unit", "uom", "units"],
  costEach: [
    "cost_each",
    "cost each",
    "cost",
    "last cost",
    "last_cost",
    "tencia cost",
    "unit cost",
    "buy price",
  ],
  sellPrice: ["sell_price", "sell price", "sell", "retail", "sell each"],
};

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ");
}

/** Tencia export: supplier company/code (VINIDE, TORO — "SUPPLIER PT NO", "Supplier Code", etc.). */
function isTenciaSupplierColumn(raw: string): boolean {
  const trimmed = raw.trim();
  const norm = normalizeHeader(trimmed);
  if (norm === "supplier pt no" || norm === "supplier pt number") return true;
  if (norm === "supplier code") return true;
  if (/^supplier$/i.test(trimmed)) return true;
  if (/^supplier\s+c[oO]de$/i.test(trimmed)) return true;
  if (/^supplier\s+co$/i.test(trimmed)) return true;
  if (/^supplier\s+company$/i.test(trimmed)) return true;
  if (/^supplier\s+name$/i.test(trimmed)) return true;
  return false;
}

/** Tencia export: supplier stock/part number (e.g. "Supplier_stock"). */
function isTenciaSupplierStockColumn(raw: string): boolean {
  const norm = normalizeHeader(raw);
  return norm === "supplier stock" || norm === "supplier stock no" || norm === "supplier stock number";
}


function isTenciaCostColumn(raw: string): boolean {
  const norm = normalizeHeader(raw);
  return norm === "sum of last cost" || norm.includes("sum of last cost");
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

function mapHeaders(headers: string[]): Record<string, string | null> {
  const mapping: Record<string, string | null> = {
    cowagCode: null,
    supplierPartNumber: null,
    supplier: null,
    description: null,
    unit: null,
    costEach: null,
    sellPrice: null,
  };

  for (const header of headers) {
    if (!mapping.costEach && isTenciaCostColumn(header)) {
      mapping.costEach = header;
    }
  }

  for (const header of headers) {
    if (!mapping.supplierPartNumber && isTenciaSupplierStockColumn(header)) {
      mapping.supplierPartNumber = header;
    }
  }

  for (const header of headers) {
    if (!mapping.supplier && isTenciaSupplierColumn(header)) {
      mapping.supplier = header;
    }
  }

  const normalized = headers.map(normalizeHeader);
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    if (mapping[field]) continue;
    for (let i = 0; i < normalized.length; i++) {
      if (aliases.includes(normalized[i])) {
        mapping[field] = headers[i];
        break;
      }
    }
  }

  return mapping;
}

function parseMoney(value: string): number | null {
  const cleaned = value.replace(/[$,\s]/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function cellValue(row: Record<string, string>, header: string | null): string {
  if (!header) return "";
  return row[header]?.trim() ?? "";
}

export interface MappedCatalogueFields {
  cowagCode: string | null;
  supplier: string | null;
  supplierPartNumber: string | null;
  description: string | null;
  unit: string | null;
  costEach: number | null;
  sellPrice: number | null;
}

/** Re-resolve mapped fields from a raw CSV row (fixes older imports stored with swapped columns). */
export function extractMappedFieldsFromRaw(raw: Record<string, string>): MappedCatalogueFields {
  const headers = Object.keys(raw);
  const columnMapping = mapHeaders(headers);

  const cowagCode = cellValue(raw, columnMapping.cowagCode) || null;
  const supplierPartNumber = cellValue(raw, columnMapping.supplierPartNumber) || null;
  const supplier = cellValue(raw, columnMapping.supplier) || null;
  const description = cellValue(raw, columnMapping.description) || null;
  const unit = cellValue(raw, columnMapping.unit) || null;
  const costEach = parseMoney(cellValue(raw, columnMapping.costEach));
  const sellPrice = parseMoney(cellValue(raw, columnMapping.sellPrice));

  return {
    cowagCode,
    supplier,
    supplierPartNumber,
    description,
    unit,
    costEach,
    sellPrice,
  };
}

/** Parse a Tencia/CowAg-style CSV without assuming a fixed vendor schema. */
export function parseCatalogueCsv(text: string): ParsedCatalogueCsv {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return {
      headers: [],
      columnMapping: {},
      rows: [],
      errors: ["CSV file is empty"],
      warnings: [],
    };
  }

  const headers = parseCsvLine(lines[0]);
  const columnMapping = mapHeaders(headers);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!columnMapping.cowagCode && !columnMapping.supplierPartNumber) {
    errors.push(
      "Could not find a product code column. Expected headers like Code, CowAg Code, Supplier_stock, or Part Number."
    );
  }
  if (!columnMapping.description) {
    warnings.push("No description column detected — descriptions will fall back to the product code.");
  }
  if (!columnMapping.costEach && !columnMapping.sellPrice) {
    warnings.push("No cost or sell price column detected — numeric pricing will be blank until mapping is confirmed.");
  }

  const rows: ParsedCatalogueCsv["rows"] = [];
  for (let lineIndex = 1; lineIndex < lines.length; lineIndex++) {
    const cells = parseCsvLine(lines[lineIndex]);
    if (cells.every((cell) => !cell.trim())) continue;

    const raw: Record<string, string> = {};
    headers.forEach((header, idx) => {
      raw[header] = cells[idx] ?? "";
    });

    const cowagCode = cellValue(raw, columnMapping.cowagCode) || null;
    const supplierPartNumber = cellValue(raw, columnMapping.supplierPartNumber) || null;
    const supplier = cellValue(raw, columnMapping.supplier) || null;
    const description =
      cellValue(raw, columnMapping.description) ||
      cowagCode ||
      supplierPartNumber ||
      `Row ${lineIndex + 1}`;
    const unit = cellValue(raw, columnMapping.unit) || "EACH";
    const costEach = parseMoney(cellValue(raw, columnMapping.costEach));
    const sellPrice = parseMoney(cellValue(raw, columnMapping.sellPrice));

    if (!cowagCode && !supplierPartNumber) {
      warnings.push(`Skipped row ${lineIndex + 1}: no product code`);
      continue;
    }

    rows.push({
      cowagCode,
      supplierPartNumber,
      supplier,
      description,
      unit,
      costEach,
      sellPrice,
      raw,
    });
  }

  return {
    headers,
    columnMapping,
    rows,
    errors,
    warnings,
  };
}
