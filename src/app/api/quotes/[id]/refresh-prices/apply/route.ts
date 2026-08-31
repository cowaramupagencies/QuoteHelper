import { NextResponse } from "next/server";
import { getQuote, saveQuote } from "@/lib/db/repository";
import { applyQuotePriceRefresh, previewQuotePriceRefresh } from "@/lib/quote/refresh-prices";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const quote = await getQuote(id);
  if (!quote) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const preview = await previewQuotePriceRefresh(quote);
  if (preview.summary.wouldUpdate === 0) {
    return NextResponse.json({ quote, preview });
  }

  const updated = await applyQuotePriceRefresh(quote);
  await saveQuote(updated);

  return NextResponse.json({
    quote: updated,
    preview,
  });
}
