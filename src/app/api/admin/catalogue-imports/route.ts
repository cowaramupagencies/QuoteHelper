import { NextResponse } from "next/server";
import { getAdminCatalogueImportsOverview } from "@/lib/db/catalogue-imports";

export async function GET() {
  return NextResponse.json(getAdminCatalogueImportsOverview());
}
