import { createHash } from "node:crypto";
import { EncryptJWT, jwtDecrypt } from "jose";
import { env } from "@/lib/env";

export const OAUTH_ATTEMPT_COOKIE = "wb_docs_oauth";

export function oauthAttemptCookieOptions(maxAge = 600) {
  return {
    path: "/api/auth/callback",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge,
  };
}

const key = () => createHash("sha256").update(`${env().SESSION_SECRET}:oauth`).digest();
export async function sealOAuthAttempt(value: { state: string; verifier: string; returnTo: string; tenantId?: string }) { return new EncryptJWT(value).setProtectedHeader({ alg: "dir", enc: "A256GCM" }).setIssuedAt().setExpirationTime("10m").encrypt(key()); }
export async function openOAuthAttempt(value: string) { const { payload } = await jwtDecrypt(value, key()); if (typeof payload.state !== "string" || typeof payload.verifier !== "string" || typeof payload.returnTo !== "string") throw new Error("Invalid OAuth attempt"); return payload as { state: string; verifier: string; returnTo: string; tenantId?: string }; }
