import {createHash} from "node:crypto";
import {connect} from "node:net";

/**
 * The gate (stage E0). Nothing reaches a parser before this passes.
 *
 * Three checks, in order of how cheaply they refuse a bad file:
 *
 *   1. **the bytes are the bytes we were told about** — size and SHA-256 must match what the
 *      app recorded at upload. A mismatch means the object changed between upload and
 *      processing, which is either corruption or tampering, and either way the pipeline must
 *      not build evidence on it;
 *   2. **a virus scanner has seen it** — clamd over the INSTREAM protocol, so the file never
 *      touches the filesystem to be scanned;
 *   3. only then does the document go to a parser, which has its own limits for zip bombs and
 *      hostile XML.
 *
 * If the scanner is unreachable the job **fails and retries** rather than proceeding: an
 * unscanned file quietly treated as clean is exactly the outcome this stage exists to
 * prevent (R-005).
 */
export type ScanVerdict = {
  verdict: "clean" | "infected" | "error";
  scanner: string;
  signature?: string;
  scannedAt: string;
  bytes: number;
  sha256: string;
};

export class GateError extends Error {
  readonly retryable: boolean;
  readonly code: "hash_mismatch" | "size_mismatch" | "infected" | "scanner_unavailable";
  constructor(message: string, code: GateError["code"], retryable: boolean) {
    super(message);
    this.name = "GateError";
    this.code = code;
    this.retryable = retryable;
  }
}

export function sha256Of(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function verifyIntegrity(bytes: Uint8Array, expected: {sha256?: string; byteSize?: number}): string {
  const digest = sha256Of(bytes);

  if (expected.byteSize !== undefined && expected.byteSize !== bytes.byteLength) {
    throw new GateError(
      `the file is ${bytes.byteLength} bytes but ${expected.byteSize} were recorded at upload`,
      "size_mismatch",
      false,
    );
  }
  if (expected.sha256 && expected.sha256 !== digest) {
    throw new GateError("the file content does not match the hash recorded at upload", "hash_mismatch", false);
  }

  return digest;
}

export type Scanner = {
  name: string;
  scan(bytes: Uint8Array): Promise<{clean: boolean; signature?: string}>;
};

/**
 * clamd's INSTREAM: `zINSTREAM\0`, then length-prefixed chunks, then a zero length to close.
 * The reply is `stream: OK` or `stream: <signature> FOUND`.
 */
export function createClamdScanner(options: {host: string; port: number; timeoutMs: number}): Scanner {
  return {
    name: "clamav",
    scan(bytes) {
      return new Promise((resolve, reject) => {
        const socket = connect({host: options.host, port: options.port});
        const chunks: Buffer[] = [];
        let settled = false;

        const finish = (error: Error | null, value?: {clean: boolean; signature?: string}) => {
          if (settled) return;
          settled = true;
          socket.destroy();
          if (error) reject(error);
          else resolve(value!);
        };

        socket.setTimeout(options.timeoutMs, () => {
          finish(new GateError(`the virus scanner did not answer in ${options.timeoutMs}ms`, "scanner_unavailable", true));
        });

        socket.on("error", (error) => {
          finish(new GateError(`the virus scanner is unreachable: ${error.message}`, "scanner_unavailable", true));
        });

        socket.on("data", (chunk) => chunks.push(chunk));

        socket.on("end", () => {
          const reply = Buffer.concat(chunks).toString("utf8").replace(/\0/g, "").trim();
          if (/\bOK$/.test(reply)) return finish(null, {clean: true});

          const found = /^stream:\s*(.+?)\s+FOUND$/.exec(reply);
          if (found?.[1]) return finish(null, {clean: false, signature: found[1]});

          finish(new GateError(`the virus scanner answered "${reply}"`, "scanner_unavailable", true));
        });

        socket.on("connect", () => {
          socket.write("zINSTREAM\0");
          // 64 KB chunks: comfortably under clamd's StreamMaxLength defaults.
          const chunkSize = 64 * 1024;
          for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
            const slice = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.byteLength));
            const header = Buffer.alloc(4);
            header.writeUInt32BE(slice.byteLength, 0);
            socket.write(header);
            socket.write(slice);
          }
          const terminator = Buffer.alloc(4);
          terminator.writeUInt32BE(0, 0);
          socket.write(terminator);
        });
      });
    },
  };
}

export async function runGate(
  bytes: Uint8Array,
  expected: {sha256?: string; byteSize?: number},
  scanner: Scanner | null,
  now: () => string = () => new Date().toISOString(),
): Promise<ScanVerdict> {
  const digest = verifyIntegrity(bytes, expected);

  if (!scanner) {
    // Only reachable when an operator explicitly set REQUIRE_VIRUS_SCAN=false; the verdict
    // records that no scanner ran, so the document carries the fact for review.
    return {verdict: "error", scanner: "none", scannedAt: now(), bytes: bytes.byteLength, sha256: digest, signature: "scanner_disabled"};
  }

  const result = await scanner.scan(bytes);
  if (!result.clean) {
    const verdict: ScanVerdict = {
      verdict: "infected",
      scanner: scanner.name,
      scannedAt: now(),
      bytes: bytes.byteLength,
      sha256: digest,
    };
    if (result.signature) verdict.signature = result.signature;
    return verdict;
  }

  return {verdict: "clean", scanner: scanner.name, scannedAt: now(), bytes: bytes.byteLength, sha256: digest};
}
