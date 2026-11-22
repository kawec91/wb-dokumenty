import type { NextRequest } from "next/server";
import { z } from "zod";
import { ZipFile } from "yazl";
import { db } from "@/lib/db";
import { requirePortalSession, requirePermission, decrypt } from "@/lib/portal-session";
import { assertSameOrigin, errorResponse } from "@/lib/security";
import { qrPdf, qrPng, qrSvg } from "@/lib/qr";

const schema = z.object({ ids: z.array(z.string().uuid()).min(1).max(200), format: z.enum(["pdf", "zip"]) });
async function zipBuffer(zip: ZipFile) { return new Promise<Buffer>((resolve, reject) => { const chunks: Buffer[] = []; zip.outputStream.on("data", (chunk) => chunks.push(Buffer.from(chunk))).on("error", reject).on("end", () => resolve(Buffer.concat(chunks))); zip.end(); }); }
export async function POST(request: NextRequest) { try { assertSameOrigin(request); const context = await requirePortalSession(request); requirePermission(context, "QR_MANAGE"); const input = schema.parse(await request.json()); const rows = await db.qrCode.findMany({ where: { id: { in: input.ids } } }); const items = rows.map((row) => ({ token: decrypt(row.tokenEncrypted), name: row.name, description: row.description })); if (input.format === "pdf") return new Response(new Uint8Array(await qrPdf(items)), { headers: { "Content-Type": "application/pdf", "Content-Disposition": "attachment; filename=wb-kody-qr.pdf" } }); const zip = new ZipFile(); for (const [index, item] of items.entries()) { zip.addBuffer(await qrPng(item.token), `${String(index + 1).padStart(3, "0")}-${item.name.replace(/[^a-zA-Z0-9_-]+/g, "-")}.png`); zip.addBuffer(Buffer.from(await qrSvg(item.token)), `${String(index + 1).padStart(3, "0")}-${item.name.replace(/[^a-zA-Z0-9_-]+/g, "-")}.svg`); } return new Response(new Uint8Array(await zipBuffer(zip)), { headers: { "Content-Type": "application/zip", "Content-Disposition": "attachment; filename=wb-kody-qr.zip" } }); } catch (error) { return errorResponse(error); } }
