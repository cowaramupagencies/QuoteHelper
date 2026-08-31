import { NextResponse } from "next/server";
import { getQuote } from "@/lib/db/repository";
import { previewQuotePriceRefresh } from "@/lib/quote/refresh-prices";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const quote = getQuote(id);
  if (!quote) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(previewQuotePriceRefresh(quote));
}
