import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  bootstrapAdmin,
  parseBootstrapAdminArguments,
  requiredEntityCodes,
} from "../scripts/bootstrap-admin";
import { allPermissions } from "@/lib/permissions";

const input = {
  userId: "10000000-0000-4000-8000-000000000001",
  tenantId: "20000000-0000-4000-8000-000000000001",
  email: "admin@whitebull.com.pl",
};

function memoryDatabase(entityCodes: readonly string[] = requiredEntityCodes) {
  const memberships = new Map<string, { id: string; roleTemplate: string; status: string; email: string }>();
  const permissions = new Set<string>();
  const entityAccess = new Set<string>();
  const entities = entityCodes.map((code, index) => ({ id: `30000000-0000-4000-8000-00000000000${index + 1}`, code }));
  const transaction = {
    entity: { findMany: vi.fn(async () => entities) },
    applicationMembership: {
      upsert: vi.fn(async ({ create, update }: { create: typeof input & { roleTemplate: string; status: string; wbAuthUserId: string }; update: { email: string; roleTemplate: string; status: string } }) => {
        const key = `${input.userId}:${input.tenantId}`;
        const current = memberships.get(key);
        const next = {
          id: current?.id ?? "40000000-0000-4000-8000-000000000001",
          roleTemplate: update.roleTemplate ?? create.roleTemplate,
          status: update.status ?? create.status,
          email: update.email ?? create.email,
        };
        memberships.set(key, next);
        return next;
      }),
    },
    membershipPermission: {
      deleteMany: vi.fn(async () => { permissions.clear(); return { count: 0 }; }),
      createMany: vi.fn(async ({ data }: { data: Array<{ permission: string }> }) => {
        data.forEach(({ permission }) => permissions.add(permission));
        return { count: data.length };
      }),
    },
    membershipEntity: {
      deleteMany: vi.fn(async () => { entityAccess.clear(); return { count: 0 }; }),
      createMany: vi.fn(async ({ data }: { data: Array<{ entityId: string }> }) => {
        data.forEach(({ entityId }) => entityAccess.add(entityId));
        return { count: data.length };
      }),
    },
  };
  const db = { $transaction: vi.fn(async (callback: (tx: typeof transaction) => unknown) => callback(transaction)) } as unknown as PrismaClient;
  return { db, memberships, permissions, entityAccess };
}

describe("bootstrap administratora", () => {
  it("normalizuje argumenty i odrzuca identyfikatory spoza WB Auth", () => {
    expect(parseBootstrapAdminArguments([input.userId, input.tenantId, " Admin@WhiteBull.com.pl "])).toEqual(input);
    expect(() => parseBootstrapAdminArguments(["user", input.tenantId, input.email])).toThrow("Nieprawidłowe argumenty bootstrapu");
  });

  it("jest idempotentny i nadaje ADMIN oraz dostęp dokładnie do czterech podmiotów", async () => {
    const state = memoryDatabase();
    await bootstrapAdmin(state.db, input);
    await bootstrapAdmin(state.db, input);

    expect(state.memberships).toHaveLength(1);
    expect([...state.memberships.values()][0]).toMatchObject({ roleTemplate: "ADMIN", status: "ACTIVE", email: input.email });
    expect(state.permissions).toEqual(new Set(allPermissions));
    expect(state.entityAccess).toHaveLength(4);
  });

  it("nie tworzy częściowego administratora, gdy brakuje podmiotu z seeda", async () => {
    const state = memoryDatabase(requiredEntityCodes.slice(0, 3));
    await expect(bootstrapAdmin(state.db, input)).rejects.toThrow("Brak wymaganych podmiotów po seedzie: TRADE");
    expect(state.memberships).toHaveLength(0);
  });
});
