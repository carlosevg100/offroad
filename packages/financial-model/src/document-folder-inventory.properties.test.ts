import {createHash} from "node:crypto";
import {describe, expect, it} from "vitest";
import {documentStatuses, inventoryFingerprint, organizeDocumentFolder, type DocumentFolderInventory, type DocumentReading} from "./document-folder-inventory";
import {prepareDocumentFolderInventoryPacket} from "./document-folder-inventory-packet";
import {auroraFolderReadings, auroraKernelInput, auroraTurnTwoInformed, auroraTurnTwoReadings} from "./document-folder-inventory.test-support";
import {folderPacketInput} from "./document-folder-inventory-runs.test-support";

const hex = (v: string) => createHash("sha256").update(`c09-property:${v}`).digest("hex");
// Review r2: invariants checked over generated combinations, not single cases. Seeded, so every run is the same.
function random(seed: number) {
  let a = seed >>> 0;
  return () => {a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296;};
}
const pick = <T>(r: () => number, list: readonly T[]) => list[Math.floor(r() * list.length)]!;
const shuffle = <T>(r: () => number, list: T[]) => {const x = [...list]; for (let n = x.length - 1; n > 0; n--) {const k = Math.floor(r() * (n + 1)); [x[n], x[k]] = [x[k]!, x[n]!];} return x;};
const readings = (edit: (r: DocumentReading[]) => void = () => undefined) => {const r = auroraFolderReadings(); edit(r); return r;};
const file = (r: DocumentReading[], id: string) => r.find((x) => x.fileId === id)!;
const run = (files: DocumentReading[], extra: Parameters<typeof auroraKernelInput>[0] = {}) => organizeDocumentFolder(auroraKernelInput({files, ...extra}));
const binds = (s: string) => s === "signed" || s === "registered";
const times = (v: string) => {const n = Number(v); return `${(Number.isInteger(n) ? n.toFixed(1) : String(n)).replace(".", ",")}x`;};
/** What the folder says economically, independent of which file arrived first. */
const economics = (o: DocumentFolderInventory) => ({effective: o.effectiveTexts, decisions: o.decisionFindings?.map((d) => [d.findingId, d.statement]) ?? null,
  findings: o.findings.map((f) => [f.id, f.code, f.effect, f.statement, f.decisionStatement]).sort(), checks: o.identityChecks, families: o.families,
  gaps: o.gaps.map((g) => [g.id, g.item]), follow: o.followUps});

describe("property: terms bind only with signature or registration", () => {
  for (const status of documentStatuses) it(`status ${status}`, () => {
    const on = (id: string) => run(readings((r) => {file(r, id).version.status = status;}));
    const amendment = on("f19");
    expect(amendment.effectiveTexts.length > 0).toBe(binds(status));
    expect(amendment.decisionFindings!.some((d) => d.findingId === "f19-amendment")).toBe(binds(status));
    const original = on("f18");
    expect(original.effectiveTexts.length > 0).toBe(binds(status));
    expect(original.findings.some((f) => f.effect === "binding_limit")).toBe(binds(status));
    expect(on("f22").decisionFindings!.some((d) => d.findingId === "f22-cessao")).toBe(binds(status));
    expect(on("f23").followUps.some((f) => f.kind === "notice_deadline")).toBe(binds(status));
    expect(on("f24").findings.some((f) => f.id === "f24-politica")).toBe(binds(status));
  });
});

/** Independent oracle for the precedence the method documents: guarantee, then date, then number; a missing
 * criterion on either side is skipped; nothing deciding means no order. Written here, not imported. */
type Spec = {id: string; date: string | null; ordinal: number | null};
const laterThan = (x: Spec, y: Spec) => (x.date !== null && y.date !== null && x.date !== y.date) ? x.date > y.date
  : (x.ordinal !== null && y.ordinal !== null && x.ordinal !== y.ordinal) ? x.ordinal > y.ordinal : false;
const undecided = (x: Spec, y: Spec) => !laterThan(x, y) && !laterThan(y, x);
/** In force for one clause type: the setter later than every other; otherwise the latest setters and those with no
 * order against them, in force only if they all say the same. */
function oracleInForce<T extends Spec>(setters: T[], same: (a: T, b: T) => boolean): {holder: T | null; conflict: T[]} {
  if (!setters.length) return {holder: null, conflict: []};
  const top = setters.find((x) => setters.every((y) => y === x || laterThan(x, y)));
  if (top) return {holder: top, conflict: []};
  const latest = setters.filter((x) => !setters.some((y) => laterThan(y, x)));
  const group = setters.filter((x) => latest.includes(x) || latest.some((m) => m !== x && undecided(m, x)));
  if (group.every((x) => same(x, group[0]!))) return {holder: [...group].sort((a, b) => a.id < b.id ? -1 : 1)[0]!, conflict: []};
  return {holder: null, conflict: group};
}
const monthEnd = (ym: string) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).toISOString().slice(0, 10);
const prepay = ["Pré-pagamento livre a qualquer tempo.", "Pré-pagamento vedado antes do vencimento."] as const;

describe("property: amendments by the one precedence, with text-only clauses, missing dates and conflicts resolved later", () => {
  type A = Spec & {ratio: string | null; prepay: string | null};
  const generate = (r: () => number): A[] => Array.from({length: 2 + Math.floor(r() * 3)}, (_, k) => {
    const covenant = r() < 0.7, text = !covenant || r() < 0.4;
    return {id: `a${k + 1}`, date: pick(r, ["2023-06", "2024-06", "2025-03", null] as const), ordinal: pick(r, [null, 1, 2] as const),
      ratio: covenant ? pick(r, ["2.5", "2.8", "3", "3.5"] as const) : null, prepay: text ? pick(r, prepay) : null};
  });
  const build = (a: A): DocumentReading => {const f19 = file(auroraFolderReadings(), "f19"); return {...structuredClone(f19), fileId: a.id, sha256: hex(a.id), fileName: `${a.id}.pdf`,
    period: {label: a.date ?? "sem data", start: a.date ? `${a.date}-01` : null, end: a.date ? monthEnd(a.date) : null},
    version: {label: "registrado", status: "registered", ordinal: a.ordinal, lastUpdated: null}, instrument: {ref: `deb-ad-${a.id}`, label: "aditamento", amends: "deb-aurora-1"},
    clauses: [...a.ratio ? [{type: "financial_covenant" as const, id: "covenant", at: {page: 2, section: null}, statement: `Dívida líquida / EBITDA de no máximo ${a.ratio.replace(".", ",")}x.`, metric: "net_debt_to_ebitda" as const, maxRatio: a.ratio}] : [],
      ...a.prepay ? [{type: "prepayment" as const, id: "prepay", at: {page: 3, section: null}, statement: a.prepay}] : []]};};
  const generated = Array.from({length: 60}, (_, n) => generate(random(1000 + n)));
  it("the generated chains cover missing dates, text-only ties, number ties and conflicts later resolved", () => {
    const seen = new Set<string>();
    for (const chain of generated) {
      if (chain.some((a) => a.date === null)) seen.add("missing-date");
      for (const type of ["ratio", "prepay"] as const) {
        const setters = chain.filter((a) => a[type] !== null), o = oracleInForce(setters, (x, y) => x[type] === y[type]);
        if (o.conflict.length) seen.add(`conflict-${type}`);
        if (o.holder && setters.some((x) => setters.some((y) => x !== y && undecided(x, y) && x[type] !== y[type]))) seen.add(`resolved-later-${type}`);
      }
    }
    expect([...seen].sort()).toEqual(["conflict-prepay", "conflict-ratio", "missing-date", "resolved-later-prepay", "resolved-later-ratio"]);
  });
  generated.forEach((chain, n) => it(`chain ${n + 1}`, () => {
    const r = random(5000 + n), base = readings((list) => {list.splice(list.indexOf(file(list, "f19")), 1);}), amendments = chain.map(build);
    const outputs = [0, 1, 2].map(() => run([...base, ...shuffle(r, amendments)]));
    for (const o of outputs.slice(1)) expect(economics(o)).toEqual(economics(outputs[0]!));
    const o = outputs[0]!, text = o.effectiveTexts.find((t) => t.instrumentRef === "deb-aurora-1")!;
    const cov = oracleInForce(chain.filter((a) => a.ratio !== null), (x, y) => x.ratio === y.ratio), pre = oracleInForce(chain.filter((a) => a.prepay !== null), (x, y) => x.prepay === y.prepay);
    const covenantSetters = chain.filter((a) => a.ratio !== null);
    // Text in force and current conflicts, both clause types.
    expect(text.clauses.find((c) => c.type === "financial_covenant")?.fileId ?? null).toBe(cov.holder?.id ?? (covenantSetters.length || cov.conflict.length ? null : "f18"));
    expect(text.clauses.find((c) => c.type === "prepayment")?.fileId ?? null).toBe(pre.holder?.id ?? null);
    expect(text.conflicts.map((c) => [c.type, c.fileIds])).toEqual([...cov.conflict.length ? [["financial_covenant", cov.conflict.map((x) => x.id).sort()]] : [],
      ...pre.conflict.length ? [["prepayment", pre.conflict.map((x) => x.id).sort()]] : []]);
    // Open conflict findings only for current conflicts; resolved ones only as history.
    expect(o.findings.filter((f) => f.code === "amendment_conflict").map((f) => f.id.split("-conflict-")[1]).sort())
      .toEqual([...cov.conflict.length ? ["financial-covenant"] : [], ...pre.conflict.length ? ["prepayment"] : []].sort());
    // The covenant stated as in force is the oracle's, in every field.
    const policy = o.findings.find((f) => f.id === "f24-politica")!.statement;
    if (cov.holder) {
      expect(policy).toContain(`covenant vigente de ${times(cov.holder.ratio!)}`);
      const before = covenantSetters.filter((y) => laterThan(cov.holder!, y)), imm = before.filter((y) => !before.some((z) => laterThan(z, y)));
      const prior = imm.length === 0 ? "2.75" : imm.every((y) => y.ratio === imm[0]!.ratio) ? imm[0]!.ratio! : null;
      const headline = o.decisionFindings!.filter((d) => /O covenant .* é o do aditamento/.test(d.statement));
      if (prior === null) expect(headline).toEqual([]);
      else {
        expect(headline.map((d) => d.findingId)).toEqual([`${cov.holder.id}-amendment`]);
        const verb = Number(cov.holder.ratio) > Number(prior) ? "elevou" : Number(cov.holder.ratio) < Number(prior) ? "reduziu" : "manteve";
        expect(headline[0]!.statement).toContain(`o aditamento ${verb} o covenant para ${times(cov.holder.ratio!)}`);
        const change = o.findings.find((f) => f.id === `${cov.holder!.id}-amendment`)!.changes!.find((c) => c.type === "financial_covenant")!;
        expect([change.current, change.before !== null, change.after.fileId]).toEqual([true, true, cov.holder.id]);
      }
    } else if (covenantSetters.length) expect(policy).toContain("covenant vigente não está definido");
    for (const f of o.findings.filter((x) => x.code === "amendment_in_force" && x.effect === "binding_limit")) expect([cov.holder?.id, pre.holder?.id]).toContain(f.anchor);
  }));
});

describe("property: competing originals resolved by the same precedence before any amendment", () => {
  type O = Spec & {ratio: string};
  for (let n = 1; n <= 30; n++) it(`originals ${n}`, () => {
    const r = random(7000 + n), count = 1 + Math.floor(r() * 3), withAmendment = r() < 0.5;
    const specs: O[] = Array.from({length: count}, (_, k) => ({id: `o${k + 1}`, date: pick(r, ["2021-10", "2022-03", null] as const), ordinal: pick(r, [null, 1, 2] as const), ratio: pick(r, ["2.75", "4"] as const)}));
    const f18 = file(auroraFolderReadings(), "f18");
    const originals = specs.map((s) => ({...structuredClone(f18), fileId: s.id, sha256: hex(s.id), fileName: `${s.id}.pdf`,
      period: {label: s.date ?? "sem data", start: s.date ? `${s.date}-01` : null, end: s.date ? monthEnd(s.date) : null}, version: {label: "registrada", status: "registered" as const, ordinal: s.ordinal, lastUpdated: null},
      clauses: f18.clauses.map((c) => c.type === "financial_covenant" ? {...c, maxRatio: s.ratio, statement: `Dívida líquida / EBITDA de no máximo ${s.ratio.replace(".", ",")}x, apurado anualmente.`} : c)}));
    const files = readings((list) => {list.splice(list.indexOf(file(list, "f18")), 1); if (!withAmendment) list.splice(list.indexOf(file(list, "f19")), 1);});
    const o = run([...files, ...shuffle(r, originals)]);
    const winner = oracleInForce(specs, (x, y) => x.ratio === y.ratio).holder;
    const covenant = !winner ? null : withAmendment ? "3" : winner.ratio;
    const text = o.effectiveTexts.find((t) => t.instrumentRef === "deb-aurora-1");
    expect(o.findings.some((f) => f.code === "instrument_conflict")).toBe(winner === null && count > 1);
    if (withAmendment) expect(text?.fileIds[0] ?? null).toBe(winner?.id ?? null); else expect(text).toBeUndefined();
    const policy = o.findings.find((f) => f.id === "f24-politica")!.statement;
    expect(policy).toContain(covenant === null ? "covenant vigente não está definido" : `covenant vigente de ${times(covenant)}`);
    if (winner && withAmendment) {
      const change = o.findings.find((f) => f.id === "f19-amendment")!.changes!.find((c) => c.type === "financial_covenant")!;
      expect(change.before!.fileId).toBe(winner.id);
      expect(o.decisionFindings!.find((d) => d.findingId === "f19-amendment")!.statement).toContain(Number(winner.ratio) < 3 ? "elevou o covenant para 3,0x" : "reduziu o covenant para 3,0x");
    }
  });
});

describe("property: positions by the one precedence, ties of date broken by the version number", () => {
  type P = Spec;
  for (let n = 1; n <= 30; n++) it(`positions ${n}`, () => {
    const r = random(9000 + n), count = 2 + Math.floor(r() * 2);
    const specs: P[] = Array.from({length: count}, (_, k) => ({id: `t${k + 1}`, date: pick(r, ["2025-12-31", "2026-06-30", null] as const), ordinal: pick(r, [null, 1, 2] as const)}));
    const f16 = file(auroraFolderReadings(), "f16");
    const tables = specs.map((s) => ({...structuredClone(f16), fileId: s.id, sha256: hex(s.id), fileName: `${s.id}.xlsx`,
      period: {label: s.date ?? "sem data", start: s.date, end: s.date}, version: {label: "gerencial", status: "management" as const, ordinal: s.ordinal, lastUpdated: null}}));
    const files = readings((list) => {for (const id of ["f16", "f17"]) list.splice(list.indexOf(file(list, id)), 1);});
    const o = run([...files, ...shuffle(r, tables)]);
    const family = o.families.find((f) => f.id === "debt_schedule:aurora")!;
    const top = specs.find((x) => specs.every((y) => y === x || laterThan(x, y)));
    if (top) {
      expect([family.prevails, family.superseded]).toEqual([[top.id], specs.filter((x) => x !== top).map((x) => x.id).sort()]);
      for (const l of specs.filter((x) => x !== top)) expect(o.rows.find((x) => x.fileId === l.id)!.situationLabel)
        .toBe(top.date !== null && l.date !== null && top.date !== l.date ? "lida; superada" : `lida; superada pela v${top.ordinal}`);
    } else expect([family.resolution, family.sideBySide]).toEqual(["unresolved", specs.map((x) => x.id).sort()]);
  });
});

describe("property: a page is completed only from one reading; substitutes share identity and suspension by hash", () => {
  for (let n = 1; n <= 30; n++) it(`substitutes ${n}`, () => {
    const r = random(11000 + n), count = 1 + Math.floor(r() * 3);
    const specs = Array.from({length: count}, (_, k) => ({id: `s${k + 1}x`, hash: pick(r, ["h1", "h2", "h3"] as const), text: pick(r, prepay)}));
    const [s01] = auroraTurnTwoReadings();
    const subs = specs.map((s) => ({...structuredClone(s01!), fileId: s.id, fileName: `${s.id}.pdf`, sha256: hex(s.hash),
      clauses: [{type: "prepayment" as const, id: "texto", at: {page: 7, section: null}, statement: s.text}]}));
    const prior = run(auroraFolderReadings());
    const o = run([...auroraFolderReadings(), ...shuffle(r, subs)], {asOf: "2026-09-02", prior: {inventory: prior, fingerprint: inventoryFingerprint(prior)}});
    // Oracle: a hash read two ways is out; of the rest, one page reading or none.
    const byHash = new Map<string, Set<string>>();
    for (const s of specs) byHash.set(s.hash, (byHash.get(s.hash) ?? new Set()).add(s.text));
    const usable = specs.filter((s) => byHash.get(s.hash)!.size === 1), texts = new Set(usable.map((s) => s.text));
    const completed = usable.length > 0 && texts.size === 1;
    expect(o.rows.find((x) => x.fileId === "f20")!.situation.read).toBe(completed ? "complete" : "partial");
    const suspendedIds = specs.filter((s) => byHash.get(s.hash)!.size > 1).map((s) => s.id).sort();
    expect(o.readingConflicts.filter((c) => c.sha256 !== null).flatMap((c) => c.fileIds).sort()).toEqual(suspendedIds);
    expect(o.readingConflicts.some((c) => c.page === 7)).toBe(usable.length > 0 && texts.size > 1);
    const quoted = o.findings.flatMap((f) => f.quoted ? [f.quoted.fileId] : []);
    for (const id of suspendedIds) expect(quoted).not.toContain(id);
    if (completed) expect(o.findings.find((f) => f.code === "clause" && f.anchor === "f20")!.quoted!.text).toBe([...texts][0]);
  });
});

describe("property: every page a reading names exists in the file", () => {
  type Place = [string, (d: DocumentReading, page: number) => void];
  const places: Place[] = [["figure", (d, p) => {d.figures.push({id: "x", metric: "cash", value: "1", scale: "1", at: {page: p, section: null}});}],
    ["clause", (d, p) => {d.clauses.push({type: "prepayment", id: "x", at: {page: p, section: null}, statement: "Pré-pagamento livre."});}],
    ["observation", (d, p) => {d.observations.push({id: "x", at: {page: p, section: null}, topic: "other", statement: "Nota."});}],
    ["unreadable page", (d, p) => {d.legibility.unreadablePages.push({page: p, reason: "illegible_scan", expectedContent: null, expectedFrom: null});}],
    ["expected source", (d, p) => {d.legibility.unreadablePages.push({page: 1, reason: "illegible_scan", expectedContent: "o anexo", expectedFrom: {page: p, section: null}});}]];
  for (let n = 1; n <= 40; n++) it(`pages ${n}`, () => {
    const r = random(13000 + n), size = 3 + Math.floor(r() * 18), page = 1 + Math.floor(r() * 25), [name, place] = pick(r, places);
    const attempt = () => run(readings((list) => {const d = file(list, "f25"); d.legibility.pageCount = size; d.observations[0]!.at = {page: 2, section: null}; place(d, page);}));
    const otherRule = name === "expected source" && page === 1;
    if (page > size) expect(attempt, `${name} on ${page} of ${size}`).toThrow("document_inventory_page_outside_file");
    else if (otherRule) expect(attempt).toThrow("document_inventory_expected_content_without_legible_source");
    else if (name === "unreadable page" && page === 2) expect(attempt).toThrow("document_inventory_content_on_unreadable_page");
    else expect(attempt).not.toThrow();
  });
});

describe("property: a hash read two ways is suspended for every use, whatever arrived first", () => {
  const mutations: [string, (d: DocumentReading) => void][] = [
    ["ebitda", (d) => {d.figures[0]!.value = "99";}], ["kind", (d) => {d.kind = "debt_schedule";}], ["entity", (d) => {d.entity = {primaryId: "outra", label: "Outra"};}],
    ["period", (d) => {d.period = {label: "2024", start: "2024-01-01", end: "2024-12-31"};}], ["status", (d) => {d.version.status = "draft";}],
    ["clause", (d) => {d.clauses.push({type: "prepayment", id: "x", at: {page: 3, section: null}, statement: "Pré-pagamento livre."});}]];
  for (const [name, mutate] of mutations) for (const first of [false, true]) it(`${name}, copy first: ${first}`, () => {
    const build = (copyFirst: boolean) => readings((r) => {const c = file(r, "f30"); mutate(c); if (copyFirst) {r.splice(r.indexOf(c), 1); r.unshift(c);}});
    const o = run(build(first)), other = run(build(!first));
    expect(economics(o)).toEqual(economics(other));
    const touches = (ids: string[]) => ids.some((id) => id === "f01" || id === "f30");
    expect(o.findings.filter((f) => f.code !== "reading_conflict" && (touches([f.anchor]) || touches(f.sources.map((s) => s.fileId))))).toEqual([]);
    expect(o.families.filter((f) => touches([...f.prevails, ...f.superseded, ...f.sideBySide]))).toEqual([]);
    expect(o.identityChecks.filter((c) => touches(c.fileIds))).toEqual([]);
    expect(o.rows.filter((r) => ["f01", "f30"].includes(r.fileId)).map((r) => r.situation.read)).toEqual(["conflicted", "conflicted"]);
  });
});

describe("property: the method's voice never carries reading text; reading text leaves only as an anchored quote or the row's own reading", () => {
  const inject = (r: DocumentReading[], mark: string) => {
    const tag = (s: string) => `${s} ${mark}`;
    for (const d of r) {
      d.description = tag(d.description); d.entity.label = tag(d.entity.label); d.period.label = tag(d.period.label); d.version.label = tag(d.version.label);
      if (d.instrument) d.instrument.label = tag(d.instrument.label);
      if (d.asset) d.asset.label = tag(d.asset.label);
      for (const p of d.legibility.unreadablePages) if (p.expectedContent) p.expectedContent = tag(p.expectedContent);
      for (const u of d.units) u.section = tag(u.section);
      for (const x of [...d.figures, ...d.clauses, ...d.observations]) if (x.at.section) x.at.section = tag(x.at.section);
      for (const c of d.clauses) {c.statement = tag(c.statement); if (c.type === "assignment_prohibition") c.counterparty = tag(c.counterparty);}
      for (const o of d.observations) o.statement = tag(o.statement);
      if (d.debtTable) {d.debtTable.lines.forEach((l) => {l.label = tag(l.label);}); if (d.debtTable.at.section) d.debtTable.at.section = tag(d.debtTable.at.section);}
    }
    return r;
  };
  const allowed = /(\.rows\.\d+\.(description|entity|period|version)|\.(quoted|before|after)\.(text|section)|\.section|\.documentary\.\d+\.text)$/;
  const leaks = (value: unknown, mark: string, path = ""): string[] => typeof value === "string" ? (value.includes(mark) && !allowed.test(path) ? [path] : [])
    : Array.isArray(value) ? value.flatMap((v, n) => leaks(v, mark, `${path}.${n}`))
    : value && typeof value === "object" ? Object.entries(value).flatMap(([k, v]) => k === "contributions" ? [] : leaks(v, mark, `${path}.${k}`)) : [];
  const modes = ["organize", "organize_only", "organize_for_debt"] as const;
  for (let seed = 1; seed <= 12; seed++) it(`seed ${seed}`, () => {
    const r = random(seed * 7), mark = `MARCA${Math.floor(r() * 1e6)}LIVRE`, mode = pick(r, modes), turnTwo = r() < 0.5, noDecisions = r() < 0.3;
    const files = inject(auroraFolderReadings(), mark);
    const two = turnTwo ? {files: inject(auroraTurnTwoReadings(), mark)} : false;
    const p = prepareDocumentFolderInventoryPacket(folderPacketInput({files, mode, turnTwo: two, ...noDecisions ? {decisions: []} : {}}));
    expect(p.result.inventory).not.toBeNull();
    expect(leaks(p, mark)).toEqual([]);
  });
});

describe("property: what an unreadable page holds needs a legible anchor; a substitute is read only on its declared pages", () => {
  const anchors: [string, {page: number | null; section: string | null} | null, boolean][] = [["none", null, false], ["section only", {page: null, section: "Índice"}, false],
    ["the unreadable page", {page: 7, section: null}, false], ...[1, 2, 3, 5, 8, 14].map((p): [string, {page: number; section: null}, boolean] => [`legible page ${p}`, {page: p, section: null}, true])];
  for (const [name, from, ok] of anchors) it(`expected content anchored on ${name}`, () => {
    const attempt = () => run(readings((r) => {file(r, "f20").legibility.unreadablePages[0]!.expectedFrom = from;}));
    if (ok) expect(attempt().findings.find((f) => f.id === "f20-unreadable-p7")!.quoted).toEqual({fileId: "f20", page: from!.page, section: null, text: "a cláusula de reforço da cessão"});
    else expect(attempt).toThrow("document_inventory_expected_content_without_legible_source");
  });
  const placements: [string, (d: DocumentReading, page: number) => void][] = [
    ["figure", (d, page) => {d.figures.push({id: "fig", metric: "cash", value: "1", scale: "1", at: {page, section: null}});}],
    ["clause", (d, page) => {d.clauses[0]!.at = {page, section: null};}],
    ["observation", (d, page) => {d.observations.push({id: "obs", at: {page, section: null}, topic: "other", statement: "Nota."});}],
    ["debt table", (d, page) => {d.debtTable = {lines: [{id: "l", lineKind: "other", label: "Linha", drawn: "1", limit: null, counted: "1"}], reportedTotal: "1", scale: "1", at: {page, section: null}};}]];
  for (const [name, place] of placements) for (const page of [6, 7, 8]) it(`substitute ${name} on page ${page}`, () => {
    const second = auroraTurnTwoReadings().map((x) => {if (x.fileId === "s01") place(x, page); return x;});
    const prior = run(auroraFolderReadings());
    const attempt = () => run([...auroraFolderReadings(), ...second], {asOf: "2026-09-02", informed: auroraTurnTwoInformed, prior: {inventory: prior, fingerprint: inventoryFingerprint(prior)}});
    if (page === 7) expect(attempt().update!.rowsUpdated).toEqual(["f20"]);
    else expect(attempt).toThrow("document_inventory_substitute_outside_its_pages");
  });
});

describe("property: every quote points to the file and the page or sheet it was read on", () => {
  it.each([false, true])("calibration, turn two: %s", (two) => {
    const p = prepareDocumentFolderInventoryPacket(folderPacketInput({turnTwo: two})), inv = p.result.inventory!;
    const all = [...auroraFolderReadings(), ...auroraTurnTwoReadings()], byId = new Map(all.map((f) => [f.fileId, f]));
    const quotes = [...inv.findings.flatMap((f) => f.quoted ? [f.quoted] : []), ...inv.gaps.flatMap((g) => g.quoted ? [g.quoted] : []), ...p.readings!.documentary];
    expect(quotes.length).toBeGreaterThan(5);
    for (const q of quotes) {
      const f = byId.get(q.fileId)!;
      const places = [...f.clauses.map((c) => ({text: c.statement, at: c.at})), ...f.observations.map((o) => ({text: o.statement, at: o.at})),
        ...f.legibility.unreadablePages.flatMap((u) => u.expectedContent ? [{text: u.expectedContent, at: u.expectedFrom!}] : [])];
      expect(places.some((x) => x.text === q.text && x.at.page === q.page && x.at.section === q.section), `${q.fileId}: ${q.text}`).toBe(true);
    }
    expect(inv.findings.find((f) => f.id === "f09-superseded")!.quoted).toMatchObject({fileId: "f10", section: "Notas"});
  });
});
