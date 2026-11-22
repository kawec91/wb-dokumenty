import type { NextRequest } from "next/server";
import { PDFDocument } from "pdf-lib";
import { db } from "@/lib/db";
import { requirePortalSession, requirePermission, decrypt } from "@/lib/portal-session";
import { errorResponse, HttpError } from "@/lib/security";
import { qrPng, qrSvg } from "@/lib/qr";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) { try { const context = await requirePortalSession(request); requirePermission(context, "QR_MANAGE"); const { id } = await params; const qr = await db.qrCode.findUnique({ where: { id } }); if (!qr) throw new HttpError(404, "NOT_FOUND", "Nie znaleziono kodu QR."); const format = request.nextUrl.searchParams.get("format") ?? "png"; const token = decrypt(qr.tokenEncrypted); let body: Buffer; let type: string; if (format === "svg") { body = Buffer.from(await qrSvg(token)); type = "image/svg+xml"; } else if (format === "pdf") { const pdf = await PDFDocument.create(); const page = pdf.addPage([420, 540]); const image = await pdf.embedPng(await qrPng(token)); page.drawImage(image, { x: 50, y: 120, width: 320, height: 320 }); body = Buffer.from(await pdf.save()); type = "application/pdf"; } else { body = await qrPng(token); type = "image/png"; } return new Response(new Uint8Array(body), { headers: { "Content-Type": type, "Content-Disposition": `attachment; filename="qr-${id}.${format}"`, "Cache-Control": "private, no-store" } }); } catch (error) { return errorResponse(error); } }
