import { describe, expect, it } from "vitest";
import { persistFiles, validateUploadFiles } from "@/lib/files";

const pdf = () => new File([Buffer.from("%PDF-1.7\nmock")], "faktura.pdf", { type: "application/pdf" });
const jpeg = () => new File([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])], "paragon.jpg", { type: "image/jpeg" });

describe("bezpieczny upload", () => {
  it("akceptuje PDF i JPG po sprawdzeniu sygnatur", async () => expect(await validateUploadFiles([pdf(), jpeg()])).toHaveLength(2));
  it("odrzuca MIME podszywający się pod PDF", async () => await expect(validateUploadFiles([new File(["not-pdf"], "x.pdf", { type: "application/pdf" })])).rejects.toMatchObject({ code: "INVALID_FILE_TYPE" }));
  it("odrzuca więcej niż 10 stron", async () => await expect(validateUploadFiles(Array.from({ length: 11 }, pdf))).rejects.toMatchObject({ code: "INVALID_FILE_COUNT" }));
  it("odrzuca zgłoszenie większe niż 10 MB", async () => await expect(validateUploadFiles([new File([Buffer.alloc(10 * 1024 * 1024 + 1)], "x.pdf", { type: "application/pdf" })])).rejects.toMatchObject({ code: "UPLOAD_TOO_LARGE" }));
  it("tworzy katalogi współbieżnie i nigdy nie nadpisuje plików", async () => {
    const files = await validateUploadFiles([pdf()]);
    const results = await Promise.all(Array.from({ length: 4 }, () => persistFiles({ folder: "TestConcurrent", year: 2026, month: 11, reference: "TST-2026-000001", files })));
    expect(new Set(results.map((result) => result.records[0]?.storedName)).size).toBe(4);
    await Promise.all(results.map((result) => result.cleanup()));
  });
});
