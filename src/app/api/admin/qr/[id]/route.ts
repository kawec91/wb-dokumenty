import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePortalSession, requirePermission, encrypt } from "@/lib/portal-session";
import { assertSameOrigin, errorResponse, randomToken, sha256 } from "@/lib/security";
import { qrUrl } from "@/lib/qr";

const schema = z.object({ name: z.string().trim().min(1).max(120).optional(), description: z.string().trim().max(500).nullable().optional(), isActive: z.boolean().optional(), regenerate: z.boolean().optional() });
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) { try { assertSameOrigin(request); const context = await requirePortalSession(request); requirePermission(context, "QR_MANAGE"); const { id } = await params; const input = schema.parse(await request.json()); const token = input.regenerate ? randomToken(36) : undefined; const qr = await db.qrCode.update({ where: { id }, data: { name: input.name, description: input.description, isActive: input.isActive, ...(token ? { tokenHash: sha256(token), tokenEncrypted: encrypt(token) } : {}) } }); return Response.json({ ...qr, ...(token ? { url: qrUrl(token) } : {}) }); } catch (error) { return errorResponse(error); } }
