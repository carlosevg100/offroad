import {mkdir, writeFile} from "node:fs/promises";
import {resolve} from "node:path";

import {buildGc02ReferenceSnapshot} from "../src/gc02-reference-snapshot";

const output = resolve(process.cwd(), "docs/product/reference-products/gc02/gc02-reference-snapshot.json");
await mkdir(resolve(output, ".."), {recursive: true});
await writeFile(output, `${JSON.stringify(buildGc02ReferenceSnapshot(), null, 2)}\n`, "utf8");
console.log(output);
