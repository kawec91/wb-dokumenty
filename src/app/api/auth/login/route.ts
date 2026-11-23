import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { OAUTH_ATTEMPT_COOKIE, oauthAttemptCookieOptions, sealOAuthAttempt } from "@/lib/oauth-attempt";
import { authorizationUrl, pkceChallenge } from "@/lib/wb-auth";
import { randomToken } from "@/lib/security";

export async function GET(request: NextRequest) {
  const requested = request.nextUrl.searchParams.get("returnTo") ?? "/admin";
  const returnTo = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/admin";
  const state = randomToken(24); const verifier = randomToken(48); const tenantId = env().WB_AUTH_TENANT_ID || undefined;
  const sealed = await sealOAuthAttempt({ state, verifier, returnTo, tenantId });
  const response = NextResponse.redirect(
    authorizationUrl({ state, challenge: pkceChallenge(verifier), tenantId }),
    { status: 302, headers: { "Cache-Control": "no-store" } },
  );
  response.cookies.set(OAUTH_ATTEMPT_COOKIE, sealed, oauthAttemptCookieOptions());
  return response;
}
