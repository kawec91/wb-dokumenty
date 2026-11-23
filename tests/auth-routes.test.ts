import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as login } from "@/app/api/auth/login/route";
import { GET as callback } from "@/app/api/auth/callback/route";
import { resetEnvForTests } from "@/lib/env";
import { OAUTH_ATTEMPT_COOKIE, openOAuthAttempt, sealOAuthAttempt } from "@/lib/oauth-attempt";
import { pkceChallenge } from "@/lib/wb-auth";

const mocks = vi.hoisted(() => ({
  findMembership: vi.fn(),
  findInvitation: vi.fn(),
  transaction: vi.fn(),
  exchangeCode: vi.fn(),
  verifyAccessToken: vi.fn(),
  userInfo: vi.fn(),
  createPortalSession: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    applicationMembership: { findUnique: mocks.findMembership },
    applicationInvitation: { findFirst: mocks.findInvitation },
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/wb-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/wb-auth")>();
  return {
    ...actual,
    exchangeCode: mocks.exchangeCode,
    verifyAccessToken: mocks.verifyAccessToken,
    userInfo: mocks.userInfo,
  };
});

vi.mock("@/lib/portal-session", () => ({
  PORTAL_COOKIE: "wb_docs_session",
  createPortalSession: mocks.createPortalSession,
}));

const tenantId = "10000000-0000-4000-8000-000000000001";
const userId = "20000000-0000-4000-8000-000000000001";
const sessionId = "30000000-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.WB_AUTH_TENANT_ID = tenantId;
  resetEnvForTests();
});

describe("OAuth route handlers", () => {
  it("GET /api/auth/login redirects to WB Auth and stores state with the PKCE verifier", async () => {
    const response = await login(new NextRequest("http://localhost:3000/api/auth/login?returnTo=/admin/documents"));

    expect(response.status).toBe(302);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const location = new URL(response.headers.get("location")!);
    expect(location.origin + location.pathname).toBe("https://auth.example.test/api/oauth/authorize");
    expect(Object.fromEntries(location.searchParams)).toMatchObject({
      response_type: "code",
      client_id: "wb-dokumenty",
      redirect_uri: "http://localhost:3000/api/auth/callback",
      code_challenge_method: "S256",
      tenant_id: tenantId,
    });

    const cookie = response.cookies.get(OAUTH_ATTEMPT_COOKIE);
    expect(cookie).toMatchObject({ name: OAUTH_ATTEMPT_COOKIE, path: "/api/auth/callback" });
    expect(cookie?.value).toBeTruthy();
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=lax");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=600");

    const attempt = await openOAuthAttempt(cookie!.value);
    expect(attempt).toMatchObject({ state: location.searchParams.get("state"), returnTo: "/admin/documents", tenantId });
    expect(location.searchParams.get("code_challenge")).toBe(pkceChallenge(attempt.verifier));
  });

  it("accepts a valid callback, exchanges the stored verifier and rotates OAuth into a portal session", async () => {
    const state = "state-value-with-enough-length";
    const verifier = "v".repeat(64);
    const code = "authorization-code-value";
    const attempt = await sealOAuthAttempt({ state, verifier, returnTo: "/admin", tenantId });
    mocks.exchangeCode.mockResolvedValue({ access_token: "a".repeat(24), refresh_token: "r".repeat(24), expires_in: 900, token_type: "Bearer" });
    mocks.verifyAccessToken.mockResolvedValue({ sub: userId, sid: sessionId, azp: "wb-dokumenty", tid: tenantId });
    mocks.userInfo.mockResolvedValue({ sub: userId, email: "admin@whitebull.test", email_verified: true, tenant_id: tenantId, name: "Admin" });
    mocks.findMembership.mockResolvedValue({ id: "membership", status: "ACTIVE" });
    mocks.createPortalSession.mockResolvedValue("portal-session-token");

    const request = new NextRequest(`http://localhost:3000/api/auth/callback?code=${code}&state=${state}`, {
      headers: { cookie: `${OAUTH_ATTEMPT_COOKIE}=${attempt}` },
    });
    const response = await callback(request);

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("http://localhost:3000/admin");
    expect(mocks.exchangeCode).toHaveBeenCalledWith(code, verifier);
    expect(mocks.createPortalSession).toHaveBeenCalledWith(expect.objectContaining({ access_token: "a".repeat(24) }), { sub: userId, tenantId, sid: sessionId });
    expect(response.cookies.get("wb_docs_session")).toMatchObject({ value: "portal-session-token", path: "/" });
    expect(response.cookies.get(OAUTH_ATTEMPT_COOKIE)).toMatchObject({ value: "", path: "/api/auth/callback" });
    const setCookies = response.headers.getSetCookie();
    expect(setCookies).toHaveLength(2);
    expect(setCookies.join("\n")).toContain("Max-Age=28800");
    expect(setCookies.join("\n")).toContain("Max-Age=0");
  });

  it("rejects a callback with a different state before exchanging the authorization code", async () => {
    const attempt = await sealOAuthAttempt({
      state: "expected-state-value",
      verifier: "v".repeat(64),
      returnTo: "/admin",
      tenantId,
    });
    const request = new NextRequest("http://localhost:3000/api/auth/callback?code=authorization-code-value&state=different-state-value", {
      headers: { cookie: `${OAUTH_ATTEMPT_COOKIE}=${attempt}` },
    });

    const response = await callback(request);

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("http://localhost:3000/auth/error?code=invalid_state");
    expect(response.cookies.get(OAUTH_ATTEMPT_COOKIE)).toMatchObject({ value: "", path: "/api/auth/callback" });
    expect(mocks.exchangeCode).not.toHaveBeenCalled();
  });
});
