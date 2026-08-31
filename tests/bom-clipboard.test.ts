import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { generateQuoteWorkbook } from "@/lib/excel/generate-workbook";
import { buildJobBomExportRows, formatJobBomClipboardText } from "@/lib/excel/job-bom-rows";
import type { Quote } from "@/types";

const sampleQuote: Quote = {
  id: "test",
  quoteNumber: "114693",
  quoteDate: "2026-08-10",
  status: "draft",
  customer: { name: "Craig Lawson", customerId: "CUST1" },
  delivery: {},
  scopeText: "",
  options: [
    {
      id: "opt1",
      name: "Option 1 - RT60",
      sortOrder: 0,
      sections: [
        {
          id: "s1",
          name: "Tank",
          enabled: true,
          sortOrder: 0,
          showOnCustomerQuote: true,
          items: [
            {
              id: "i1",
              supplier: "VINIDE",
              supplierPartNumber: "35790",
              cowagPartNumber: "CA123",
              description: "PVC SOCKET VALVE 25MM",
              quantity: 2,
              costEach: 10.5,
              sellEach: 15,
              pricingState: "normal",
            },
          ],
        },
      ],
    },
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "object" && "richText" in value) {
    return value.richText.map((r) => r.text).join("");
  }
  if (typeof value === "object" && "text" in value) return String(value.text);
  return String(value);
}

describe("BOM clipboard export", () => {
  it("builds 15-column rows aligned to Excel columns A–O", () => {
    const rows = buildJobBomExportRows(sampleQuote);
    const item = rows.find((row) => row.kind === "item");
    expect(item).toBeDefined();
    expect(item!.cells).toHaveLength(15);
    expect(item!.cells[2]).toBe("VINIDE");
    expect(item!.cells[3]).toBe("35790");
    expect(item!.cells[4]).toBe("CA123");
    expect(item!.cells[5]).toBe("PVC SOCKET VALVE 25MM");
    expect(item!.cells[6]).toBe(2);
  });

  it("formats tab-separated clipboard text", () => {
    const text = formatJobBomClipboardText(sampleQuote);
    const lines = text.split("\n");
    expect(lines.length).toBeGreaterThan(3);
    const itemLine = lines.find((line) => line.includes("PVC SOCKET VALVE 25MM"));
    expect(itemLine).toBeDefined();
    const cells = itemLine!.split("\t");
    expect(cells[2]).toBe("VINIDE");
    expect(cells[3]).toBe("35790");
    expect(cells[5]).toBe("PVC SOCKET VALVE 25MM");
  });

  it("matches exported Excel Job BOM cell values from row 6", async () => {
    const buffer = await generateQuoteWorkbook(sampleQuote);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const bom = workbook.getWorksheet("Job BOM")!;

    const clipboardRows = buildJobBomExportRows(sampleQuote);
    clipboardRows.forEach((row, index) => {
      const excelRow = 6 + index;
      row.cells.forEach((expected, colIndex) => {
        const col = String.fromCharCode("A".charCodeAt(0) + colIndex);
        const actual = cellText(bom.getCell(`${col}${excelRow}`).value);
        if (expected === "" || expected == null) {
          expect(actual).toBe("");
        } else {
          expect(actual).toBe(String(expected));
        }
      });
    });
  });
});
