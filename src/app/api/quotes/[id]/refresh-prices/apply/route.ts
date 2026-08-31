import { NextResponse } from "next/server";
import { getQuote, saveQuote } from "@/lib/db/repository";
import { applyQuotePriceRefresh, previewQuotePriceRefresh } from "@/lib/quote/refresh-prices";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const quote = getQuote(id);
  if (!quote) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const preview = previewQuotePriceRefresh(quote);
  if (preview.summary.wouldUpdate === 0) {
    return NextResponse.json({ quote, preview });
  }

  const updated = applyQuotePriceRefresh(quote);
  saveQuote(updated);

  return NextResponse.json({
    quote: updated,
    preview,
  });
}
