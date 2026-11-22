import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePortalSession, requirePermission, encrypt } from "@/lib/portal-session";
import { assertSameOrigin, errorResponse, HttpError, randomToken, sha256 } from "@/lib/security";
import { qrUrl } from "@/lib/qr";

const schema = z.object({ type: z.enum(["PERSONAL", "GENERAL"]), name: z.string().trim().min(1).max(120), description: z.string().trim().max(500).optional(), employeeId: z.string().uuid().optional() }).superRefine((value, ctx) => { if (value.type === "PERSONAL" && !value.employeeId) ctx.addIssue({ code: "custom", message: "Kod osobisty wymaga pracownika", path: ["employeeId"] }); });
export async function GET(request: NextRequest) { try { const context = await requirePortalSession(request); requirePermission(context, "QR_MANAGE"); return Response.json(await db.qrCode.findMany({ orderBy: { createdAt: "desc" }, include: { employee: { select: { firstName: true, lastName: true } } } })); } catch (error) { return errorResponse(error); } }
export async function POST(request: NextRequest) { try { assertSameOrigin(request); const context = await requirePortalSession(request); requirePermission(context, "QR_MANAGE"); const input = schema.parse(await request.json()); if (input.employeeId && !await db.employee.findUnique({ where: { id: input.employeeId } })) throw new HttpError(404, "EMPLOYEE_NOT_FOUND", "Nie znaleziono pracownika."); const token = randomToken(36); const qr = await db.qrCode.create({ data: { ...input, employeeId: input.type === "PERSONAL" ? input.employeeId : null, tokenHash: sha256(token), tokenEncrypted: encrypt(token) } }); return Response.json({ ...qr, url: qrUrl(token) }, { status: 201 }); } catch (error) { return errorResponse(error); } }
