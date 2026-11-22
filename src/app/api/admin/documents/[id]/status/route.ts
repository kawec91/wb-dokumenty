import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePortalSession, requirePermission } from "@/lib/portal-session";
import { assertSameOrigin, errorResponse, HttpError } from "@/lib/security";

const schema = z.object({ status: z.enum(["ZAPISANY", "PRZEKAZANY", "PRZYJETY", "DO_POPRAWY", "ARCHIWALNY"]), note: z.string().trim().max(1000).optional() });
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) { try { assertSameOrigin(request); const context = await requirePortalSession(request); const { id } = await params; const input = schema.parse(await request.json()); const document = await db.document.findUnique({ where: { id } }); if (!document) throw new HttpError(404, "NOT_FOUND", "Nie znaleziono dokumentu."); requirePermission(context, "DOCUMENT_STATUS_MANAGE", document.entityId); const updated = await db.$transaction(async (tx) => { const row = await tx.document.update({ where: { id }, data: { status: input.status } }); await tx.documentEvent.create({ data: { documentId: id, oldStatus: document.status, newStatus: input.status, actorType: "USER", actorId: context.membership.wbAuthUserId, note: input.note } }); return row; }); return Response.json(updated); } catch (error) { return errorResponse(error); } }
