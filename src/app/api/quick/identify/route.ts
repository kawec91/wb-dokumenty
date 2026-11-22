import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { normalizePhone } from "@/lib/validation";
import { assertSameOrigin, errorResponse, privateHash, requestIdentity, sha256 } from "@/lib/security";
import { consumeIdentificationAttempt } from "@/lib/rate-limit";
import { createQuickSession, QUICK_COOKIE } from "@/lib/quick-session";

const inputSchema = z.object({ phoneNumber: z.string().min(5).max(40), qrToken: z.string().min(32).max(200) });
const neutral = "Nie możemy potwierdzić dostępu. Sprawdź dane lub skontaktuj się z administratorem.";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request); const identity = requestIdentity(request); const input = inputSchema.parse(await request.json());
    let phone: string;
    try { phone = normalizePhone(input.phoneNumber); } catch { phone = "+000000000"; }
    const [employee, qr] = await Promise.all([
      db.employee.findUnique({ where: { phoneNumber: phone }, include: { entities: true } }),
      db.qrCode.findUnique({ where: { tokenHash: sha256(input.qrToken) } }),
    ]);
    const valid = Boolean(employee && employee.status === "ACTIVE" && employee.entities.length > 0 && qr?.isActive && (!qr.employeeId || qr.employeeId === employee.id));
    const subjectHash = privateHash(`${identity.ipHash}:${identity.clientHash}`);
    const rate = await db.$transaction((tx) => consumeIdentificationAttempt(subjectHash, valid, new Date(), tx));
    await db.uploadAttempt.create({ data: { ...identity, employeeId: valid ? employee!.id : null, result: rate.blocked ? "BLOCKED" : valid ? "SUCCESS" : "REJECTED" } });
    if (rate.blocked) return Response.json({ error: { code: "RATE_LIMITED", message: "Przekroczono limit prób. Spróbuj ponownie później." } }, { status: 429 });
    if (!valid) return Response.json({ error: { code: "IDENTIFICATION_FAILED", message: neutral } }, { status: 403 });
    const session = await createQuickSession({ employeeId: employee!.id, qrCodeId: qr!.id, ...identity });
    const response = Response.json({ ok: true });
    response.headers.append("Set-Cookie", `${QUICK_COOKIE}=${session.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=1800${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
    return response;
  } catch (error) { return errorResponse(error); }
}
