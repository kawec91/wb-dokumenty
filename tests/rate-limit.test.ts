import { describe, expect, it } from "vitest";
import { assertUploadLimit, consumeIdentificationAttempt } from "@/lib/rate-limit";

function fakeClient() {
  let state: { scope: string; subjectHash: string; windowStart: Date; count: number; blockedUntil: Date | null } | null = null;
  return { $executeRaw: async () => 0, rateLimitState: { findUnique: async () => state, upsert: async ({ create, update }: { create: typeof state; update: Partial<NonNullable<typeof state>> }) => { state = state ? { ...state, ...update } : create; return state; } }, uploadAttempt: { count: async () => 0 }, state: () => state };
}

describe("limity", () => {
  it("blokuje po piątej błędnej próbie na 30 minut", async () => { const client = fakeClient(); const now = new Date("2026-11-22T12:00:00Z"); for (let i = 0; i < 4; i++) expect((await consumeIdentificationAttempt("subject", false, now, client as never)).blocked).toBe(false); const fifth = await consumeIdentificationAttempt("subject", false, now, client as never); expect(fifth.blocked).toBe(true); expect(client.state()?.blockedUntil?.getTime()).toBe(now.getTime() + 30 * 60_000); });
  it("resetuje licznik po sukcesie", async () => { const client = fakeClient(); const now = new Date(); await consumeIdentificationAttempt("subject", false, now, client as never); await consumeIdentificationAttempt("subject", true, now, client as never); expect(client.state()?.count).toBe(0); });
  it("pozwala na maksymalnie 10 uploadów w godzinie", async () => { const client = fakeClient(); client.uploadAttempt.count = async () => 9; expect(await assertUploadLimit("employee", new Date(), client as never)).toBe(true); client.uploadAttempt.count = async () => 10; expect(await assertUploadLimit("employee", new Date(), client as never)).toBe(false); });
});
