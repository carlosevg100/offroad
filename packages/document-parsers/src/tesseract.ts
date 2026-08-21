import {spawn} from "node:child_process";
import {mkdtemp, readFile, readdir, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";

import type {OcrEngine, OcrResult} from "./capabilities";

/**
 * Tesseract as an OCR engine, and the process helpers it needs.
 *
 * Lived in the worker until the OCR path had to be measured: the evals run the same parser the
 * worker runs, and an engine only the worker could build meant a measurement that could only
 * read born-digital files. The engine belongs with the parser it serves.
 */
export type RunResult = {stdout: Buffer; stderr: string; code: number | null};

export async function runTool(
  bin: string,
  args: readonly string[],
  options: {timeoutMs: number; input?: Uint8Array; maxOutputBytes?: number; cwd?: string},
): Promise<RunResult> {
  const maxOutput = options.maxOutputBytes ?? 256 * 1024 * 1024;

  return new Promise((resolve, reject) => {
    const child = spawn(bin, [...args], {
      cwd: options.cwd ?? undefined,
      // A document must never be able to reach the network or read our environment.
      env: {PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: options.cwd ?? tmpdir(), LC_ALL: "C.UTF-8"},
      stdio: ["pipe", "pipe", "pipe"],
    });

    const chunks: Buffer[] = [];
    let outputBytes = 0;
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new Error(`${bin} did not finish within ${options.timeoutMs}ms`));
    }, options.timeoutMs);
    timer.unref?.();

    child.stdout.on("data", (chunk: Buffer) => {
      outputBytes += chunk.byteLength;
      if (outputBytes > maxOutput) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        child.kill("SIGKILL");
        reject(new Error(`${bin} produced more than ${maxOutput} bytes`));
        return;
      }
      chunks.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < 8_192) stderr += chunk.toString("utf8");
    });

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`${bin} could not be started: ${error.message}`));
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({stdout: Buffer.concat(chunks), stderr: stderr.trim(), code});
    });

    if (options.input) child.stdin.end(Buffer.from(options.input));
    else child.stdin.end();
  });
}


export async function withTempDirectory<T>(run: (directory: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), "offroad-"));
  try {
    return await run(directory);
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
}

/** `.doc` → `.docx`, `.ppt` → `.pptx`, `.rtf`/`.odt` → `.docx`. */

/**
 * Tesseract in TSV mode, which is the only output that carries a per-word confidence. Words
 * are grouped back into their block by the ids tesseract already assigns, and the block
 * confidence is the mean of its words, that number decides whether the text is allowed to
 * become a quotable anchor at all.
 */
export function createTesseractEngine(options: {
  bin: string;
  pdftoppmBin: string;
  languages: string;
  timeoutMs: number;
  version?: string;
}): OcrEngine {
  const recognizeBytes = async (bytes: Uint8Array, extension: string): Promise<OcrResult> =>
    withTempDirectory(async (directory) => {
      const imagePath = join(directory, `page.${extension}`);
      await writeFile(imagePath, bytes);
      const result = await runTool(options.bin, [imagePath, "stdout", "-l", options.languages, "--psm", "3", "tsv"], {
        timeoutMs: options.timeoutMs,
        cwd: directory,
      });
      return parseTesseractTsv(result.stdout.toString("utf8"));
    });

  return {
    name: "tesseract",
    version: options.version ?? "unknown",
    languages: options.languages.split("+"),

    recognizeImage: ({bytes, mime}) => recognizeBytes(bytes, mime.split("/")[1] ?? "png"),

    async recognizePdfPage({bytes, pageNumber}) {
      return withTempDirectory(async (directory) => {
        const pdfPath = join(directory, "document.pdf");
        await writeFile(pdfPath, bytes);

        // 300 dpi is the usual floor for reliable OCR of scanned accounting paper.
        await runTool(
          options.pdftoppmBin,
          ["-f", String(pageNumber), "-l", String(pageNumber), "-r", "300", "-png", pdfPath, join(directory, "page")],
          {timeoutMs: options.timeoutMs, cwd: directory},
        );

        const rendered = (await readdir(directory)).find((name) => name.startsWith("page-") && name.endsWith(".png"));
        if (!rendered) throw new Error(`page ${pageNumber} could not be rendered for OCR`);

        const image = new Uint8Array(await readFile(join(directory, rendered)));
        return recognizeBytes(image, "png");
      });
    },
  };
}

/** Exported for tests: tesseract's TSV is stable and worth checking without the binary. */

export function parseTesseractTsv(tsv: string): OcrResult {
  const lines = tsv.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const header = lines.shift();
  if (!header) return {blocks: [], confidence: 0};

  const columns = header.split("\t");
  const at = (row: string[], name: string): string => {
    const index = columns.indexOf(name);
    return index === -1 ? "" : row[index] ?? "";
  };

  type Word = {text: string; confidence: number; bbox: [number, number, number, number]};
  type Accumulator = {words: string[]; confidences: number[]; left: number; top: number; right: number; bottom: number; lines: Map<string, Word[]>};
  const blocks = new Map<string, Accumulator>();

  for (const line of lines) {
    const row = line.split("\t");
    const text = at(row, "text").trim();
    if (!text) continue;

    const confidence = Number(at(row, "conf"));
    if (!Number.isFinite(confidence) || confidence < 0) continue;

    const key = [at(row, "page_num"), at(row, "block_num"), at(row, "par_num")].join(":");
    const left = Number(at(row, "left")) || 0;
    const top = Number(at(row, "top")) || 0;
    const width = Number(at(row, "width")) || 0;
    const height = Number(at(row, "height")) || 0;

    const lineKey = at(row, "line_num");
    const word: Word = {text, confidence: confidence / 100, bbox: [left, top, left + width, top + height]};
    const current = blocks.get(key);
    if (current) {
      current.words.push(text);
      current.confidences.push(confidence / 100);
      current.left = Math.min(current.left, left);
      current.top = Math.min(current.top, top);
      current.right = Math.max(current.right, left + width);
      current.bottom = Math.max(current.bottom, top + height);
      current.lines.set(lineKey, [...(current.lines.get(lineKey) ?? []), word]);
    } else {
      blocks.set(key, {
        words: [text],
        confidences: [confidence / 100],
        left,
        top,
        right: left + width,
        bottom: top + height,
        lines: new Map([[lineKey, [word]]]),
      });
    }
  }

  const built = [...blocks.values()].map((block) => ({
    text: block.words.join(" "),
    confidence: block.confidences.reduce((sum, value) => sum + value, 0) / block.confidences.length,
    bbox: [block.left, block.top, block.right, block.bottom] as [number, number, number, number],
    lines: [...block.lines.values()].map((words) => ({
      text: words.map((w) => w.text).join(" "),
      confidence: words.reduce((sum, w) => sum + w.confidence, 0) / words.length,
      bbox: [Math.min(...words.map((w) => w.bbox[0])), Math.min(...words.map((w) => w.bbox[1])), Math.max(...words.map((w) => w.bbox[2])), Math.max(...words.map((w) => w.bbox[3]))] as [number, number, number, number],
      words,
    })),
  }));

  const overall = built.length === 0 ? 0 : built.reduce((sum, block) => sum + block.confidence, 0) / built.length;
  return {blocks: built, confidence: overall};
}

/** Reads the version of an external tool once, at boot, for the run record. */

export async function toolVersion(bin: string, args: readonly string[] = ["--version"]): Promise<string> {
  try {
    const result = await runTool(bin, args, {timeoutMs: 15_000});
    const text = `${result.stdout.toString("utf8")}\n${result.stderr}`.trim();
    return text.split(/\r?\n/)[0]?.trim() || "unknown";
  } catch {
    return "unavailable";
  }
}
