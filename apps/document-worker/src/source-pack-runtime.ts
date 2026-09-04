import {readFile} from "node:fs/promises";
import {join, resolve} from "node:path";

import {sourcePackSchema, type SourcePack, type SourcePackEntry} from "@offroad/public-research";

/**
 * Frozen research: a gold case runs against its source pack and nothing else. Discovery,
 * official lookups and content acquisition all read the pack, so a change on a company's site
 * cannot change a test without changing a commit.
 */
export async function loadSourcePack(directory: string): Promise<{pack: SourcePack; read: (entry: SourcePackEntry) => Promise<Uint8Array>}> {
  const root = resolve(directory);
  const manifest = JSON.parse(await readFile(join(root, "source-pack.json"), "utf8")) as unknown;
  const pack = sourcePackSchema.parse(manifest);
  return {
    pack,
    read: async (entry) => {
      if (entry.path === null) throw Object.assign(new Error(`source pack entry ${entry.id} is not retained`), {code: "source_pack_not_retained"});
      return new Uint8Array(await readFile(join(root, entry.path)));
    },
  };
}
