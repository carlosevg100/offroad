import {createHash} from "node:crypto";
import {writeFile} from "node:fs/promises";
import {join} from "node:path";

import {describe, expect, it, vi} from "vitest";

import {createMaterialRenderInspector} from "./material-render-inspection";

const source = new TextEncoder().encode("synthetic xlsx bytes");
const sourceSha = createHash("sha256").update(source).digest("hex");

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  return bytes;
}

function successfulRunner(pageFiles = 2) {
  return vi.fn(async (bin: string, _args: readonly string[], options: {cwd?: string}) => {
    const directory = options.cwd!;
    if (bin === "soffice") {
      await writeFile(join(directory, "source.pdf"), new TextEncoder().encode("%PDF-1.7\nsynthetic"));
      return {stdout: Buffer.from(""), stderr: "", code: 0};
    }
    if (bin === "pdfinfo") return {stdout: Buffer.from("Title: Synthetic\nPages: 2\n"), stderr: "", code: 0};
    if (bin === "pdftoppm") {
      for (let page = 1; page <= pageFiles; page += 1) {
        await writeFile(join(directory, `page-${page}.png`), png(1440, 900));
      }
      return {stdout: Buffer.from(""), stderr: "", code: 0};
    }
    throw new Error(`unexpected tool ${bin}`);
  });
}

describe("generated material render inspection", () => {
  it("proves exact bytes can be opened and rasterised without claiming visual approval", async () => {
    const run = successfulRunner();
    const inspector = createMaterialRenderInspector({
      sofficeBin: "soffice",
      pdftoppmBin: "pdftoppm",
      pdfinfoBin: "pdfinfo",
      timeoutMs: 30_000,
      libreOfficeVersion: "LibreOffice 26.2",
      run,
    });

    const proof = await inspector.inspect({bytes: source, contentSha256: sourceSha, format: "xlsx", inspectedAt: "2026-09-07T12:00:00.000Z"});

    expect(proof).toMatchObject({
      source: {format: "xlsx", sha256: sourceSha, byteLength: source.byteLength},
      renderer: {id: "libreoffice", version: "LibreOffice 26.2"},
      pdf: {pageCount: 2},
      renderabilityPassed: true,
      visualInspection: "awaiting_review",
      releaseEligible: false,
    });
    expect(proof.pages).toEqual([
      expect.objectContaining({pageNumber: 1, widthPx: 1440, heightPx: 900}),
      expect.objectContaining({pageNumber: 2, widthPx: 1440, heightPx: 900}),
    ]);
    expect(proof.receiptFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(run.mock.calls[0]?.[1]).toEqual(expect.arrayContaining(["--safe-mode", "--convert-to", "pdf"]));
  });

  it("refuses bytes that do not match the governed hash before starting a tool", async () => {
    const run = successfulRunner();
    const inspector = createMaterialRenderInspector({sofficeBin: "soffice", pdftoppmBin: "pdftoppm", pdfinfoBin: "pdfinfo", timeoutMs: 30_000, run});
    await expect(inspector.inspect({bytes: source, contentSha256: "a".repeat(64), format: "xlsx", inspectedAt: "2026-09-07T12:00:00.000Z"}))
      .rejects.toThrow(/do not match/);
    expect(run).not.toHaveBeenCalled();
  });

  it("fails when the rasterised page set does not match the PDF", async () => {
    const inspector = createMaterialRenderInspector({sofficeBin: "soffice", pdftoppmBin: "pdftoppm", pdfinfoBin: "pdfinfo", timeoutMs: 30_000, run: successfulRunner(1)});
    await expect(inspector.inspect({bytes: source, contentSha256: sourceSha, format: "xlsx", inspectedAt: "2026-09-07T12:00:00.000Z"}))
      .rejects.toThrow(/page count mismatch/);
  });
});
