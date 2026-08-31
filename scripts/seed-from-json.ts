import fs from "fs";
import path from "path";
import { clearProducts, importCowagProducts } from "@/lib/db/repository";

const SEED_PATH = path.join(process.cwd(), "data/cowag-catalogue-seed.json");
const SOURCE_FILE = "cowag-catalogue-seed.json";

async function main() {
  if (!fs.existsSync(SEED_PATH)) {
    console.error("Seed file not found:", SEED_PATH);
    process.exit(1);
  }

  const items = JSON.parse(fs.readFileSync(SEED_PATH, "utf-8")) as Array<{
    cowagCode: string;
    description: string;
    unit: string;
    sellPrice: number | null;
    source: string;
  }>;

  console.log(`Importing ${items.length} products from ${SOURCE_FILE}…`);
  await clearProducts();
  const summary = await importCowagProducts(items, SOURCE_FILE);
  console.log("Import complete:", summary);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
