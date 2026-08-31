import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { clearProducts, importCowagProducts } from "@/lib/db/repository";

const ROOT = process.cwd();
const PDF_PATH = path.join(ROOT, "data/price-lists/Current Price List - To Save on Desktop.pdf");
const SEED_PATH = path.join(ROOT, "data/cowag-catalogue-seed.json");
const SOURCE_FILE = "Current Price List - To Save on Desktop.pdf";

async function main() {
  if (!fs.existsSync(PDF_PATH)) {
    console.error("Price list PDF not found:", PDF_PATH);
    process.exit(1);
  }

  console.log("Parsing price list PDF (Sell Price 1)…");
  execSync(`python3 "${path.join(ROOT, "scripts/parse-price-list-pdf.py")}" "${PDF_PATH}"`, {
    stdio: "inherit",
  });

  if (!fs.existsSync(SEED_PATH)) {
    console.error("Parsed seed file missing:", SEED_PATH);
    process.exit(1);
  }

  const items = JSON.parse(fs.readFileSync(SEED_PATH, "utf-8")) as Array<{
    cowagCode: string;
    description: string;
    unit: string;
    sellPrice: number | null;
    source: string;
  }>;

  console.log(`Importing ${items.length} products…`);
  await clearProducts();
  const summary = await importCowagProducts(items, SOURCE_FILE);
  console.log("Import complete:", summary);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
