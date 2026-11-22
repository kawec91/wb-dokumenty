import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { env } from "@/lib/env";

export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");
export const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
export const privateHash = (value: string) => createHmac("sha256", env().HASH_SECRET).update(value).digest("hex");
export function safeEqual(a: string, b: string) {
  const left = Buffer.from(a); const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function clientAddress(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}

export function requestIdentity(request: NextRequest) {
  const clientId = request.headers.get("x-client-id")?.trim();
  if (!clientId || !/^[A-Za-z0-9_-]{16,100}$/.test(clientId)) throw new HttpError(400, "INVALID_CLIENT", "Odśwież stronę i spróbuj ponownie.");
  return { ipHash: privateHash(`ip:${clientAddress(request)}`), clientHash: privateHash(`client:${clientId}`) };
}

export function assertSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(env().APP_URL).origin) throw new HttpError(403, "INVALID_ORIGIN", "Żądanie zostało odrzucone.");
}

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export function errorResponse(error: unknown) {
  if (error instanceof HttpError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  if (error instanceof Error && error.name === "ZodError") return Response.json({ error: { code: "INVALID_INPUT", message: "Sprawdź wprowadzone dane." } }, { status: 400 });
  console.error("request_failed", error);
  return Response.json({ error: { code: "INTERNAL_ERROR", message: "Nie udało się wykonać operacji. Spróbuj ponownie." } }, { status: 500 });
}
