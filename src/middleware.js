import { NextResponse } from "next/navigation";

export function middleware(request) {
  const { pathname } = request.nextUrl;
  const userAgent = request.headers.get("user-agent") || "";
  const isMobileUser = /android|iphone|ipad|ipod|mobile/i.test(userAgent);

  // Jika user membuka root "/" atau dashboard usage dari browser mobile Android dan belum ada cookie preferensi desktop
  const forceDesktop = request.cookies.get("pref_desktop")?.value === "1";

  if (isMobileUser && !forceDesktop) {
    if (pathname === "/" || pathname === "/dashboard" || pathname === "/dashboard/usage") {
      return NextResponse.redirect(new URL("/m/usage", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/dashboard", "/dashboard/usage"],
};
