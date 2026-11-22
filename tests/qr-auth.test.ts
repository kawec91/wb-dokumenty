import { describe, expect, it } from "vitest";
import { qrPdf, qrPng, qrSvg } from "@/lib/qr";
import { decrypt, encrypt } from "@/lib/portal-session";
import { roleTemplates } from "@/lib/permissions";

describe("QR i uprawnienia", () => {
  it("generuje PNG, SVG i arkusz PDF A4", async () => { const token = "a".repeat(48); expect((await qrPng(token)).subarray(1, 4).toString()).toBe("PNG"); expect(await qrSvg(token)).toContain("<svg"); expect((await qrPdf([{ token, name: "Biuro" }])).subarray(0, 5).toString()).toBe("%PDF-"); });
  it("szyfruje token QR i sesji przed zapisem", () => { const value = "sekretny-token"; const cipher = encrypt(value); expect(cipher).not.toContain(value); expect(decrypt(cipher)).toBe(value); });
  it("księgowość nie otrzymuje praw administracyjnych", () => { expect(roleTemplates.ACCOUNTING).toContain("DOCUMENT_DOWNLOAD"); expect(roleTemplates.ACCOUNTING).not.toContain("EMPLOYEE_MANAGE"); expect(roleTemplates.ACCOUNTING).not.toContain("ACCESS_MANAGE"); });
});
