import { NextResponse } from "next/server";
import { getQuote } from "@/lib/db/repository";
import { generateQuoteWorkbook } from "@/lib/excel/generate-workbook";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const quote = await getQuote(id);
  if (!quote) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const buffer = await generateQuoteWorkbook(quote);
  const filename = `${quote.quoteNumber} - ${quote.customer.name || "Quote"}.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
    },
  });
}
