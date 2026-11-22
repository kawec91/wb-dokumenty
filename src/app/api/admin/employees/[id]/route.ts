import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePortalSession, requirePermission } from "@/lib/portal-session";
import { assertSameOrigin, errorResponse } from "@/lib/security";
import { normalizePhone } from "@/lib/validation";

const schema = z.object({ firstName: z.string().trim().min(1).max(100).optional(), lastName: z.string().trim().min(1).max(100).optional(), phoneNumber: z.string().transform(normalizePhone).optional(), status: z.enum(["ACTIVE", "INACTIVE"]).optional(), entityIds: z.array(z.string().uuid()).min(1).optional() });
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) { try { assertSameOrigin(request); const context = await requirePortalSession(request); requirePermission(context, "EMPLOYEE_MANAGE"); const { id } = await params; const input = schema.parse(await request.json()); input.entityIds?.forEach((entityId) => requirePermission(context, "EMPLOYEE_MANAGE", entityId)); return Response.json(await db.$transaction(async (tx) => { if (input.entityIds) { await tx.employeeEntity.deleteMany({ where: { employeeId: id } }); await tx.employeeEntity.createMany({ data: input.entityIds.map((entityId) => ({ employeeId: id, entityId })) }); } return tx.employee.update({ where: { id }, data: { firstName: input.firstName, lastName: input.lastName, phoneNumber: input.phoneNumber, status: input.status } }); })); } catch (error) { return errorResponse(error); } }
