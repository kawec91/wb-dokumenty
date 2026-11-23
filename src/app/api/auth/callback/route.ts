import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { OAUTH_ATTEMPT_COOKIE, oauthAttemptCookieOptions, openOAuthAttempt } from "@/lib/oauth-attempt";
import { createPortalSession, PORTAL_COOKIE } from "@/lib/portal-session";
import { safeEqual } from "@/lib/security";
import { exchangeCode, userInfo, verifyAccessToken } from "@/lib/wb-auth";

const querySchema = z.object({ code: z.string().min(20), state: z.string().min(8) });
function failure(code: string) {
  const url = new URL("/auth/error", env().APP_URL);
  url.searchParams.set("code", code);
  const response = NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "no-store" } });
  response.cookies.set(OAUTH_ATTEMPT_COOKIE, "", oauthAttemptCookieOptions(0));
  return response;
}

export async function GET(request: NextRequest) {
  try {
    const input = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams)); const sealed = request.cookies.get(OAUTH_ATTEMPT_COOKIE)?.value; if (!sealed) return failure("missing_attempt");
    const attempt = await openOAuthAttempt(sealed); if (!safeEqual(input.state, attempt.state)) return failure("invalid_state");
    const tokens = await exchangeCode(input.code, attempt.verifier); const [claims, identity] = await Promise.all([verifyAccessToken(tokens.access_token), userInfo(tokens.access_token)]);
    const tenantId = claims.tid; if (!tenantId || identity.tenant_id !== tenantId || claims.sub !== identity.sub || (attempt.tenantId && tenantId !== attempt.tenantId)) return failure("identity_mismatch");
    let membership = await db.applicationMembership.findUnique({ where: { wbAuthUserId_tenantId: { wbAuthUserId: claims.sub, tenantId } } });
    if (!membership) {
      const invitation = await db.applicationInvitation.findFirst({ where: { tenantId, email: identity.email.toLowerCase(), status: "PENDING" }, orderBy: { createdAt: "desc" } });
      if (!invitation) return failure("application_access_required");
      membership = await db.$transaction(async (tx) => {
        const created = await tx.applicationMembership.create({ data: { wbAuthUserId: claims.sub, tenantId, email: identity.email.toLowerCase(), displayName: identity.name, roleTemplate: invitation.roleTemplate, status: "ACTIVE", permissions: { create: invitation.plannedPermissions.map((permission) => ({ permission })) }, entities: { create: invitation.plannedEntityIds.map((entityId) => ({ entityId })) } } });
        await tx.applicationInvitation.update({ where: { id: invitation.id }, data: { membershipId: created.id, status: "ACCEPTED" } }); return created;
      });
    }
    if (membership.status !== "ACTIVE") return failure("application_access_revoked");
    const token = await createPortalSession(tokens, { sub: claims.sub, tenantId, sid: claims.sid });
    const response = NextResponse.redirect(new URL(attempt.returnTo, env().APP_URL), { status: 302, headers: { "Cache-Control": "no-store" } });
    response.cookies.set(PORTAL_COOKIE, token, { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 28_800 });
    response.cookies.set(OAUTH_ATTEMPT_COOKIE, "", oauthAttemptCookieOptions(0));
    return response;
  } catch (error) { console.error("oauth_callback_failed", error); return failure("oauth_failed"); }
}
