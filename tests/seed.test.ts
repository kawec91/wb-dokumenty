import { describe, expect, it, vi } from "vitest";
import { initialEntities, seedEntities } from "../prisma/seed";

describe("początkowy seed", () => {
  it("zawiera dokładnie cztery wymagane podmioty bez BullHub", () => {
    expect(initialEntities).toHaveLength(4);
    expect(initialEntities.map((item) => item.code)).toEqual(["TORUN", "GDANSK", "BYDGOSZCZ", "TRADE"]);
    expect(initialEntities.some((item) => item.code.includes("BULL"))).toBe(false);
  });

  it("jest idempotentny dzięki upsertom po kodzie", async () => {
    const upsert = vi.fn((args) => Promise.resolve(args)); const transaction = vi.fn((items) => Promise.all(items));
    await seedEntities({ entity: { upsert }, $transaction: transaction } as never);
    expect(upsert).toHaveBeenCalledTimes(4); expect(transaction).toHaveBeenCalledOnce();
    expect(upsert.mock.calls[0]?.[0].where).toEqual({ code: "TORUN" });
  });
});
