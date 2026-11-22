import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { randomToken, sha256, HttpError } from "@/lib/security";

export const QUICK_COOKIE = "wb_docs_quick";

export async function createQuickSession(input: { employeeId: string; qrCodeId?: string; ipHash: string; clientHash: string }) {
  const token = randomToken(); const expiresAt = new Date(Date.now() + 30 * 60_000);
  await db.deviceSession.create({ data: { tokenHash: sha256(token), employeeId: input.employeeId, qrCodeId: input.qrCodeId, ipHash: input.ipHash, clientHash: input.clientHash, expiresAt } });
  return { token, expiresAt };
}

export async function quickSession(request: NextRequest) {
  const token = request.cookies.get(QUICK_COOKIE)?.value;
  if (!token) throw new HttpError(401, "SESSION_REQUIRED", "Wpisz ponownie numer telefonu.");
  const session = await db.deviceSession.findUnique({ where: { tokenHash: sha256(token) }, include: { employee: { include: { entities: { include: { entity: true } } } } } });
  if (!session || session.expiresAt <= new Date() || session.employee.status !== "ACTIVE") throw new HttpError(401, "SESSION_EXPIRED", "Sesja wygasła. Wpisz ponownie numer telefonu.");
  return session;
}

export async function clearQuickCookie() {
  const store = await cookies(); store.delete(QUICK_COOKIE);
}
