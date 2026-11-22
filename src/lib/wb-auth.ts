import { createHash } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { z } from "zod";
import { env } from "@/lib/env";
import { HttpError } from "@/lib/security";

export const tokenSchema = z.union([
  z.object({ access_token: z.string().min(20), refresh_token: z.string().min(20).optional(), expires_in: z.number().int().positive(), token_type: z.string().default("Bearer") }),
  z.object({ accessToken: z.string().min(20), refreshToken: z.string().min(20).optional(), expiresIn: z.number().int().positive(), tokenType: z.string().default("Bearer") }),
]).transform((value) => "access_token" in value ? value : ({ access_token: value.accessToken, refresh_token: value.refreshToken, expires_in: value.expiresIn, token_type: value.tokenType }));
export const userInfoSchema = z.object({ sub: z.string().uuid(), email: z.string().email(), email_verified: z.boolean(), tenant_id: z.string().uuid().nullable(), name: z.string().optional() });
export type WbTokens = z.infer<typeof tokenSchema>;
export interface AccessClaims extends JWTPayload { sub: string; sid: string; azp: string; tid?: string }
export const pkceChallenge = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

export function authorizationUrl(input: { state: string; challenge: string; tenantId?: string }) {
  const url = new URL("/api/oauth/authorize", env().WB_AUTH_BASE_URL);
  Object.entries({ response_type: "code", client_id: env().WB_AUTH_CLIENT_ID, redirect_uri: env().WB_AUTH_REDIRECT_URI, code_challenge: input.challenge, code_challenge_method: "S256", state: input.state, tenant_id: input.tenantId }).forEach(([key, value]) => { if (value) url.searchParams.set(key, value); });
  return url;
}

async function authFetch(path: string, init: RequestInit) {
  try { return await fetch(new URL(path, env().WB_AUTH_BASE_URL), { ...init, cache: "no-store", signal: AbortSignal.timeout(env().WB_AUTH_TIMEOUT_MS), headers: { Accept: "application/json", ...init.headers } }); }
  catch { throw new HttpError(503, "AUTH_UNAVAILABLE", "WB Auth jest chwilowo niedostępny."); }
}

export async function exchangeCode(code: string, verifier: string) {
  const body = new URLSearchParams({ grant_type: "authorization_code", code, client_id: env().WB_AUTH_CLIENT_ID, redirect_uri: env().WB_AUTH_REDIRECT_URI, code_verifier: verifier });
  if (env().WB_AUTH_CLIENT_SECRET) body.set("client_secret", env().WB_AUTH_CLIENT_SECRET);
  const response = await authFetch("/api/oauth/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (!response.ok) throw new HttpError(401, "AUTH_EXCHANGE_FAILED", "Logowanie nie powiodło się.");
  return tokenSchema.parse(await response.json());
}

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;
export async function verifyAccessToken(token: string) {
  jwks ??= createRemoteJWKSet(new URL("/.well-known/jwks.json", env().WB_AUTH_ISSUER));
  const { payload } = await jwtVerify(token, jwks, { algorithms: ["EdDSA"], issuer: env().WB_AUTH_ISSUER, audience: env().WB_AUTH_AUDIENCE });
  if (!payload.sub || typeof payload.sid !== "string" || payload.azp !== env().WB_AUTH_CLIENT_ID) throw new HttpError(401, "INVALID_TOKEN", "Sesja WB Auth jest nieprawidłowa.");
  return payload as AccessClaims;
}

export async function userInfo(token: string) {
  const response = await authFetch("/api/userinfo", { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new HttpError(401, "INVALID_IDENTITY", "Nie można potwierdzić tożsamości.");
  return userInfoSchema.parse(await response.json());
}

export async function wbAuthApi(path: string, token: string, init: RequestInit = {}) {
  const response = await authFetch(path, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Correlation-Id": crypto.randomUUID(), ...init.headers } });
  if (!response.ok) throw new HttpError(response.status, "WB_AUTH_REJECTED", "WB Auth odrzucił operację.");
  return response;
}
