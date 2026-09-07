import {createHash} from "node:crypto";
import {readFile, readdir, stat, writeFile} from "node:fs/promises";
import {join} from "node:path";

import {runTool, withTempDirectory} from "./tools";

/**
 * Evidence that an exact generated Office file can be opened and rendered by the same
 * headless office stack used in production.
 *
 * This is intentionally not a visual-quality approval. Renderability proves that the bytes
 * open, produce the expected number of pages and can be rasterised for review. A separate
 * visual reviewer still has to inspect those page images before external release.
 */

export const materialRenderInspectionVersion = "2026.09.07-v1";

const formatExtension = {
  xlsx: "xlsx",
  pptx: "pptx",
  docx: "docx",
} as const;

const MAX_SOURCE_BYTES = 100 * 1024 * 1024;
const MAX_PDF_BYTES = 250 * 1024 * 1024;
const MAX_PAGE_BYTES = 50 * 1024 * 1024;
const MAX_TOTAL_PAGE_BYTES = 500 * 1024 * 1024;
const MAX_PAGES = 250;

type ToolRunner = typeof runTool;

export type MaterialRenderInspection = {
  version: typeof materialRenderInspectionVersion;
  source: {
    format: keyof typeof formatExtension;
    byteLength: number;
    sha256: string;
  };
  renderer: {
    id: "libreoffice";
    version: string;
  };
  pdf: {
    byteLength: number;
    sha256: string;
    pageCount: number;
  };
  pages: Array<{
    pageNumber: number;
    byteLength: number;
    sha256: string;
    widthPx: number;
    heightPx: number;
  }>;
  renderabilityPassed: true;
  visualInspection: "awaiting_review";
  releaseEligible: false;
  inspectedAt: string;
  receiptFingerprint: string;
};

export type MaterialRenderInspector = {
  inspect(input: {
    bytes: Uint8Array;
    contentSha256: string;
    format: keyof typeof formatExtension;
    inspectedAt: string;
  }): Promise<MaterialRenderInspection>;
};

export function createMaterialRenderInspector(options: {
  sofficeBin: string;
  pdftoppmBin: string;
  pdfinfoBin: string;
  timeoutMs: number;
  libreOfficeVersion?: string;
  run?: ToolRunner;
}): MaterialRenderInspector {
  const run = options.run ?? runTool;
  return {
    inspect: (input) => withTempDirectory(async (directory) => {
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(input.inspectedAt)) {
        throw new Error("material inspection timestamp must be an explicit UTC ISO instant");
      }
      if (input.bytes.byteLength === 0 || input.bytes.byteLength > MAX_SOURCE_BYTES) {
        throw new Error(`generated material must contain between 1 and ${MAX_SOURCE_BYTES} bytes`);
      }
      const actualSourceSha = sha256(input.bytes);
      if (actualSourceSha !== input.contentSha256) {
        throw new Error("generated material bytes do not match the expected content sha256");
      }

      const sourcePath = join(directory, `source.${formatExtension[input.format]}`);
      await writeFile(sourcePath, input.bytes);
      const conversion = await run(options.sofficeBin, [
        "--headless",
        "--norestore",
        "--safe-mode",
        "--nolockcheck",
        "--nodefault",
        `-env:UserInstallation=file://${join(directory, "profile")}`,
        "--convert-to",
        "pdf",
        "--outdir",
        directory,
        sourcePath,
      ], {timeoutMs: options.timeoutMs, cwd: directory});
      if (conversion.code !== 0) throw new Error(`LibreOffice could not render generated material${safeToolDetail(conversion.stderr)}`);

      const pdfPath = join(directory, "source.pdf");
      const pdfBytes = new Uint8Array(await readFile(pdfPath).catch(() => {
        throw new Error("LibreOffice reported success but produced no PDF");
      }));
      if (pdfBytes.byteLength === 0 || pdfBytes.byteLength > MAX_PDF_BYTES || !isPdf(pdfBytes)) {
        throw new Error("LibreOffice produced an invalid or oversized PDF");
      }

      const information = await run(options.pdfinfoBin, [pdfPath], {timeoutMs: options.timeoutMs, cwd: directory});
      if (information.code !== 0) throw new Error(`pdfinfo could not inspect rendered material${safeToolDetail(information.stderr)}`);
      const pageCount = parsePageCount(information.stdout.toString("utf8"));

      const pagePrefix = join(directory, "page");
      const raster = await run(options.pdftoppmBin, ["-png", "-r", "120", pdfPath, pagePrefix], {
        timeoutMs: options.timeoutMs,
        cwd: directory,
        maxOutputBytes: 4 * 1024 * 1024,
      });
      if (raster.code !== 0) throw new Error(`rendered pages could not be rasterised${safeToolDetail(raster.stderr)}`);

      const names = (await readdir(directory))
        .filter((name) => /^page-\d+\.png$/.test(name))
        .sort((a, b) => pageNumber(a) - pageNumber(b));
      if (names.length !== pageCount) {
        throw new Error(`rendered page count mismatch: pdfinfo reported ${pageCount}, rasteriser produced ${names.length}`);
      }

      let totalPageBytes = 0;
      const pages: MaterialRenderInspection["pages"] = [];
      for (const name of names) {
        const path = join(directory, name);
        const size = (await stat(path)).size;
        totalPageBytes += size;
        if (size === 0 || size > MAX_PAGE_BYTES || totalPageBytes > MAX_TOTAL_PAGE_BYTES) {
          throw new Error("rendered page images exceeded the material inspection limits");
        }
        const bytes = new Uint8Array(await readFile(path));
        const dimensions = pngDimensions(bytes);
        pages.push({
          pageNumber: pageNumber(name),
          byteLength: bytes.byteLength,
          sha256: sha256(bytes),
          widthPx: dimensions.width,
          heightPx: dimensions.height,
        });
      }

      const body = {
        version: materialRenderInspectionVersion as typeof materialRenderInspectionVersion,
        source: {format: input.format, byteLength: input.bytes.byteLength, sha256: actualSourceSha},
        renderer: {id: "libreoffice" as const, version: options.libreOfficeVersion ?? "unknown"},
        pdf: {byteLength: pdfBytes.byteLength, sha256: sha256(pdfBytes), pageCount},
        pages,
        renderabilityPassed: true as const,
        visualInspection: "awaiting_review" as const,
        releaseEligible: false as const,
        inspectedAt: input.inspectedAt,
      };
      return {...body, receiptFingerprint: sha256(new TextEncoder().encode(JSON.stringify(body)))};
    }),
  };
}

function parsePageCount(output: string): number {
  const match = /^Pages:\s+(\d+)\s*$/mi.exec(output);
  const pages = match ? Number.parseInt(match[1]!, 10) : 0;
  if (!Number.isSafeInteger(pages) || pages < 1 || pages > MAX_PAGES) {
    throw new Error(`rendered material page count must be between 1 and ${MAX_PAGES}`);
  }
  return pages;
}

function pageNumber(name: string): number {
  return Number.parseInt(/^page-(\d+)\.png$/.exec(name)?.[1] ?? "0", 10);
}

function isPdf(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 5 && new TextDecoder("ascii").decode(bytes.slice(0, 5)) === "%PDF-";
}

function pngDimensions(bytes: Uint8Array): {width: number; height: number} {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.byteLength < 24 || !signature.every((value, index) => bytes[index] === value)) {
    throw new Error("rasteriser produced an invalid PNG page");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  if (width < 100 || height < 100 || width > 20_000 || height > 20_000) {
    throw new Error("rendered page dimensions are outside the inspection limits");
  }
  return {width, height};
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function safeToolDetail(stderr: string): string {
  const detail = stderr.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, 300);
  return detail ? `: ${detail}` : "";
}
