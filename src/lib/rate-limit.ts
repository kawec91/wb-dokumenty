import type { Prisma, PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";

type Client = Prisma.TransactionClient | PrismaClient;

export async function consumeIdentificationAttempt(subjectHash: string, success: boolean, now = new Date(), client: Client = db) {
  await client.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`identify:${subjectHash}`}))`;
  const state = await client.rateLimitState.findUnique({ where: { scope_subjectHash: { scope: "PHONE", subjectHash } } });
  if (state?.blockedUntil && state.blockedUntil > now) return { allowed: false, blocked: true, remaining: 0 };
  const windowMs = 15 * 60_000; const inWindow = state && now.getTime() - state.windowStart.getTime() < windowMs;
  if (success) {
    await client.rateLimitState.upsert({ where: { scope_subjectHash: { scope: "PHONE", subjectHash } }, create: { scope: "PHONE", subjectHash, windowStart: now, count: 0 }, update: { windowStart: now, count: 0, blockedUntil: null } });
    return { allowed: true, blocked: false, remaining: 5 };
  }
  const count = inWindow ? (state?.count ?? 0) + 1 : 1; const blockedUntil = count >= 5 ? new Date(now.getTime() + 30 * 60_000) : null;
  await client.rateLimitState.upsert({ where: { scope_subjectHash: { scope: "PHONE", subjectHash } }, create: { scope: "PHONE", subjectHash, windowStart: now, count, blockedUntil }, update: { windowStart: inWindow ? state!.windowStart : now, count, blockedUntil } });
  return { allowed: false, blocked: Boolean(blockedUntil), remaining: Math.max(0, 5 - count) };
}

export async function assertUploadLimit(employeeId: string, now: Date, client: Prisma.TransactionClient) {
  await client.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`upload:${employeeId}`}))`;
  const count = await client.uploadAttempt.count({ where: { employeeId, result: { in: ["PENDING", "SUCCESS"] }, idempotencyKey: { not: null }, createdAt: { gte: new Date(now.getTime() - 60 * 60_000) } } });
  return count < 10;
}
