import { NextResponse } from "next/server";
import {
  createAdminSessionToken,
  getAdminSessionCookieOptions,
  verifyAdminPassword,
} from "@/lib/admin-auth";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const password = String(body.password ?? "");

    if (!verifyAdminPassword(password)) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }

    const token = await createAdminSessionToken();
    const response = NextResponse.json({ ok: true });
    const cookie = getAdminSessionCookieOptions(token);
    response.cookies.set(cookie);
    return response;
  } catch {
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
