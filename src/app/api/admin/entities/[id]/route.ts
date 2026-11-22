import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requirePortalSession, requirePermission } from "@/lib/portal-session";
import { assertSameOrigin, errorResponse, HttpError } from "@/lib/security";
import { entityInputSchema } from "@/lib/validation";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) { try { assertSameOrigin(request); const context = await requirePortalSession(request); requirePermission(context, "ENTITY_MANAGE"); const { id } = await params; const input = entityInputSchema.partial().parse(await request.json()); const current = await db.entity.findUnique({ where: { id }, include: { _count: { select: { documents: true } } } }); if (!current) throw new HttpError(404, "NOT_FOUND", "Nie znaleziono podmiotu."); if (input.storageFolderName && input.storageFolderName !== current.storageFolderName && current._count.documents > 0) throw new HttpError(409, "STORAGE_FOLDER_LOCKED", "Nie można zmienić folderu podmiotu, który ma dokumenty."); return Response.json(await db.entity.update({ where: { id }, data: input })); } catch (error) { return errorResponse(error); } }
