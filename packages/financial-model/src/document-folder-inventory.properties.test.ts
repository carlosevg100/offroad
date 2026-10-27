import {describe, expect, it} from "vitest";
import {documentStatuses, inventoryFingerprint, organizeDocumentFolder, type DocumentFolderInventory, type DocumentReading} from "./document-folder-inventory";
import {prepareDocumentFolderInventoryPacket} from "./document-folder-inventory-packet";
import {auroraFolderReadings, auroraKernelInput, auroraTurnTwoInformed, auroraTurnTwoReadings} from "./document-folder-inventory.test-support";
import {folderPacketInput} from "./document-folder-inventory-runs.test-support";

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

describe("property: amendments apply by their own date and number, never by arrival, and a tie with different terms has no winner", () => {
  const dates = ["2023-06", "2024-06", "2025-03"] as const, ratios = ["2.5", "2.8", "3", "3.5"] as const;
  const generate = (r: () => number) => Array.from({length: 2 + Math.floor(r() * 3)}, (_, k) => ({id: `a${k + 1}`, ym: pick(r, dates), ordinal: pick(r, [null, 1, 2] as const), ratio: pick(r, ratios)}));
  it("the generated chains cover ties with different terms, ties with equal terms, rises and cuts", () => {
    const kinds = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const chain = generate(random(seed)), steps = new Map<string, Set<string>>();
      for (const a of chain) steps.set(`${a.ym}|${a.ordinal ?? 0}`, (steps.get(`${a.ym}|${a.ordinal ?? 0}`) ?? new Set()).add(a.ratio));
      for (const [s, v] of steps) if (chain.filter((a) => `${a.ym}|${a.ordinal ?? 0}` === s).length > 1) kinds.add(v.size > 1 ? "tie-different" : "tie-equal");
      const ordered = [...steps.keys()].sort().map((s) => steps.get(s)!).filter((v) => v.size === 1).map((v) => Number([...v][0]));
      for (let n = 1; n < ordered.length; n++) kinds.add(ordered[n]! > ordered[n - 1]! ? "rise" : ordered[n]! < ordered[n - 1]! ? "cut" : "same");
    }
    expect([...kinds].sort()).toEqual(expect.arrayContaining(["cut", "rise", "tie-different", "tie-equal"]));
  });
  for (let seed = 1; seed <= 40; seed++) it(`chain ${seed}`, () => {
    const r = random(seed), chain = generate(r);
    const base = readings((list) => {list.splice(list.indexOf(file(list, "f19")), 1);});
    const f19 = file(auroraFolderReadings(), "f19");
    const amendments = chain.map((a) => ({...structuredClone(f19), fileId: a.id, sha256: a.id.padEnd(64, "0"), fileName: `${a.id}.pdf`,
      period: {label: a.ym, start: `${a.ym}-01`, end: new Date(Date.UTC(Number(a.ym.slice(0, 4)), Number(a.ym.slice(5, 7)), 0)).toISOString().slice(0, 10)},
      version: {label: "registrado", status: "registered" as const, ordinal: a.ordinal, lastUpdated: null},
      instrument: {ref: `deb-ad-${a.id}`, label: "aditamento", amends: "deb-aurora-1"},
      clauses: [{type: "financial_covenant" as const, id: "covenant", at: {page: 2, section: null}, statement: `Dívida líquida / EBITDA de no máximo ${a.ratio.replace(".", ",")}x.`, metric: "net_debt_to_ebitda" as const, maxRatio: a.ratio}]}));
    // Independent oracle: steps by date then number; distinct terms in one step leave the covenant undefined.
    const steps = [...new Set(chain.map((a) => `${a.ym}|${a.ordinal ?? 0}`))].sort();
    let current: string | null = "2.75", holder: string | null = "f18", previous: string | null = null;
    for (const s of steps) {
      const values = [...new Set(chain.filter((a) => `${a.ym}|${a.ordinal ?? 0}` === s).map((a) => Number(a.ratio)))];
      previous = current;
      if (values.length > 1) {current = null; holder = null;} else {current = String(values[0]); holder = chain.filter((a) => `${a.ym}|${a.ordinal ?? 0}` === s).map((a) => a.id).sort()[0]!;}
    }
    const outputs = [0, 1, 2].map(() => run([...base, ...shuffle(r, amendments)]));
    const e = economics(outputs[0]!);
    for (const o of outputs.slice(1)) expect(economics(o)).toEqual(e);
    const o = outputs[0]!, text = o.effectiveTexts[0]!;
    const inForce = text.clauses.find((c) => c.type === "financial_covenant");
    if (current === null) {
      expect(inForce).toBeUndefined();
      expect(text.conflicts.some((c) => c.type === "financial_covenant")).toBe(true);
      expect(o.decisionFindings!.some((d) => /O covenant .* é o do aditamento/.test(d.statement))).toBe(false);
      expect(o.findings.find((f) => f.id === "f24-politica")!.statement).not.toContain("covenant vigente de");
    } else {
      expect(inForce!.fileId).toBe(holder);
      const headline = o.decisionFindings!.filter((d) => /O covenant .* é o do aditamento/.test(d.statement));
      if (holder === "f18") expect(headline).toEqual([]);
      else {
        expect(headline.map((d) => d.findingId)).toEqual([`${holder}-amendment`]);
        const verb = previous === null ? "fixou" : Number(current) > Number(previous) ? "elevou" : Number(current) < Number(previous) ? "reduziu" : "manteve";
        expect(headline[0]!.statement).toContain(`o aditamento ${verb} o covenant para ${times(current)}`);
      }
      // A replaced covenant is never stated as the one in force, in any field.
      for (const f of o.findings.filter((x) => x.effect === "binding_limit" && x.code === "amendment_in_force")) expect(f.anchor).toBe(holder);
      expect(o.findings.find((f) => f.id === "f24-politica")!.statement).toContain(`covenant vigente de ${times(current === "2.75" ? "2.75" : current)}`);
    }
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
  const allowed = /(\.rows\.\d+\.(description|entity|period|version)|\.quoted\.(text|section)|\.section|\.documentary\.\d+\.text)$/;
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
