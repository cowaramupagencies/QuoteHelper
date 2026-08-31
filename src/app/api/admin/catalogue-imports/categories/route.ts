import { NextResponse } from "next/server";
import { createCatalogueCategory, getAdminCatalogueImportsOverview } from "@/lib/db/catalogue-imports";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const category = await createCatalogueCategory(name);
    return NextResponse.json(
      {
        category,
        overview: await getAdminCatalogueImportsOverview(),
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create category" },
      { status: 500 }
    );
  }
}
