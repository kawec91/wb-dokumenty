import { describe, expect, it } from "vitest";
import { formatBytes, humanize } from "@/components/ui/primitives";

describe("admin presentation helpers", () => {
  it("shows Polish labels for business statuses and document categories", () => {
    expect(humanize("DO_POPRAWY")).toBe("Do poprawy");
    expect(humanize("PARAGON_Z_NIP")).toBe("Paragon z NIP");
    expect(humanize("ACCOUNTING")).toBe("Księgowość");
  });

  it("formats storage and export sizes for the interface", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});
