import { readFile } from "node:fs/promises";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { resolveStoredFile } from "@/lib/files";
import { requirePortalSession, requirePermission } from "@/lib/portal-session";
import { assertSameOrigin, errorResponse, HttpError } from "@/lib/security";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request); const context = await requirePortalSession(request); const { id } = await params;
    const file = await db.documentFile.findUnique({ where: { id }, include: { document: true } });
    if (!file) throw new HttpError(404, "NOT_FOUND", "Nie znaleziono pliku.");
    requirePermission(context, "DOCUMENT_DOWNLOAD", file.document.entityId);
    if (file.document.status === "ZAPISANY") await db.$transaction([
      db.document.update({ where: { id: file.documentId }, data: { status: "PRZEKAZANY" } }),
      db.documentEvent.create({ data: { documentId: file.documentId, oldStatus: "ZAPISANY", newStatus: "PRZEKAZANY", actorType: "USER", actorId: context.membership.wbAuthUserId, note: "Oryginał pobrany przez uprawnionego użytkownika" } }),
    ]);
    const body = await readFile(await resolveStoredFile(file.relativePath)); const safeName = file.originalName.replace(/[\r\n"]/g, "_");
    return new Response(new Uint8Array(body), { headers: { "Content-Type": file.mimeType, "Content-Disposition": `attachment; filename="${safeName}"`, "Content-Length": String(body.length), "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}
