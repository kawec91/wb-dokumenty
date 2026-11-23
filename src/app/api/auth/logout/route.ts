import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { PORTAL_COOKIE } from "@/lib/portal-session";
import { assertSameOrigin, sha256 } from "@/lib/security";

export async function POST(request: NextRequest) {
  assertSameOrigin(request);
  const token = request.cookies.get(PORTAL_COOKIE)?.value;
  if (token) await db.portalSession.deleteMany({ where: { tokenHash: sha256(token) } });
  const response = NextResponse.redirect(new URL("/", env().APP_URL), 303);
  response.cookies.set(PORTAL_COOKIE, "", { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 0 });
  return response;
}
