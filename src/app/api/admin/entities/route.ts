import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requirePortalSession, requirePermission } from "@/lib/portal-session";
import { assertSameOrigin, errorResponse } from "@/lib/security";
import { entityInputSchema } from "@/lib/validation";

export async function GET(request: NextRequest) { try { const context = await requirePortalSession(request); requirePermission(context, "ENTITY_MANAGE"); return Response.json(await db.entity.findMany({ orderBy: { displayName: "asc" }, include: { _count: { select: { documents: true, employees: true } } } })); } catch (error) { return errorResponse(error); } }
export async function POST(request: NextRequest) { try { assertSameOrigin(request); const context = await requirePortalSession(request); requirePermission(context, "ENTITY_MANAGE"); const input = entityInputSchema.parse(await request.json()); const entity = await db.entity.create({ data: input }); return Response.json(entity, { status: 201 }); } catch (error) { return errorResponse(error); } }
