import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const initialEntities = [
  { code: "TORUN", displayName: "Toruń", legalName: "CMGastro", storageFolderName: "Toruń", numberingPrefix: "TOR" },
  { code: "GDANSK", displayName: "Gdańsk", legalName: "Whitebull Gdańsk", storageFolderName: "Gdańsk", numberingPrefix: "GDA" },
  { code: "BYDGOSZCZ", displayName: "Bydgoszcz", legalName: "Whitebull Bydgoszcz", storageFolderName: "Bydgoszcz", numberingPrefix: "BYD" },
  { code: "TRADE", displayName: "Trade", legalName: "Whitebull Trade", storageFolderName: "Trade", numberingPrefix: "TRD" },
] as const;

export async function seedEntities(client: PrismaClient = prisma) {
  await client.$transaction(initialEntities.map((entity) => client.entity.upsert({
    where: { code: entity.code },
    create: entity,
    update: { displayName: entity.displayName, legalName: entity.legalName, numberingPrefix: entity.numberingPrefix },
  })));
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("prisma/seed.ts")) {
  seedEntities().finally(() => prisma.$disconnect());
}
