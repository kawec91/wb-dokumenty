import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("schemat trwałych danych", () => {
  const schema = readFileSync("prisma/schema.prisma", "utf8"); const migration = readFileSync("prisma/migrations/20261122210000_initial_mvp/migration.sql", "utf8");
  it.each(["Entity", "Employee", "EmployeeEntity", "QrCode", "Document", "DocumentFile", "DocumentEvent", "UploadAttempt", "RateLimitState", "ApplicationMembership", "ApplicationInvitation", "MembershipPermission", "MembershipEntity", "AccountingExport", "DeviceSession", "DocumentSequence"])("zawiera model %s", (model) => expect(schema).toContain(`model ${model}`));
  it("ma unikalny folder i numer dokumentu", () => { expect(schema).toMatch(/storageFolderName\s+String\s+@unique/); expect(schema).toMatch(/referenceNumber\s+String\s+@unique/); });
  it("dostarcza migrację PostgreSQL", () => { expect(migration).toContain('CREATE TABLE "Entity"'); expect(migration).toContain('CREATE UNIQUE INDEX "Entity_storageFolderName_key"'); });
});
