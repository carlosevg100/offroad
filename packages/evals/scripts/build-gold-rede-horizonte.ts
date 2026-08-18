/**
 * Writes `packages/testing-fixtures/gold/rede-horizonte/expected/fields.json`
 * from `buildRedeHorizonteGoldFields()` (see `src/gold-rede-horizonte.ts`).
 * Run: `pnpm --filter @offroad/evals gold:rede-horizonte`
 */
import {mkdirSync, writeFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import {buildRedeHorizonteGoldFields} from "../src/gold-rede-horizonte";

const here = dirname(fileURLToPath(import.meta.url));
const goldDir = join(here, "..", "..", "testing-fixtures", "gold", "rede-horizonte");
const {fields, fromFixture} = buildRedeHorizonteGoldFields();
mkdirSync(join(goldDir, "expected"), {recursive: true});
writeFileSync(join(goldDir, "expected", "fields.json"), `${JSON.stringify(fields, null, 2)}\n`, "utf8");
console.log(`wrote ${fields.length} expected fields (${fromFixture} from fixture, ${fields.length - fromFixture} from gabarito) to ${join(goldDir, "expected", "fields.json")}`);
