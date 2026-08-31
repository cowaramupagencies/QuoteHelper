import { NextResponse } from "next/server";
import { listTemplates, saveTemplate } from "@/lib/db/repository";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const kind = searchParams.get("kind") || undefined;
  return NextResponse.json(listTemplates(kind));
}

export async function POST(request: Request) {
  const body = await request.json();
  const id = saveTemplate(body);
  return NextResponse.json({ id }, { status: 201 });
}
