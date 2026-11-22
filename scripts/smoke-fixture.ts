import { PrismaClient } from "@prisma/client";
import { encrypt } from "../src/lib/portal-session";
import { sha256 } from "../src/lib/security";

if (process.env.NODE_ENV === "production") throw new Error("Smoke fixture is disabled in production");
const db = new PrismaClient(); const token = "smoke-qr-token-0123456789abcdefghijklmnopqrstuvwxyz";
async function main() { try {
  const entity = await db.entity.findUniqueOrThrow({ where: { code: "TORUN" } });
  const employee = await db.employee.upsert({ where: { phoneNumber: "+48500600700" }, create: { firstName: "Test", lastName: "Smoke", phoneNumber: "+48500600700" }, update: { status: "ACTIVE" } });
  await db.employeeEntity.upsert({ where: { employeeId_entityId: { employeeId: employee.id, entityId: entity.id } }, create: { employeeId: employee.id, entityId: entity.id }, update: {} });
  await db.qrCode.upsert({ where: { tokenHash: sha256(token) }, create: { type: "GENERAL", name: "Test smoke", tokenHash: sha256(token), tokenEncrypted: encrypt(token) }, update: { isActive: true } });
  console.log(JSON.stringify({ token, phone: employee.phoneNumber, entityId: entity.id }));
} finally { await db.$disconnect(); } }
main().catch((error) => { console.error(error); process.exitCode = 1; });
