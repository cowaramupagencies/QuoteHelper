import { NextResponse } from "next/server";
import { activateImportBatch } from "@/lib/db/catalogue-imports";

export async function POST(
  _: Request,
  { params }: { params: Promise<{ batchId: string }> }
) {
  try {
    const { batchId } = await params;
    const batch = activateImportBatch(batchId);
    return NextResponse.json(batch);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Activation failed" },
      { status: 400 }
    );
  }
}
