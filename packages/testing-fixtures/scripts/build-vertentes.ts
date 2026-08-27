import {createHash} from "node:crypto";
import {existsSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync, mkdirSync} from "node:fs";
import {dirname, join, relative} from "node:path";
import {fileURLToPath} from "node:url";
import {gzipSync} from "node:zlib";

type TruthReceivable = {
  id: number;
  sac: number;
  emis: string;
  venc: string;
  venc_original?: string;
  valor: number;
  abat: number;
  pag: string | null;
  vpago: number;
  status: "ABERTO" | "VENCIDO" | "LIQUIDADO" | "PERDA";
  _reneg?: boolean;
};

type TruthObligor = {
  id: number;
  nome: string;
  cnpj: string;
  grupo: number;
  parte_relacionada?: boolean;
};

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, "..");
const rawRoot = join(packageRoot, "assets", "vertentes", "raw", "empresa");
const goldRoot = join(packageRoot, "gold", "vertentes");
const sourceRoot = join(goldRoot, "source");
const normalizedRoot = join(goldRoot, "normalized");
const expectedRoot = join(goldRoot, "expected");
const basePath = join(sourceRoot, "base-final.json");
const obligorsPath = join(sourceRoot, "obligors.json");
const structureCostInputPath = join(sourceRoot, "structure-cost-input.json");
const tapeRelative = "documentos/recebiveis/titulos_em_aberto_e_liquidados.csv";
const obligorsRelative = "documentos/recebiveis/Cadastro de Sacados.xlsx";
const tapePath = join(rawRoot, tapeRelative);
const obligorsAssetPath = join(rawRoot, obligorsRelative);

const hashBytes = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const hashFile = (path: string) => hashBytes(readFileSync(path));
const money = (value: number) => (Math.round(value * 100) / 100).toFixed(2);

function filesBelow(root: string): string[] {
  const visit = (directory: string): string[] => readdirSync(directory, {withFileTypes: true}).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? visit(path) : [path];
  });
  return visit(root).sort((left, right) => left.localeCompare(right));
}

const base = JSON.parse(readFileSync(basePath, "utf8")) as TruthReceivable[];
const obligors = JSON.parse(readFileSync(obligorsPath, "utf8")) as TruthObligor[];
const tapeHash = hashFile(tapePath);
const obligorsHash = hashFile(obligorsAssetPath);
const truthHash = hashFile(basePath);

const tapeRows = new Map<number, number>();
readFileSync(tapePath, "utf8").split(/\r?\n/u).slice(1).forEach((line, index) => {
  if (line.length === 0) return;
  const fields = line.split(";");
  const externalId = Number(fields[1]);
  if (!Number.isInteger(externalId)) throw new Error(`invalid title id at tape row ${index + 2}`);
  tapeRows.set(externalId, index + 2);
});
if (tapeRows.size !== base.length) throw new Error(`tape has ${tapeRows.size} rows; truth has ${base.length}`);

const titleSource = (externalId: number) => {
  const row = tapeRows.get(externalId);
  if (row === undefined) throw new Error(`title ${externalId} is absent from the raw tape`);
  return {kind: "file", fileId: `vertentes/raw/empresa/${tapeRelative}`, fileHash: tapeHash, sheet: "CSV", row};
};
const truthSource = {kind: "file", fileId: "vertentes/gold/source/base-final.json", fileHash: truthHash};

const receivables = base.map((item) => {
  const status = item.status === "LIQUIDADO" ? "settled" : item.status === "PERDA" ? "written_off" : "open";
  const openValue = status === "open" ? money(item.valor - item.abat) : "0.00";
  return {
    id: String(item.id),
    externalId: String(item.id),
    currency: "BRL",
    faceValue: money(item.valor),
    openValue,
    issueDate: item.emis,
    originalDueDate: item.venc_original ?? item.venc,
    currentDueDate: item.venc,
    obligorId: String(item.sac),
    economicGroupId: String(obligors[item.sac]?.grupo ?? item.sac),
    status,
    source: titleSource(item.id),
  };
});

const settlements = base.flatMap((item) => item.pag === null || item.vpago <= 0 ? [] : [{
  id: `settlement-${item.id}`,
  receivableId: String(item.id),
  date: item.pag,
  amount: money(item.vpago),
  source: titleSource(item.id),
}]);
const dilutions = base.flatMap((item) => item.abat <= 0 ? [] : [{
  id: `dilution-${item.id}`,
  receivableId: String(item.id),
  date: item.pag ?? "2026-06-30",
  amount: money(item.abat),
  reason: "other",
  source: titleSource(item.id),
}]);
const extensions = base.flatMap((item) => item.venc_original === undefined ? [] : [{
  id: `extension-${item.id}`,
  receivableId: String(item.id),
  date: null,
  identifiedAt: "2026-06-30",
  previousDueDate: item.venc_original,
  newDueDate: item.venc,
  reason: "synthetic ground truth; the intake intentionally omits the extension event date",
  source: truthSource,
}]);

const normalizedObligors = obligors.map((item) => ({
  id: String(item.id),
  legalName: item.nome,
  taxIdRoot: item.cnpj.replace(/\D/gu, "").slice(0, 8),
  economicGroupId: String(item.grupo),
  relatedParty: item.parte_relacionada ?? false,
  source: {kind: "file", fileId: `vertentes/raw/empresa/${obligorsRelative}`, fileHash: obligorsHash, sheet: "Cadastro", row: item.id + 4},
}));
const groups = new Map<number, number[]>();
for (const item of obligors) groups.set(item.grupo, [...(groups.get(item.grupo) ?? []), item.id]);
const economicGroups = [...groups.entries()].sort(([left], [right]) => left - right).map(([id, members]) => ({
  id: String(id),
  name: obligors[id]?.nome ?? `Economic group ${id}`,
  obligorIds: members.map(String),
  source: {kind: "file", fileId: `vertentes/raw/empresa/${obligorsRelative}`, fileHash: obligorsHash, sheet: "Cadastro", row: id + 4},
}));

const universe = {
  id: "vertentes-a1-03-v1",
  dates: {reportingDate: "2026-06-30", latestOriginationDate: "2026-06-28", dataStartDate: "2024-07-01", dataEndDate: "2026-06-28"},
  currency: "BRL",
  receivables,
  settlements,
  dilutions,
  extensions,
  repurchases: [],
  assignmentsAndLiens: [],
  obligors: normalizedObligors,
  economicGroups,
  eventCoverage: {
    settlements: {status: "complete", startDate: "2024-07-01", endDate: "2026-06-30", basis: "reserved synthetic truth reconciled to the raw title tape", limitations: []},
    dilutions: {status: "complete", startDate: "2024-07-01", endDate: "2026-06-30", basis: "reserved synthetic truth reconciled to the raw title tape", limitations: ["event-level causes are not identified; the raw cause schedule is monthly and aggregate"]},
    extensions: {status: "partial", startDate: "2024-07-01", endDate: "2026-06-30", basis: "reserved synthetic truth compared with overwritten due dates in the raw title tape", limitations: ["extension event dates are unavailable"]},
    repurchases: {status: "complete", startDate: "2024-07-01", endDate: "2026-06-30", basis: "reserved synthetic truth", limitations: ["the synthetic case contains no repurchase events"]},
    assignmentsAndLiens: {status: "not_provided", startDate: null, endDate: null, basis: "raw room", limitations: ["title-level assigned volume is not available in the intake"]},
  },
};

mkdirSync(normalizedRoot, {recursive: true});
const universeBytes = new TextEncoder().encode(`${JSON.stringify(universe)}\n`);
const legacyUniversePath = join(normalizedRoot, "universe.json");
if (existsSync(legacyUniversePath)) unlinkSync(legacyUniversePath);
const compressedUniverse = gzipSync(universeBytes, {level: 9});
writeFileSync(join(normalizedRoot, "universe.json.gz"), compressedUniverse);

const rawFiles = filesBelow(rawRoot).map((path) => ({
  path: relative(rawRoot, path),
  bytes: statSync(path).size,
  sha256: hashFile(path),
}));
if (rawFiles.length !== 21) throw new Error(`expected 21 raw files, found ${rawFiles.length}`);
const expectedFiles = filesBelow(expectedRoot).map((path) => ({
  path: relative(expectedRoot, path),
  bytes: statSync(path).size,
  sha256: hashFile(path),
}));
const manifest = {
  schemaVersion: "2026.08.27-v1",
  caseId: "A1-03",
  fixtureId: "vertentes-a1-03-v1",
  synthetic: true,
  generator: {seed: 20260826, source: "packages/testing-fixtures/generators/vertentes", version: "2026.08.26-v1"},
  dates: universe.dates,
  counts: {rawFiles: rawFiles.length, receivables: receivables.length, obligors: normalizedObligors.length, economicGroups: economicGroups.length, settlements: settlements.length, dilutions: dilutions.length, extensions: extensions.length},
  rawFiles,
  reservedTruth: [
    {path: "source/base-final.json", bytes: statSync(basePath).size, sha256: truthHash},
    {path: "source/obligors.json", bytes: statSync(obligorsPath).size, sha256: hashFile(obligorsPath)},
    {path: "source/structure-cost-input.json", bytes: statSync(structureCostInputPath).size, sha256: hashFile(structureCostInputPath)},
  ],
  normalized: {
    path: "normalized/universe.json.gz",
    bytes: compressedUniverse.byteLength,
    sha256: hashBytes(compressedUniverse),
    uncompressedBytes: universeBytes.byteLength,
    uncompressedSha256: hashBytes(universeBytes),
  },
  expectedFiles,
  knownLimitations: [
    "The raw tape overwrites 340 original due dates and does not expose extension event dates.",
    "The cancelled-invoice flag exists only in reserved synthetic truth until invoice-sample reconciliation is implemented.",
    "Buyer criteria in illustrative-eligibility.json are estimated scenario parameters, not confirmed mandate data.",
  ],
};
writeFileSync(join(goldRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Vertentes: ${receivables.length} receivables, ${rawFiles.length} raw files, universe ${compressedUniverse.byteLength} compressed bytes`);
