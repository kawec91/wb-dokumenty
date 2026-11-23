import { PrismaClient, PermissionCode } from "@prisma/client";
import { allPermissions } from "../src/lib/permissions";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emailAddress = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const requiredEntityCodes = ["TORUN", "GDANSK", "BYDGOSZCZ", "TRADE"] as const;

export type BootstrapAdminInput = {
  userId: string;
  tenantId: string;
  email: string;
};

export function parseBootstrapAdminArguments(args: string[]): BootstrapAdminInput {
  const [userId, tenantId, rawEmail] = args;
  const email = rawEmail?.trim().toLowerCase();
  if (!userId || !tenantId || !email) {
    throw new Error("Użycie: npm run bootstrap:admin -- <WB_AUTH_USER_UUID> <TENANT_UUID> <EMAIL>");
  }
  if (!uuid.test(userId) || !uuid.test(tenantId) || !emailAddress.test(email)) {
    throw new Error("Nieprawidłowe argumenty bootstrapu");
  }
  return { userId, tenantId, email };
}

export async function bootstrapAdmin(db: PrismaClient, input: BootstrapAdminInput) {
  return db.$transaction(async (transaction) => {
    const entities = await transaction.entity.findMany({
      where: { code: { in: [...requiredEntityCodes] } },
      select: { id: true, code: true },
    });
    const foundCodes = new Set(entities.map(({ code }) => code));
    const missingCodes = requiredEntityCodes.filter((code) => !foundCodes.has(code));
    if (missingCodes.length) throw new Error(`Brak wymaganych podmiotów po seedzie: ${missingCodes.join(", ")}`);

    const membership = await transaction.applicationMembership.upsert({
      where: { wbAuthUserId_tenantId: { wbAuthUserId: input.userId, tenantId: input.tenantId } },
      create: {
        wbAuthUserId: input.userId,
        tenantId: input.tenantId,
        email: input.email,
        roleTemplate: "ADMIN",
        status: "ACTIVE",
      },
      update: { email: input.email, roleTemplate: "ADMIN", status: "ACTIVE" },
    });

    await transaction.membershipPermission.deleteMany({ where: { membershipId: membership.id } });
    await transaction.membershipEntity.deleteMany({ where: { membershipId: membership.id } });
    await transaction.membershipPermission.createMany({
      data: allPermissions.map((permission: PermissionCode) => ({ membershipId: membership.id, permission })),
      skipDuplicates: true,
    });
    await transaction.membershipEntity.createMany({
      data: entities.map(({ id }) => ({ membershipId: membership.id, entityId: id })),
      skipDuplicates: true,
    });

    return { membershipId: membership.id, entityCount: entities.length };
  });
}

async function main() {
  const input = parseBootstrapAdminArguments(process.argv.slice(2));
  const db = new PrismaClient();
  try {
    const result = await bootstrapAdmin(db, input);
    console.log(`Aktywowano administratora ${input.email} dla ${result.entityCount} podmiotów.`);
  } finally {
    await db.$disconnect();
  }
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/scripts/bootstrap-admin.ts")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Bootstrap administratora nie powiódł się");
    process.exitCode = 1;
  });
}
