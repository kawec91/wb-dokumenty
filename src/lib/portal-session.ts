import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { randomToken, sha256, HttpError } from "@/lib/security";
import { rotateRefreshToken, verifyAccessToken, type WbTokens } from "@/lib/wb-auth";

export const PORTAL_COOKIE = "wb_docs_session";
const key = () => createHash("sha256").update(`${env().SESSION_SECRET}:tokens`).digest();
export function encrypt(value: string) { const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", key(), iv); const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]); return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url"); }
export function decrypt(value: string) { const data = Buffer.from(value, "base64url"); const decipher = createDecipheriv("aes-256-gcm", key(), data.subarray(0, 12)); decipher.setAuthTag(data.subarray(12, 28)); return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString("utf8"); }

export async function createPortalSession(tokens: WbTokens, identity: { sub: string; tenantId: string; sid: string }) {
  const token = randomToken(); const now = Date.now();
  await db.portalSession.create({ data: { tokenHash: sha256(token), wbAuthSessionId: identity.sid, wbAuthUserId: identity.sub, tenantId: identity.tenantId, accessTokenEncrypted: encrypt(tokens.access_token), refreshTokenEncrypted: tokens.refresh_token ? encrypt(tokens.refresh_token) : null, accessTokenExpiresAt: new Date(now + tokens.expires_in * 1000), expiresAt: new Date(now + 8 * 60 * 60_000) } });
  return token;
}

export async function requirePortalSession(request: NextRequest) {
  const token = request.cookies.get(PORTAL_COOKIE)?.value;
  if (!token) throw new HttpError(401, "LOGIN_REQUIRED", "Zaloguj się przez WB Auth.");
  return portalContext(token);
}

export async function portalContext(token: string) {
  let session = await db.portalSession.findUnique({ where: { tokenHash: sha256(token) } });
  if (!session || session.expiresAt <= new Date()) throw new HttpError(401, "SESSION_EXPIRED", "Sesja wygasła.");
  if (session.accessTokenExpiresAt.getTime() <= Date.now() + 60_000) {
    session = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`portal:${session!.id}`})) IS NULL AS acquired`;
      const current = await tx.portalSession.findUnique({ where: { id: session!.id } });
      if (!current || current.expiresAt <= new Date()) throw new HttpError(401, "SESSION_EXPIRED", "Sesja wygasła.");
      if (current.accessTokenExpiresAt.getTime() > Date.now() + 60_000) return current;
      if (!current.refreshTokenEncrypted) throw new HttpError(401, "SESSION_EXPIRED", "Sesja WB Auth wygasła.");
      const tokens = await rotateRefreshToken(decrypt(current.refreshTokenEncrypted)); const claims = await verifyAccessToken(tokens.access_token);
      if (claims.sub !== current.wbAuthUserId || claims.sid !== current.wbAuthSessionId || claims.tid !== current.tenantId) throw new HttpError(401, "SESSION_MISMATCH", "Odświeżona sesja jest niespójna.");
      return tx.portalSession.update({ where: { id: current.id }, data: { accessTokenEncrypted: encrypt(tokens.access_token), refreshTokenEncrypted: tokens.refresh_token ? encrypt(tokens.refresh_token) : current.refreshTokenEncrypted, accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000) } });
    });
  }
  const membership = await db.applicationMembership.findUnique({ where: { wbAuthUserId_tenantId: { wbAuthUserId: session.wbAuthUserId, tenantId: session.tenantId } }, include: { permissions: true, entities: true } });
  if (!membership || membership.status !== "ACTIVE") throw new HttpError(403, "ACCESS_REVOKED", "Brak aktywnego dostępu do WB Dokumenty.");
  return { session, membership, accessToken: decrypt(session.accessTokenEncrypted), permissions: new Set(membership.permissions.map((item) => item.permission)), entityIds: new Set(membership.entities.map((item) => item.entityId)) };
}

export function requirePermission(context: Awaited<ReturnType<typeof requirePortalSession>>, permission: Parameters<typeof context.permissions.has>[0], entityId?: string) {
  if (!context.permissions.has(permission)) throw new HttpError(403, "PERMISSION_DENIED", "Brak uprawnienia do tej operacji.");
  if (entityId && !context.entityIds.has(entityId)) throw new HttpError(403, "ENTITY_DENIED", "Brak dostępu do tego podmiotu.");
}
