import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import {
  SCOPE_MAX_CHARACTERS,
  getScopeCapacityStatus,
  estimateScopeLastRowHeight,
} from "@/lib/scope/capacity";

const REFERENCE_WORKBOOK_PATH = path.join(
  process.cwd(),
  "data/fixtures/114693 - TANK INSTALL - CRAIG LAWSON.xlsx"
);

const referenceWorkbookAvailable = fs.existsSync(REFERENCE_WORKBOOK_PATH);

describe("scope capacity", () => {
  it.skipIf(!referenceWorkbookAvailable)(
    "matches the original 114693 sample scope as within limit",
    async () => {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(REFERENCE_WORKBOOK_PATH);
      const sheet = wb.getWorksheet("Quotation")!;
      const cell = sheet.getCell("A70").value;
      const text =
        cell && typeof cell === "object" && "richText" in cell
          ? cell.richText.map((r) => r.text).join("")
          : String(cell ?? "");

      expect(text.length).toBe(SCOPE_MAX_CHARACTERS);
      const status = getScopeCapacityStatus(text);
      expect(status.isOverLimit).toBe(false);
      expect(estimateScopeLastRowHeight(text)).toBe(96);
    }
  );

  it("flags text over the character cap", () => {
    const status = getScopeCapacityStatus("x".repeat(SCOPE_MAX_CHARACTERS + 1));
    expect(status.isOverLimit).toBe(true);
  });

  it("expands last row height when over limit", () => {
    const over = "x".repeat(SCOPE_MAX_CHARACTERS + 200);
    expect(getScopeCapacityStatus(over).isOverLimit).toBe(true);
    expect(estimateScopeLastRowHeight(over)).toBeGreaterThanOrEqual(96);
  });
});

describe("scope capacity file availability", () => {
  it.skipIf(!referenceWorkbookAvailable)("has the reference workbook available locally", () => {
    expect(fs.existsSync(REFERENCE_WORKBOOK_PATH)).toBe(true);
  });
});
