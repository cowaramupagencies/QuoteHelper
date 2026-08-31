import ExcelJS from "exceljs";
import { generateQuoteWorkbook } from "../src/lib/excel/generate-workbook";
import type { Quote } from "../src/types";

async function inspect(quote: Quote, label: string) {
  const buf = await generateQuoteWorkbook(quote);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const q = wb.getWorksheet("Quotation")!;
  const b = wb.getWorksheet("Job BOM")!;

  console.log(`\n=== ${label} ===`);
  console.log("SCOPE rows 68-85:");
  for (let r = 68; r <= 85; r++) {
    const hidden = q.getRow(r).hidden;
    const a = q.getCell(`A${r}`).value;
    console.log(`  ${r} hidden=${hidden} A=${JSON.stringify(a)}`);
  }

  console.log("BOM rows 6-15:");
  for (let r = 6; r <= 15; r++) {
    const hidden = b.getRow(r).hidden;
    const f = b.getCell(`F${r}`).value;
    const fill = b.getCell(`F${r}`).fill as ExcelJS.Fill | undefined;
    const fg =
      fill?.type === "pattern" ? JSON.stringify((fill as ExcelJS.FillPattern).fgColor) : "-";
    console.log(`  ${r} hidden=${hidden} F=${JSON.stringify(f)} fill=${fg}`);
  }
}

const base: Quote = {
  id: "test",
  quoteNumber: "114556",
  quoteDate: "2026-08-11",
  status: "draft",
  templateName: "Steel Tank Install",
  customer: { name: "Craig Lawson" },
  delivery: { startDate: "TBC" },
  scopeText: "",
  options: [
    {
      id: "o1",
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

async function main() {
  await inspect(base, "empty scope");
  await inspect(
    {
      ...base,
      scopeText:
        "Supply & Installation of Kingspan Steel Water Tank\n\n- Sand pad included\n- Plumbing excluded",
    },
    "with scope"
  );
}

main();
