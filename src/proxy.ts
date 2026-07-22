import { auth } from "@/auth";
import { NextResponse } from "next/server";

const roleHome: Record<string, string> = {
  ADMIN: "/admin",
  EVALUATOR: "/evaluate",
  EMPLOYEE: "/my-evaluations",
};

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  if (pathname === "/login") {
    if (session?.user) {
      return NextResponse.redirect(new URL(roleHome[session.user.role], req.nextUrl));
    }
    return NextResponse.next();
  }

  if (!session?.user) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  const role = session.user.role;

  if (pathname.startsWith("/admin") && role !== "ADMIN") {
    return NextResponse.redirect(new URL(roleHome[role], req.nextUrl));
  }
  if (pathname.startsWith("/evaluate") && role !== "EVALUATOR") {
    return NextResponse.redirect(new URL(roleHome[role], req.nextUrl));
  }
  if (pathname.startsWith("/my-evaluations") && role !== "EMPLOYEE") {
    return NextResponse.redirect(new URL(roleHome[role], req.nextUrl));
  }

  if (pathname === "/") {
    return NextResponse.redirect(new URL(roleHome[role], req.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:jpg|jpeg|png|svg|gif|webp|ico)$).*)",
  ],
};
