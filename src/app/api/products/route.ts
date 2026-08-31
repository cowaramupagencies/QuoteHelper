import { NextResponse } from "next/server";
import { searchProducts, listProducts, saveProduct } from "@/lib/db/repository";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");
  const limit = parseInt(searchParams.get("limit") || "20", 10);

  if (q) {
    const mode = searchParams.get("mode") === "code" ? "code" : "all";
    return NextResponse.json(searchProducts(q, limit, mode));
  }
  const offset = parseInt(searchParams.get("offset") || "0", 10);
  return NextResponse.json(listProducts(limit, offset));
}

export async function POST(request: Request) {
  const body = await request.json();
  const product = saveProduct({
    type: body.type || "supplier",
    cowagCode: body.cowagCode,
    supplier: body.supplier,
    supplierPartNumber: body.supplierPartNumber,
    description: body.description,
    unit: body.unit || "EACH",
    sellPrice: body.sellPrice,
    costEach: body.costEach,
    source: body.source || "Manual entry",
  });
  return NextResponse.json(product, { status: 201 });
}
