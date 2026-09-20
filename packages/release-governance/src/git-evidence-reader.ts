import {createHash} from "node:crypto";
import {execFile} from "node:child_process";

type Summary = {fingerprint: string; byteLength: number};
const objectLimit = 20 * 1024 * 1024;
const metadataLimit = 4 * 1024 * 1024;

function batch(root: string, args: string[], refs: string[], maxBuffer: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = execFile("git", ["cat-file", ...args, "-z"], {cwd: root, encoding: "buffer", maxBuffer, timeout: 30000}, (error, stdout) => {
      if (error) reject(error); else resolve(stdout);
    });
    child.stdin!.on("error", reject);
    child.stdin!.end(refs.join("\0") + "\0");
  });
}

/** Internal byte transport, not an authority receipt. Root and refs come from the trusted
 * evaluator. No cache survives this invocation, no filters/textconv and no symlink following.
 * Metadata is checked before content, and content batches stay within the original20MiB
 * object budget (plus bounded headers), avoiding a process per evidence object. */
export async function readGitEvidenceSummaries(root: string, requested: readonly string[]): Promise<Map<string, Summary | null>> {
  const refs = [...new Set(requested)]; const result = new Map<string, Summary | null>(refs.map(r => [r, null]));
  if (!refs.length) return result;
  if (refs.length > 10000 || refs.some(r => !/^[a-f0-9]{7,64}:[^\r\n\0]+$/.test(r))) return result;
  try {
    const metadata = (await batch(root, ["--batch-check"], refs, metadataLimit)).toString("utf8").split("\n");
    if (metadata.pop() !== "" || metadata.length !== refs.length) return result;
    const objects: {ref: string; oid: string; size: number}[] = [];
    for (const [index, line] of metadata.entries()) {
      const match = /^([a-f0-9]{40,64}) blob (\d+)$/.exec(line);
      if (!match) continue; // Missing, tree, tag and commit objects are not file evidence.
      const size = Number(match[2]);
      if (!Number.isSafeInteger(size) || size < 0 || size > objectLimit) continue;
      objects.push({ref: refs[index]!, oid: match[1]!, size});
    }
    let offset = 0;
    while (offset < objects.length) {
      const selected: typeof objects = []; let size = 0;
      while (offset < objects.length && size + objects[offset]!.size <= objectLimit) {
        const object = objects[offset++]!; selected.push(object); size += object.size;
      }
      // Every selected object is individually <= objectLimit, so the batch always advances.
      try {
        const bytes = await batch(root, ["--batch"], selected.map(o => o.ref), objectLimit + metadataLimit);
        const pending = new Map<string, Summary>(); let cursor = 0;
        for (const object of selected) {
          const newline = bytes.indexOf(10, cursor);
          if (newline < cursor || newline - cursor > 128) throw new Error("git_evidence_header_invalid");
          const header = bytes.subarray(cursor, newline).toString("ascii");
          if (header !== `${object.oid} blob ${object.size}`) throw new Error("git_evidence_object_changed");
          cursor = newline + 1;
          if (cursor + object.size >= bytes.length || bytes[cursor + object.size] !== 10) throw new Error("git_evidence_content_truncated");
          const content = bytes.subarray(cursor, cursor + object.size);
          pending.set(object.ref, {fingerprint: `sha256:${createHash("sha256").update(content).digest("hex")}`, byteLength: object.size});
          cursor += object.size + 1;
        }
        if (cursor !== bytes.length) throw new Error("git_evidence_unexpected_content");
        for (const [ref, summary] of pending) result.set(ref, summary);
      } catch { /* Entire malformed batch remains unresolved. Never issue partial receipts. */ }
    }
  } catch { /* Transport failure remains unresolved and the caller records its blocker. */ }
  return result;
}
