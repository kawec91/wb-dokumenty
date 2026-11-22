import type { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { sealOAuthAttempt } from "@/lib/oauth-attempt";
import { authorizationUrl, pkceChallenge } from "@/lib/wb-auth";
import { randomToken } from "@/lib/security";

export async function GET(request: NextRequest) {
  const requested = request.nextUrl.searchParams.get("returnTo") ?? "/admin";
  const returnTo = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/admin";
  const state = randomToken(24); const verifier = randomToken(48); const tenantId = env().WB_AUTH_TENANT_ID || undefined;
  const sealed = await sealOAuthAttempt({ state, verifier, returnTo, tenantId });
  const response = Response.redirect(authorizationUrl({ state, challenge: pkceChallenge(verifier), tenantId }), 302);
  response.headers.append("Set-Cookie", `wb_docs_oauth=${sealed}; Path=/api/auth/callback; HttpOnly; SameSite=Lax; Max-Age=600${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
  response.headers.set("Cache-Control", "no-store"); return response;
}
