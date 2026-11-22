import { describe, expect, it } from "vitest";
import { entityInputSchema, normalizePhone, storageFolderSchema } from "@/lib/validation";

describe("walidacja danych", () => {
  it.each(["../sekret", "foo/bar", "foo\\bar", "..", "x:y"])("odrzuca niebezpieczny folder %s", (value) => expect(storageFolderSchema.safeParse(value).success).toBe(false));
  it.each([["500 600 700", "+48500600700"], ["0049 151 23456789", "+4915123456789"]])("normalizuje %s do E.164", (input, output) => expect(normalizePhone(input)).toBe(output));
  it("odrzuca nieprawidłowy telefon", () => expect(() => normalizePhone("123")).toThrow());
  it("waliduje nowy podmiot i prefiks", () => expect(entityInputSchema.parse({ code: "POZNAN", displayName: "Poznań", legalName: "Firma", storageFolderName: "Poznań", numberingPrefix: "POZ", isActive: true }).code).toBe("POZNAN"));
});
