import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requirePortalSession, requirePermission } from "@/lib/portal-session";
import { assertSameOrigin, errorResponse } from "@/lib/security";
import { employeeInputSchema } from "@/lib/validation";

export async function GET(request: NextRequest) { try { const context = await requirePortalSession(request); requirePermission(context, "EMPLOYEE_MANAGE"); return Response.json(await db.employee.findMany({ orderBy: [{ lastName: "asc" }, { firstName: "asc" }], include: { entities: { include: { entity: true } }, _count: { select: { documents: true } } } })); } catch (error) { return errorResponse(error); } }
export async function POST(request: NextRequest) { try { assertSameOrigin(request); const context = await requirePortalSession(request); requirePermission(context, "EMPLOYEE_MANAGE"); const input = employeeInputSchema.parse(await request.json()); input.entityIds.forEach((id) => requirePermission(context, "EMPLOYEE_MANAGE", id)); const employee = await db.employee.create({ data: { firstName: input.firstName, lastName: input.lastName, phoneNumber: input.phoneNumber, wbAuthUserId: input.wbAuthUserId, entities: { create: input.entityIds.map((entityId) => ({ entityId })) } }, include: { entities: true } }); return Response.json(employee, { status: 201 }); } catch (error) { return errorResponse(error); } }
