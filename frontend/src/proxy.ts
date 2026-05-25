import { auth } from "@/auth";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// Next.js 16: This file must export a function named 'proxy' (or default)
export async function proxy(req: NextRequest) {
  const session = await auth();
  const isLoggedIn = !!session;
  const pathname = req.nextUrl.pathname;
  const isAuthRoute = pathname.startsWith("/login");
  const isApiRoute = pathname.startsWith("/api");
  const isUploads = pathname.startsWith("/uploads");

  if (isApiRoute || isUploads) return NextResponse.next();

  if (isAuthRoute) {
    if (isLoggedIn) {
      if (session?.user?.role === "ADMIN") {
        return NextResponse.redirect(new URL("/admin", req.url));
      }
      return NextResponse.redirect(new URL("/studio", req.url));
    }
    return NextResponse.next();
  }

  if (!isLoggedIn) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|uploads|_next/static|_next/image|favicon.ico|manifest.webmanifest|.well-known|icons|RadioStudio\\.apk|RadioStudio\\.aab).*)"],
};
