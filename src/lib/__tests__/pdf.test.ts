import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadPdfBlob, safeFileName } from "../pdf";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("safeFileName", () => {
  it("removes Vietnamese and German accents", () => {
    expect(safeFileName("Nguyễn Văn Tuấn")).toBe("Nguyen_Van_Tuan");
    expect(safeFileName("Đức Jörg Müller")).toBe("Duc_Jorg_Muller");
  });

  it("always returns a usable fallback", () => {
    expect(safeFileName("///")).toBe("Stundenzettel");
  });
});

describe("downloadPdfBlob", () => {
  it("downloads directly without opening a share sheet", () => {
    vi.useFakeTimers();
    const anchor = { href: "", download: "", click: vi.fn() };
    const appendChild = vi.fn();
    const removeChild = vi.fn();
    const createObjectURL = vi.fn(() => "blob:pdf");
    const revokeObjectURL = vi.fn();

    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    vi.stubGlobal("document", {
      createElement: vi.fn(() => anchor),
      body: { appendChild, removeChild },
    });

    downloadPdfBlob(new Blob(["pdf"], { type: "application/pdf" }), "test.pdf");

    expect(anchor.href).toBe("blob:pdf");
    expect(anchor.download).toBe("test.pdf");
    expect(appendChild).toHaveBeenCalledWith(anchor);
    expect(anchor.click).toHaveBeenCalledOnce();
    expect(removeChild).toHaveBeenCalledWith(anchor);

    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:pdf");
  });
});
