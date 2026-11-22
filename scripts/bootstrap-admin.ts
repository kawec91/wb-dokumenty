import { PrismaClient, PermissionCode } from "@prisma/client";
import { allPermissions } from "../src/lib/permissions";

const [userId, tenantId, email] = process.argv.slice(2);
if (!userId || !tenantId || !email) {
  console.error("Użycie: npm run bootstrap:admin -- <WB_AUTH_USER_UUID> <TENANT_UUID> <EMAIL>");
  process.exit(1);
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
if (!uuid.test(userId) || !uuid.test(tenantId) || !email.includes("@")) throw new Error("Nieprawidłowe argumenty bootstrapu");

const db = new PrismaClient();
async function main() { try {
  const entities = await db.entity.findMany({ select: { id: true } });
  if (!entities.length) throw new Error("Najpierw uruchom seed podmiotów");
  const membership = await db.applicationMembership.upsert({
    where: { wbAuthUserId_tenantId: { wbAuthUserId: userId, tenantId } },
    create: { wbAuthUserId: userId, tenantId, email: email.toLowerCase(), roleTemplate: "ADMIN", status: "ACTIVE" },
    update: { email: email.toLowerCase(), roleTemplate: "ADMIN", status: "ACTIVE" },
  });
  await db.$transaction([
    db.membershipPermission.deleteMany({ where: { membershipId: membership.id } }),
    db.membershipEntity.deleteMany({ where: { membershipId: membership.id } }),
    db.membershipPermission.createMany({ data: allPermissions.map((permission: PermissionCode) => ({ membershipId: membership.id, permission })) }),
    db.membershipEntity.createMany({ data: entities.map(({ id }) => ({ membershipId: membership.id, entityId: id })) }),
  ]);
  console.log(`Aktywowano administratora ${email} dla ${entities.length} podmiotów.`);
} finally { await db.$disconnect(); } }
main().catch((error) => { console.error(error); process.exitCode = 1; });
