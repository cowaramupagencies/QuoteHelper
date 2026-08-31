import { NextResponse } from "next/server";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import {
  clearProducts,
  countProducts,
  getPriceListMeta,
  importCowagProducts,
} from "@/lib/db/repository";

const PDF_PATH = path.join(
  process.cwd(),
  "data/price-lists/Current Price List - To Save on Desktop.pdf"
);
const SEED_PATH = path.join(process.cwd(), "data/cowag-catalogue-seed.json");
const SOURCE_FILE = "Current Price List - To Save on Desktop.pdf";

function loadParsedItems() {
  if (!fs.existsSync(SEED_PATH)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(SEED_PATH, "utf-8")) as Array<{
    cowagCode: string;
    description: string;
    unit: string;
    sellPrice: number | null;
    source: string;
  }>;
}

function parsePdfToSeed() {
  if (!fs.existsSync(PDF_PATH)) {
    throw new Error("Price list PDF not found in data/price-lists/");
  }
  execSync(
    `python3 "${path.join(process.cwd(), "scripts/parse-price-list-pdf.py")}" "${PDF_PATH}"`,
    { stdio: "pipe" }
  );
  return loadParsedItems();
}

export async function GET() {
  const meta = await getPriceListMeta();
  return NextResponse.json({
    meta: meta
      ? {
          sourceFile: meta.source_file,
          lastUpdated: meta.last_updated,
          productCount: meta.product_count,
        }
      : null,
    currentCount: await countProducts(),
  });
}

export async function POST(request: Request) {
  const body = await request.json();

  if (body.action === "seed") {
    try {
      const items = parsePdfToSeed();
      if (!items?.length) {
        return NextResponse.json({ error: "No products parsed from PDF" }, { status: 500 });
      }
      await clearProducts();
      const summary = await importCowagProducts(items, SOURCE_FILE);
      return NextResponse.json({ ...summary, productCount: items.length });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Import failed";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  if (body.action === "import" && body.items) {
    await clearProducts();
    const summary = await importCowagProducts(body.items, body.sourceFile || "Imported price list");
    return NextResponse.json(summary);
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
