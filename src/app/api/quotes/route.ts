import { NextResponse } from "next/server";
import { listQuotes, saveQuote, deleteQuote, generateQuoteNumber } from "@/lib/db/repository";
import { cloneTemplateOptions } from "@/lib/templates/clone-options";
import { v4 as uuidv4 } from "uuid";
import type { Quote } from "@/types";

export async function GET() {
  return NextResponse.json(listQuotes(50));
}

export async function POST(request: Request) {
  const body = await request.json();
  const now = new Date().toISOString();
  const quote: Quote = {
    id: uuidv4(),
    quoteNumber: body.quoteNumber || generateQuoteNumber(),
    quoteDate: body.quoteDate || now.slice(0, 10),
    status: "draft",
    templateId: body.templateId,
    templateName: body.templateName,
    customer: body.customer || { name: "" },
    delivery: body.delivery || {},
    scopeText: body.scopeText || "",
    customerPricingMode: body.customerPricingMode || "itemised",
    options: body.options?.length ? cloneTemplateOptions(body.options) : [],
    createdAt: now,
    updatedAt: now,
  };
  return NextResponse.json(saveQuote(quote), { status: 201 });
}

export async function PUT(request: Request) {
  const quote = (await request.json()) as Quote;
  return NextResponse.json(saveQuote(quote));
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  deleteQuote(id);
  return NextResponse.json({ ok: true });
}
