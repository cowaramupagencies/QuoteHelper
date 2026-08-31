import { NextResponse } from "next/server";
import { listScopeClauses } from "@/lib/db/repository";

export async function GET() {
  return NextResponse.json(await listScopeClauses());
}
