import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import { generateQuoteWorkbook } from "@/lib/excel/generate-workbook";
import type { Quote } from "@/types";

const sampleQuote: Quote = {
  id: "test",
  quoteNumber: "114693",
  quoteDate: "2026-08-10",
  status: "draft",
  templateName: "Steel Tank Install",
  customer: { name: "Craig Lawson", email: "test@example.com", mobile: "0400000000" },
  delivery: { address: "899 Metricup Road", suburb: "Wilyabrup", startDate: "TBC" },
  scopeText: "Supply & Installation of Kingspan Steel Water Tank\n\n- Sand pad included\n- Plumbing excluded",
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
              description: "RT60 - ZINCALUME",
              quantity: 1,
              costEach: 8721.82,
              sellEach: 9690.91,
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

async function readGeneratedWorkbook(quote: Quote) {
  const buffer = await generateQuoteWorkbook(quote);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook;
}

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "object" && "richText" in value) {
    return value.richText.map((r) => r.text).join("");
  }
  if (typeof value === "object" && "text" in value) return String(value.text);
  return String(value);
}

describe("excel generation", () => {
  it("generates a workbook buffer from the canonical template", async () => {
    const templatePath = path.join(process.cwd(), "data/templates/quotation-template.xlsx");
    expect(fs.existsSync(templatePath)).toBe(true);

    const buffer = await generateQuoteWorkbook(sampleQuote);
    expect(buffer.length).toBeGreaterThan(1000);
    expect(buffer.subarray(0, 2).toString()).toBe("PK");
  });

  it("writes scope text into a single merged scope box", async () => {
    const workbook = await readGeneratedWorkbook(sampleQuote);
    const sheet = workbook.getWorksheet("Quotation")!;
    const merges = sheet.model.merges ?? [];
    expect(merges).toContain("A70:L82");

    const scopeText = cellText(sheet.getCell("A70").value);
    expect(scopeText).toContain("Supply & Installation of Kingspan Steel Water Tank");
    expect(scopeText).toContain("Sand pad included");
    expect(scopeText).toContain("Plumbing excluded");
    expect(sheet.getCell("A70").alignment?.wrapText).toBe(true);
  });

  it("hides the scope section when scope text is empty", async () => {
    const workbook = await readGeneratedWorkbook({ ...sampleQuote, scopeText: "" });
    const sheet = workbook.getWorksheet("Quotation")!;
    expect(sheet.getRow(68).hidden).toBe(true);
    expect(sheet.getRow(83).hidden).toBe(true);
  });

  it("clears styling from hidden BOM template rows", async () => {
    const workbook = await readGeneratedWorkbook(sampleQuote);
    const bom = workbook.getWorksheet("Job BOM")!;

    expect(cellText(bom.getCell("F6").value)).toBe("Option 1 - RT60");
    expect(cellText(bom.getCell("F8").value)).toBe("RT60 - ZINCALUME");
    expect(cellText(bom.getCell("F9").value)).toContain("section total");
    expect(cellText(bom.getCell("F10").value)).toContain("option total");

    for (let r = 13; r <= 27; r++) {
      expect(bom.getRow(r).hidden).toBe(true);
      const fill = bom.getCell(`F${r}`).fill as ExcelJS.Fill | undefined;
      expect(fill?.type === "pattern" ? fill.pattern : fill?.type).toBe("none");
    }

    expect(cellText(bom.getCell("F6").value)).toBe("Option 1 - RT60");
  });

  it("hides unused pricing rows below quoted options", async () => {
    const workbook = await readGeneratedWorkbook(sampleQuote);
    const sheet = workbook.getWorksheet("Quotation")!;
    expect(sheet.getRow(90).hidden).toBe(true);
    expect(sheet.getRow(95).hidden).toBe(true);
  });

  it("writes current option pricing on the quotation sheet", async () => {
    const workbook = await readGeneratedWorkbook(sampleQuote);
    const sheet = workbook.getWorksheet("Quotation")!;
    expect(cellText(sheet.getCell("A87").value)).toBe("Option 1 - RT60");
    expect(cellText(sheet.getCell("A88").value)).toBe("Tank");
  });

  it("supports single-total customer pricing mode", async () => {
    const workbook = await readGeneratedWorkbook({
      ...sampleQuote,
      customerPricingMode: "single_total",
    });
    const sheet = workbook.getWorksheet("Quotation")!;
    expect(cellText(sheet.getCell("A87").value)).toBe("Option 1 - RT60");
    expect(cellText(sheet.getCell("A88").value)).toBe("Option 1 - RT60 Total");
  });
});
