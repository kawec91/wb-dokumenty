import { db } from "@/lib/db";
import { errorResponse, HttpError, sha256 } from "@/lib/security";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params; if (token.length < 32) throw new HttpError(404, "NOT_FOUND", "Nie znaleziono potwierdzenia.");
    const document = await db.document.findUnique({ where: { receiptTokenHash: sha256(token) }, include: { entity: true, events: { orderBy: { createdAt: "asc" } } } });
    if (!document || document.receivedAt < new Date(Date.now() - 24 * 60 * 60_000)) throw new HttpError(404, "NOT_FOUND", "Potwierdzenie wygasło.");
    return Response.json({ referenceNumber: document.referenceNumber, entity: document.entity.displayName, category: document.category, status: document.status, receivedAt: document.receivedAt, events: document.events.map((event) => ({ status: event.newStatus, createdAt: event.createdAt })) });
  } catch (error) { return errorResponse(error); }
}
