import type { DocumentCategory, DocumentStatus, Prisma } from "@prisma/client";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requirePortalSession, requirePermission } from "@/lib/portal-session";
import { errorResponse, HttpError } from "@/lib/security";

export async function GET(request: NextRequest) {
  try {
    const context = await requirePortalSession(request); const params = request.nextUrl.searchParams;
    const canViewAll = context.permissions.has("DOCUMENT_VIEW_ALL");
    if (!canViewAll && !context.permissions.has("DOCUMENT_VIEW_OWN")) throw new HttpError(403, "PERMISSION_DENIED", "Brak dostępu do dokumentów.");
    const requestedEntity = params.get("entityId"); if (requestedEntity) requirePermission(context, canViewAll ? "DOCUMENT_VIEW_ALL" : "DOCUMENT_VIEW_OWN", requestedEntity);
    const employee = canViewAll ? null : await db.employee.findUnique({ where: { wbAuthUserId: context.membership.wbAuthUserId } });
    const where: Prisma.DocumentWhereInput = {
      entityId: requestedEntity ?? { in: [...context.entityIds] },
      ...(!canViewAll ? { employeeId: employee?.id ?? "00000000-0000-0000-0000-000000000000" } : params.get("employeeId") ? { employeeId: params.get("employeeId")! } : {}),
      ...(params.get("status") ? { status: params.get("status") as DocumentStatus } : {}),
      ...(params.get("category") ? { category: params.get("category") as DocumentCategory } : {}),
    };
    return Response.json(await db.document.findMany({ where, take: 200, orderBy: { receivedAt: "desc" }, include: { entity: true, employee: { select: { firstName: true, lastName: true } }, files: { select: { id: true, originalName: true, sizeBytes: true } }, events: { orderBy: { createdAt: "asc" } } } }));
  } catch (error) { return errorResponse(error); }
}
