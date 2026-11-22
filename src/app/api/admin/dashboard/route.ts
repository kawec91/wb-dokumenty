import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { storageUsage } from "@/lib/files";
import { requirePortalSession, requirePermission } from "@/lib/portal-session";
import { errorResponse } from "@/lib/security";

export async function GET(request: NextRequest) { try { const context = await requirePortalSession(request); requirePermission(context, "DOCUMENT_VIEW_ALL"); const entityId = { in: [...context.entityIds] }; const now = new Date(); const today = new Date(now); today.setHours(0, 0, 0, 0); const month = new Date(now.getFullYear(), now.getMonth(), 1); const [todayCount, monthCount, newCount, correctionCount, pendingCount, storage] = await Promise.all([db.document.count({ where: { entityId, receivedAt: { gte: today } } }), db.document.count({ where: { entityId, receivedAt: { gte: month } } }), db.document.count({ where: { entityId, status: "ZAPISANY" } }), db.document.count({ where: { entityId, status: "DO_POPRAWY" } }), db.document.count({ where: { entityId, status: { in: ["ZAPISANY", "PRZEKAZANY"] } } }), storageUsage()]); return Response.json({ today: todayCount, month: monthCount, new: newCount, correction: correctionCount, pending: pendingCount, storage }); } catch (error) { return errorResponse(error); } }
