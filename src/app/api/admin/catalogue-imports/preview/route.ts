import { NextResponse } from "next/server";
import { previewCatalogueImport } from "@/lib/catalogue/import-preview";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    const categoryId = String(form.get("categoryId") ?? "").trim();
    const csvTextField = form.get("csvText");

    if (!categoryId) {
      return NextResponse.json({ error: "categoryId is required" }, { status: 400 });
    }

    let csvText = "";
    let originalFilename = "preview.csv";

    if (file instanceof File) {
      csvText = await file.text();
      originalFilename = file.name;
    } else if (typeof csvTextField === "string" && csvTextField.trim()) {
      csvText = csvTextField;
      const nameField = form.get("filename");
      if (typeof nameField === "string" && nameField.trim()) {
        originalFilename = nameField.trim();
      }
    } else {
      return NextResponse.json({ error: "CSV file or csvText is required" }, { status: 400 });
    }

    const preview = await previewCatalogueImport({ categoryId, originalFilename, csvText });
    return NextResponse.json(preview);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Preview failed" },
      { status: 500 }
    );
  }
}
