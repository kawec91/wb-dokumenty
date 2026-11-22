import type { DocumentCategory, DocumentStatus, Prisma } from "@prisma/client";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requirePortalSession, requirePermission } from "@/lib/portal-session";
import { errorResponse } from "@/lib/security";

export async function GET(request: NextRequest) { try { const context = await requirePortalSession(request); requirePermission(context, "DOCUMENT_VIEW_ALL"); const params = request.nextUrl.searchParams; const requestedEntity = params.get("entityId"); if (requestedEntity) requirePermission(context, "DOCUMENT_VIEW_ALL", requestedEntity); const where: Prisma.DocumentWhereInput = { entityId: requestedEntity ?? { in: [...context.entityIds] }, ...(params.get("status") ? { status: params.get("status") as DocumentStatus } : {}), ...(params.get("category") ? { category: params.get("category") as DocumentCategory } : {}), ...(params.get("employeeId") ? { employeeId: params.get("employeeId")! } : {}) }; const documents = await db.document.findMany({ where, take: 200, orderBy: { receivedAt: "desc" }, include: { entity: true, employee: { select: { firstName: true, lastName: true } }, files: { select: { id: true, originalName: true, sizeBytes: true } }, events: { orderBy: { createdAt: "desc" }, take: 10 } } }); return Response.json(documents); } catch (error) { return errorResponse(error); } }
