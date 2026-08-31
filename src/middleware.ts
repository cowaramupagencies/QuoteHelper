import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  getAdminSessionCookieName,
  isAdminLoginPath,
  isAdminProtectedPath,
  verifyAdminSessionToken,
} from "@/lib/admin-auth";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!isAdminProtectedPath(pathname) || isAdminLoginPath(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(getAdminSessionCookieName())?.value;
  const authenticated = await verifyAdminSessionToken(token);

  if (!authenticated) {
    if (pathname.startsWith("/api/admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/admin/login";
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
