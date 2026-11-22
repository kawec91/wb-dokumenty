import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertSameOrigin, errorResponse, HttpError, randomToken, requestIdentity, sha256 } from "@/lib/security";
import { quickSession } from "@/lib/quick-session";
import { assertUploadLimit } from "@/lib/rate-limit";
import { validateUploadFiles, persistFiles } from "@/lib/files";
import { warsawParts } from "@/lib/time";

export const runtime = "nodejs";
const fieldsSchema = z.object({ entityId: z.string().uuid(), category: z.enum(["FAKTURA", "RACHUNEK", "PARAGON_Z_NIP", "INNE"]), note: z.string().trim().max(1000).optional() });

export async function POST(request: NextRequest) {
  let attemptId: string | undefined;
  try {
    assertSameOrigin(request); const identity = requestIdentity(request); const session = await quickSession(request);
    if (session.clientHash !== identity.clientHash) throw new HttpError(401, "SESSION_MISMATCH", "Sesja jest nieprawidłowa.");
    const idempotencyKey = request.headers.get("idempotency-key");
    if (!idempotencyKey || !/^[A-Za-z0-9_-]{16,100}$/.test(idempotencyKey)) throw new HttpError(400, "IDEMPOTENCY_REQUIRED", "Odśwież formularz i spróbuj ponownie.");
    const existing = await db.uploadAttempt.findUnique({ where: { clientHash_idempotencyKey: { clientHash: identity.clientHash, idempotencyKey } } });
    if (existing?.documentId) {
      const document = await db.document.findUnique({ where: { id: existing.documentId }, include: { entity: true } });
      if (document) return Response.json({ referenceNumber: document.referenceNumber, entity: document.entity.displayName, category: document.category, status: document.status, receivedAt: document.receivedAt });
    }
    if (existing) throw new HttpError(409, "UPLOAD_IN_PROGRESS", "To zgłoszenie jest już przetwarzane.");
    const form = await request.formData(); const fields = fieldsSchema.parse({ entityId: form.get("entityId"), category: form.get("category"), note: form.get("note") || undefined });
    const files = await validateUploadFiles(form.getAll("files").filter((item): item is File => item instanceof File));
    const employeeEntity = session.employee.entities.find((item) => item.entityId === fields.entityId && item.entity.isActive);
    if (!employeeEntity) throw new HttpError(403, "ENTITY_DENIED", "Ten podmiot nie jest dostępny.");
    const now = new Date(); const { year, month } = warsawParts(now);
    const reservation = await db.$transaction(async (tx) => {
      if (!await assertUploadLimit(session.employeeId, now, tx)) throw new HttpError(429, "UPLOAD_LIMIT", "Osiągnięto limit 10 dokumentów na godzinę.");
      const attempt = await tx.uploadAttempt.create({ data: { ...identity, employeeId: session.employeeId, result: "PENDING", idempotencyKey } });
      const sequence = await tx.documentSequence.upsert({ where: { entityId_year: { entityId: fields.entityId, year } }, create: { entityId: fields.entityId, year, lastValue: 1 }, update: { lastValue: { increment: 1 } } });
      return { attemptId: attempt.id, reference: `${employeeEntity.entity.numberingPrefix}-${year}-${String(sequence.lastValue).padStart(6, "0")}` };
    });
    attemptId = reservation.attemptId;
    const persisted = await persistFiles({ folder: employeeEntity.entity.storageFolderName, year, month, reference: reservation.reference, files });
    const receiptToken = randomToken();
    try {
      const document = await db.$transaction(async (tx) => {
        const created = await tx.document.create({ data: { referenceNumber: reservation.reference, entityId: fields.entityId, employeeId: session.employeeId, qrCodeId: session.qrCodeId, category: fields.category, note: fields.note, receivedAt: now, storageYear: year, storageMonth: month, receiptTokenHash: sha256(receiptToken), files: { create: persisted.records }, events: { create: { oldStatus: null, newStatus: "ZAPISANY", actorType: "EMPLOYEE", actorId: session.employeeId, note: "Dokument zapisany" } } }, include: { entity: true } });
        await tx.uploadAttempt.update({ where: { id: reservation.attemptId }, data: { result: "SUCCESS", documentId: created.id } });
        if (session.qrCodeId) await tx.qrCode.update({ where: { id: session.qrCodeId }, data: { usageCount: { increment: 1 }, lastUsedAt: now } });
        return created;
      });
      return Response.json({ referenceNumber: document.referenceNumber, entity: document.entity.displayName, category: document.category, status: document.status, receivedAt: document.receivedAt, receiptUrl: `/receipt/${receiptToken}` }, { status: 201 });
    } catch (error) { await persisted.cleanup(); throw error; }
  } catch (error) {
    if (attemptId) await db.uploadAttempt.update({ where: { id: attemptId }, data: { result: "ERROR" } }).catch(() => undefined);
    return errorResponse(error);
  }
}
