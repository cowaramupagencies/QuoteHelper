import { NextResponse } from "next/server";
import { importCatalogueCsv, activateImportBatch } from "@/lib/db/catalogue-imports";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    const categoryId = String(form.get("categoryId") ?? "").trim();
    const notes = String(form.get("notes") ?? "").trim() || undefined;
    const activate = String(form.get("activate") ?? "false") === "true";

    if (!categoryId) {
      return NextResponse.json({ error: "categoryId is required" }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "CSV file is required" }, { status: 400 });
    }

    const csvText = await file.text();
    const batch = importCatalogueCsv({
      categoryId,
      originalFilename: file.name,
      csvText,
      notes,
    });

    if (activate && batch.status === "imported") {
      const activated = activateImportBatch(batch.id);
      return NextResponse.json(activated, { status: 201 });
    }

    return NextResponse.json(batch, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 }
    );
  }
}
