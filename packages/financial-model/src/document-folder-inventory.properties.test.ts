import {createHash} from "node:crypto";
import {describe, expect, it} from "vitest";
import {documentFolderInventoryOutputSchema, documentStatuses, inventoryFingerprint, organizeDocumentFolder, organizeDocumentFolderTraced, type DocumentFolderInventory, type DocumentReading} from "./document-folder-inventory";
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

/** Brute-force oracle, written apart from the method: every missing date or number is filled with every value
 * that places it below, between, equal to or above the values present; in each filling the version with the
 * highest (guarantee, date, number) in lexicographic order wins, if it is alone at the top. A version prevails
 * only if it wins in every filling. The possible winners are those that win in some filling. */
type Spec = {id: string; g?: number; date: string | null; ordinal: number | null};
type Field = "date" | "ordinal";
function fillings<T>(values: (T | null)[], domain: T[]): T[][] {
  return values.reduce<T[][]>((acc, v) => acc.flatMap((prefix) => (v === null ? domain : [v]).map((x) => [...prefix, x])), [[]]);
}
function bruteForce(members: Spec[], fields: Field[]) {
  const dates = [...new Set(members.flatMap((m) => m.date ? [m.date] : []))].sort();
  const dateDomain = ["0", ...dates.flatMap((d) => [d, `${d}!`]), "~"];
  const ords = [...new Set(members.flatMap((m) => m.ordinal !== null ? [m.ordinal] : []))].sort((a, b) => a - b);
  const ordDomain = [-1, ...ords.flatMap((o) => [o, o + 0.5]), 99];
  const dateFills = fields.includes("date") ? fillings(members.map((m) => m.date), dateDomain) : [members.map(() => "")];
  const ordFills = fields.includes("ordinal") ? fillings(members.map((m) => m.ordinal), ordDomain) : [members.map(() => 0)];
  const winners = new Set<string>(); let ties = false;
  for (const ds of dateFills) for (const os of ordFills) {
    const key = (n: number): [number, string, number] => [members[n]!.g ?? 0, ds[n]!, os[n]!];
    const cmp = (a: [number, string, number], b: [number, string, number]) => a[0] !== b[0] ? a[0] - b[0] : a[1] !== b[1] ? (a[1] < b[1] ? -1 : 1) : a[2] - b[2];
    let best = [0]; for (let n = 1; n < members.length; n++) {const c = cmp(key(n), key(best[0]!)); if (c > 0) best = [n]; else if (c === 0) best.push(n);}
    if (best.length > 1) ties = true;
    for (const n of best) winners.add(members[n]!.id);
  }
  return {winner: !ties && winners.size === 1 ? [...winners][0]! : null, possible: [...winners].sort()};
}
const monthEnd = (ym: string) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).toISOString().slice(0, 10);
const prepay = ["Pré-pagamento livre a qualquer tempo.", "Pré-pagamento vedado antes do vencimento."] as const;
const covenantClause = (ratio: string, id = "covenant", page = 2) => ({type: "financial_covenant" as const, id, at: {page, section: null}, statement: `Dívida líquida / EBITDA de no máximo ${ratio.replace(".", ",")}x.`, metric: "net_debt_to_ebitda" as const, maxRatio: ratio});

describe("property: amendments by the one filter, against a brute-force oracle (numbers 1 to 4 with absences, two clauses in one file, future effect)", () => {
  type A = Spec & {ratios: string[]; prepay: string | null; future: boolean};
  const generate = (r: () => number): A[] => Array.from({length: 2 + Math.floor(r() * 3)}, (_, k) => {
    const covenant = r() < 0.75, twice = covenant && r() < 0.2, text = !covenant || r() < 0.35;
    const ratio = pick(r, ["2.5", "2.8", "3", "3.5"] as const);
    return {id: `a${k + 1}`, date: pick(r, ["2023-06", "2024-06"] as const), ordinal: pick(r, [null, 1, 2, 3, 4] as const), future: r() < 0.12,
      ratios: covenant ? (twice ? [ratio, r() < 0.5 ? ratio : pick(r, ["2.5", "4"] as const)] : [ratio]) : [], prepay: text ? pick(r, prepay) : null};
  });
  const build = (a: A): DocumentReading => {const f19 = file(auroraFolderReadings(), "f19"); const start = a.future ? "2027-01" : a.date;
    return {...structuredClone(f19), fileId: a.id, sha256: hex(a.id), fileName: `${a.id}.pdf`,
      period: {label: start ?? "sem data", start: start ? `${start}-01` : null, end: start ? monthEnd(start) : null},
      version: {label: "registrado", status: "registered", ordinal: a.ordinal, lastUpdated: null}, instrument: {ref: `deb-ad-${a.id}`, label: "aditamento", amends: "deb-aurora-1"},
      clauses: [...a.ratios.map((x, n) => covenantClause(x, n ? `covenant-${n}` : "covenant", 2 + n)), ...a.prepay ? [{type: "prepayment" as const, id: "prepay", at: {page: 5, section: null}, statement: a.prepay}] : []]};};
  const generated = Array.from({length: 80}, (_, n) => generate(random(20000 + n)));
  /** One clause type: the content each setter says, or a unique marker when the file says two different things. */
  const contentOf = (a: A, type: "ratio" | "prepay") => type === "prepay" ? a.prepay : !a.ratios.length ? null : new Set(a.ratios).size > 1 ? `conflito-${a.id}` : a.ratios[0]!;
  it("the generated chains cover absences, numbers 1 to 4, two clauses in one file, future effect and undetermined orders", () => {
    const seen = new Set<string>();
    for (const chain of generated) {
      if (chain.some((a) => a.ordinal === 4) && chain.some((a) => a.ordinal === 1)) seen.add("ordinals");
      if (chain.some((a) => a.ratios.length > 1 && new Set(a.ratios).size > 1)) seen.add("two-clauses-differ");
      if (chain.some((a) => a.ratios.length > 1 && new Set(a.ratios).size === 1)) seen.add("two-clauses-same");
      if (chain.some((a) => a.future)) seen.add("future");
      const setters = chain.filter((a) => a.ratios.length && !a.future);
      if (setters.length > 1) seen.add(bruteForce(setters, ["date", "ordinal"]).winner ? "determined" : "undetermined");
    }
    expect([...seen].sort()).toEqual(["determined", "future", "ordinals", "two-clauses-differ", "two-clauses-same", "undetermined"]);
  });
  generated.forEach((chain, n) => it(`chain ${n + 1}`, () => {
    const r = random(30000 + n), base = readings((list) => {list.splice(list.indexOf(file(list, "f19")), 1);}), amendments = chain.map(build);
    const outputs = [0, 1, 2].map(() => run([...base, ...shuffle(r, amendments), auroraTurnTwoReadings()[0]!]));
    for (const o of outputs.slice(1)) expect(economics(o)).toEqual(economics(outputs[0]!));
    const o = outputs[0]!, text = o.effectiveTexts.find((t) => t.instrumentRef === "deb-aurora-1");
    const current = chain.filter((a) => !a.future);
    expect(text!.future.map((x) => x.fileId)).toEqual(chain.filter((a) => a.future).map((a) => a.id).sort());
    // Oracle for the guard: the whole chain is withheld if anything in it is future or in conflict.
    const outcome = (type: "ratio" | "prepay") => {
      const setters = current.filter((a) => contentOf(a, type) !== null);
      if (!setters.length) return {holder: type === "ratio" ? "f18" : null, conflict: false};
      const bf = bruteForce(setters, ["date", "ordinal"]);
      if (bf.winner) {const w = setters.find((a) => a.id === bf.winner)!; return contentOf(w, type)!.startsWith("conflito") ? {holder: null, conflict: true} : {holder: w.id, conflict: false};}
      const contents = new Set(setters.map((a) => contentOf(a, type)));
      return contents.size > 1 || [...contents][0]!.startsWith("conflito") ? {holder: null, conflict: true} : {holder: "equal-text", conflict: false};
    };
    const blocked = chain.some((a) => a.future) || chain.some((a) => new Set(a.ratios).size > 1) || outcome("ratio").conflict || outcome("prepay").conflict;
    const headline = o.decisionFindings!.filter((d) => /O covenant .* é o do aditamento/.test(d.statement));
    expect(text!.knowledge === "known").toBe(!blocked);
    if (blocked) {
      expect(text!.clauses).toEqual([]);
      expect(headline).toEqual([]);
      expect(o.findings.filter((f) => f.effect === "binding_limit")).toEqual([]);
      expect(o.findings.some((f) => f.code === "effect_blocked" && f.anchor === "f18" && f.knowledge === text!.knowledge)).toBe(true);
      return;
    }
    for (const type of ["ratio", "prepay"] as const) {
      const inForce = text!.clauses.find((c) => c.type === (type === "ratio" ? "financial_covenant" : "prepayment")) ?? null, x = outcome(type);
      if (x.holder === "equal-text") expect(inForce).not.toBeNull(); else expect(inForce?.fileId ?? null).toBe(x.holder);
    }
    // The headline names a rise or a cut only against a documented predecessor found by the oracle.
    const setters = current.filter((a) => contentOf(a, "ratio") !== null), bf = setters.length ? bruteForce(setters, ["date", "ordinal"]) : null;
    if (bf?.winner) {
      const w = setters.find((a) => a.id === bf.winner)!, rest = setters.filter((a) => a !== w);
      const pr = rest.length ? bruteForce(rest, ["date", "ordinal"]).winner : "f18";
      const prior = pr === "f18" ? "2.75" : pr ? contentOf(rest.find((a) => a.id === pr)!, "ratio") : null;
      if (prior === null) expect(headline).toEqual([]);
      else {
        const verb = Number(w.ratios[0]) > Number(prior) ? "elevou" : Number(w.ratios[0]) < Number(prior) ? "reduziu" : "manteve";
        expect(headline.map((d) => d.findingId)).toEqual([`${w.id}-amendment`]);
        expect(headline[0]!.statement).toContain(`o aditamento ${verb} o covenant para ${times(w.ratios[0]!)}`);
      }
    } else expect(headline).toEqual([]);
  }));
});

describe("property: competing originals by the one filter, against the brute-force oracle", () => {
  for (let n = 1; n <= 40; n++) it(`originals ${n}`, () => {
    const r = random(40000 + n), count = 1 + Math.floor(r() * 3), withAmendment = r() < 0.5;
    const specs = Array.from({length: count}, (_, k) => ({id: `o${k + 1}`, g: 2, date: pick(r, ["2021-10", "2022-03"] as const), ordinal: pick(r, [null, 1, 2, 3, 4] as const), ratio: pick(r, ["2.75", "4"] as const)}));
    const f18 = file(auroraFolderReadings(), "f18");
    const originals = specs.map((s) => ({...structuredClone(f18), fileId: s.id, sha256: hex(s.id), fileName: `${s.id}.pdf`,
      period: {label: s.date ?? "sem data", start: s.date ? `${s.date}-01` : null, end: s.date ? monthEnd(s.date) : null}, version: {label: "registrada", status: "registered" as const, ordinal: s.ordinal, lastUpdated: null},
      clauses: f18.clauses.map((c) => c.type === "financial_covenant" ? {...c, maxRatio: s.ratio, statement: `Dívida líquida / EBITDA de no máximo ${s.ratio.replace(".", ",")}x, apurado anualmente.`} : c)}));
    const files = readings((list) => {list.splice(list.indexOf(file(list, "f18")), 1); if (!withAmendment) list.splice(list.indexOf(file(list, "f19")), 1);});
    // The CCB's page 7 is supplied, so every debt instrument is read in full and the policy can be compared.
    const o = run([...files, ...shuffle(r, originals), auroraTurnTwoReadings()[0]!]);
    const bf = bruteForce(specs, ["date", "ordinal"]);
    const same = new Set(bf.possible.map((id) => specs.find((s) => s.id === id)!.ratio)).size === 1;
    const policy = o.findings.find((f) => f.id === "f24-politica")!.statement;
    if (bf.winner) {
      const w = specs.find((s) => s.id === bf.winner)!;
      expect(o.findings.some((f) => f.code === "instrument_conflict")).toBe(false);
      expect(policy).toContain(`covenant vigente de ${times(withAmendment ? "3" : w.ratio)}`);
      if (withAmendment) expect(o.findings.find((f) => f.id === "f19-amendment")!.changes!.find((c) => c.type === "financial_covenant")!.before!.fileId).toBe(w.id);
    } else if (!same) {
      expect(o.findings.some((f) => f.code === "instrument_conflict")).toBe(true);
      expect(policy).not.toContain("covenant vigente de");
    }
  });
});

describe("property: positions by the one filter (numbers 1 to 4 with absences), against the brute-force oracle", () => {
  for (let n = 1; n <= 40; n++) it(`positions ${n}`, () => {
    const r = random(50000 + n), count = 2 + Math.floor(r() * 3);
    const specs = Array.from({length: count}, (_, k) => ({id: `t${k + 1}`, g: 1, date: pick(r, ["2025-12-31", "2026-06-30"] as const), ordinal: pick(r, [null, 1, 2, 3, 4] as const)}));
    const f16 = file(auroraFolderReadings(), "f16");
    const tables = specs.map((s) => ({...structuredClone(f16), fileId: s.id, sha256: hex(s.id), fileName: `${s.id}.xlsx`,
      period: {label: s.date ?? "sem data", start: s.date, end: s.date}, version: {label: "gerencial", status: "management" as const, ordinal: s.ordinal, lastUpdated: null}}));
    const files = readings((list) => {for (const id of ["f16", "f17"]) list.splice(list.indexOf(file(list, id)), 1);});
    const o = run([...files, ...shuffle(r, tables)]);
    const family = o.families.find((f) => f.id === "debt_schedule:aurora")!, bf = bruteForce(specs, ["date", "ordinal"]);
    if (bf.winner) expect([family.prevails, family.superseded]).toEqual([[bf.winner], specs.filter((x) => x.id !== bf.winner).map((x) => x.id).sort()]);
    else expect([family.resolution, family.prevails]).toEqual(["unresolved", []]);
  });
  it("an absent date is outside the supported domain and refused by name", () => {
    expect(() => run(readings((list) => {file(list, "f19").period = {label: "sem data", start: null, end: null};}))).toThrow("document_inventory_unsupported_reading:period");
    expect(() => run(readings((list) => {file(list, "f16").referenceDate = null;}))).toThrow("document_inventory_unsupported_reading:reference_date");
    expect(() => run(readings((list) => {file(list, "f22").entity = {primaryId: null, label: "x"};}))).toThrow("document_inventory_unsupported_reading:entity");
    expect(() => run(readings((list) => list.push({...structuredClone(file(list, "f19")), fileId: "f31", sha256: hex("f31"), instrument: {ref: "deb-ad2", label: "x", amends: "deb-aurora-1-ad1"}}))))
      .toThrow("document_inventory_unsupported_amendment_chain");
  });
});

describe("property: recovered pages join the instrument before force is resolved; nothing recovered revives what was replaced", () => {
  for (let n = 1; n <= 40; n++) it(`recovered ${n}`, () => {
    const r = random(60000 + n), copies = pick(r, [0, 1, 2] as const), agree = r() < 0.6, amendment = pick(r, ["none", "registered", "draft", "future"] as const);
    // The packaging contract's renewal clause sits on page 11, unread; substitutes may recover it; an amendment may replace it.
    const files = readings((list) => {const c = file(list, "f23"); c.clauses = c.clauses.filter((x) => x.type !== "auto_renewal"); c.legibility = {pageCount: 12, unreadablePages: [{page: 11, reason: "illegible_scan", expectedContent: null, expectedFrom: null}], wholeFile: null};
      if (amendment !== "none") list.push({...structuredClone(c), fileId: "e1", sha256: hex(`e1-${n}`), fileName: "e1.pdf", legibility: {pageCount: null, unreadablePages: [], wholeFile: null},
        period: amendment === "future" ? {label: "2027", start: "2027-01-01", end: "2027-01-31"} : {label: "ago/2026", start: "2026-08-01", end: "2026-08-31"},
        version: {label: "x", status: amendment === "draft" ? "draft" : "registered", ordinal: null, lastUpdated: null}, instrument: {ref: "contrato-embalagem-ad", label: "aditivo", amends: "contrato-embalagem"},
        clauses: [{type: "auto_renewal", id: "renovacao", at: {page: 1, section: null}, statement: "Renovação automática salvo aviso até 2/nov/26.", termEnd: "2026-12-31", noticeDeadline: "2026-11-02"}]});});
    const subs = Array.from({length: copies}, (_, k) => ({...structuredClone(auroraTurnTwoReadings()[0]!), fileId: `p${k + 1}`, fileName: `p${k + 1}.pdf`, sha256: hex(`p${k + 1}-${n}`),
      kind: "supplier_contract" as const, instrument: {ref: "contrato-embalagem", label: "contrato", amends: null}, substitutesPages: {instrumentRef: "contrato-embalagem", pages: [11]},
      clauses: [{type: "auto_renewal" as const, id: "renovacao", at: {page: 11, section: null}, statement: "Renovação automática salvo aviso até 2/out/26.", termEnd: "2026-12-31",
        noticeDeadline: k > 0 && !agree ? "2026-10-15" : "2026-10-02"}]}));
    const o = run([...files, ...subs]);
    // Oracle: the amendment in force replaces whatever the original says; otherwise the original's clause counts only if one reading recovered it.
    const recoveredOne = copies > 0 && (copies === 1 || agree);
    // Under the guard: no deadline unless the whole contract chain is known (page recovered by one reading, nothing future).
    const expected = !recoveredOne || amendment === "future" ? null : amendment === "registered" ? ["e1", "2026-11-02"] : ["f23", "2026-10-02"];
    const deadlines = o.followUps.flatMap((f) => f.kind === "notice_deadline" ? [[f.fileId, f.date]] : []);
    expect(deadlines).toEqual(expected ? [expected] : []);
    expect(o.decisionFindings!.filter((d) => d.effect === "deadline").length).toBe(expected ? 1 : 0);
    expect(o.rows.find((x) => x.fileId === "f23")!.situation.read).toBe(recoveredOne ? "complete" : "partial");
  });
  it("a covenant recovered from a page joins the text in force before the policy is compared", () => {
    const two = auroraTurnTwoReadings().map((x) => x.fileId === "s01" ? {...x, clauses: [covenantClause("2", "covenant-ccb", 7)]} : x);
    const prior = run(auroraFolderReadings());
    const o = run([...auroraFolderReadings(), ...two], {asOf: "2026-09-02", informed: auroraTurnTwoInformed, prior: {inventory: prior, fingerprint: inventoryFingerprint(prior)}});
    expect(o.findings.find((f) => f.id === "f24-politica")!.statement).toContain("covenant vigente de 2,0x");
  });
});

describe("property: a predecessor that may sit on an unread page is not a documented predecessor", () => {
  for (const unread of [false, true]) for (const ratio of ["2.5", "3"]) it(`original covenant ${unread ? "on an unread page" : "absent from a full reading"}, amendment ${ratio}`, () => {
    const o = run(readings((list) => {const e = file(list, "f18"); e.clauses = e.clauses.filter((c) => c.type !== "financial_covenant");
      if (unread) e.legibility = {pageCount: 30, unreadablePages: [{page: 18, reason: "illegible_scan", expectedContent: "o covenant financeiro", expectedFrom: {page: 2, section: null}}], wholeFile: null};
      const a = file(list, "f19"); a.clauses = [covenantClause(ratio), a.clauses[1]!];}));
    const covenantHeadline = o.decisionFindings!.filter((d) => /O covenant .* é o do aditamento/.test(d.statement));
    if (unread) {
      // The guard withholds the whole text in force of the instrument: no change, no verb, no statement of absence.
      expect(covenantHeadline).toEqual([]);
      expect(o.findings.some((f) => f.id === "f19-amendment")).toBe(false);
      expect(o.findings.find((f) => f.id === "f18-blocked-text-in-force")!.knowledge).toBe("unread");
      return;
    }
    const f19 = o.findings.find((f) => f.id === "f19-amendment")!;
    expect(f19.statement).not.toMatch(/Elevou|Reduziu|elevou|reduziu/);
    {
      expect(covenantHeadline[0]!.statement).toContain(`não há covenant financeiro`);
      expect(f19.statement).toContain(`Fixou o covenant para ${times(ratio)}`);
    }
  });
});

describe("property: two clauses of one type in one document are a conflict unless they say the same or a scope separates them", () => {
  for (const [name, second, expectPolicy] of [["same text", {statement: "Aprova política de endividamento com dívida líquida / EBITDA de no máximo 2,5x", maxRatio: "2.5", scope: undefined}, true],
    ["different limit", {statement: "Política de dívida líquida / EBITDA de no máximo 3,5x", maxRatio: "3.5", scope: undefined}, false],
    ["different scope", {statement: "Política de dívida líquida / EBITDA de no máximo 3,5x", maxRatio: "3.5", scope: "controlada"}, true]] as const) it(name, () => {
    const o = run(readings((list) => {const m = file(list, "f24"); m.clauses.push({type: "debt_policy", id: "politica-2", at: {page: 4, section: null}, metric: "net_debt_to_ebitda", ...second.scope ? {scope: second.scope} : {}, statement: second.statement, maxRatio: second.maxRatio});}));
    expect(o.findings.some((f) => f.id === "f24-politica" && f.effect === "policy_limit")).toBe(expectPolicy);
    expect(o.findings.some((f) => f.code === "clause_conflict")).toBe(!expectPolicy);
  });
  for (const second of ["3", "4"]) it(`covenant twice in the amendment, ${second}`, () => {
    for (const reverse of [false, true]) {
      const o = run(readings((list) => {const a = file(list, "f19"); a.clauses.push(second === "3" ? {...a.clauses[0]!, id: "covenant-2", at: {page: 4, section: null}} : covenantClause(second, "covenant-2", 4)); if (reverse) a.clauses.reverse();}));
      const inForce = o.effectiveTexts[0]!.clauses.find((c) => c.type === "financial_covenant");
      if (second === "3") expect(inForce!.fileId).toBe("f19"); else {expect(inForce).toBeUndefined(); expect(o.findings.some((f) => f.code === "clause_conflict")).toBe(true);}
    }
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
    expect(o.findings.filter((f) => (f.effect !== null || f.knowledge === "known") && f.code !== "reading_conflict" && (touches([f.anchor]) || touches(f.sources.map((s) => s.fileId))))).toEqual([]);
    expect(o.families.filter((f) => touches([...f.prevails, ...f.superseded, ...f.sideBySide]))).toEqual([]);
    expect(o.identityChecks.filter((c) => c.status !== "not_run" && touches(c.fileIds))).toEqual([]);
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

describe("property: dependencies proven by tracking; every state injected into every judged document, by brute force", () => {
  const shape = documentFolderInventoryOutputSchema.shape;
  const effectCodes = (shape.findings.element.shape.effect.unwrap() as unknown as {options: string[]}).options;
  type State = "future" | "unread" | "missing_source" | "conflict";
  const second = new Set(auroraTurnTwoReadings().map((f) => f.fileId));
  /** The two turns, traced: the prior inventory, then the update with every effect's tracked and judged documents. */
  const traced = (edit: (files: DocumentReading[]) => void = () => undefined) => {
    const files = [...auroraFolderReadings(), ...auroraTurnTwoReadings()]; edit(files);
    const isSecond = (f: DocumentReading) => second.has(f.fileId.replace(/-x$/, ""));
    const base = files.filter((f) => !isSecond(f)), extra = files.filter(isSecond);
    const prior = run(base);
    const informed = prior.questions.some((q) => q.id === "circulacao-f02") ? auroraTurnTwoInformed : [];
    return organizeDocumentFolderTraced(auroraKernelInput({files: [...base, ...extra], asOf: "2026-09-02", informed, prior: {inventory: prior, fingerprint: inventoryFingerprint(prior)}}));
  };
  // Generic injections, the same for any document; each returns the state it should produce, or null when it does not apply.
  const inject: Record<State, (files: DocumentReading[], id: string) => State | null> = {
    unread: (files, id) => {
      const d = file(files, id); if (d.substitutesPages || d.legibility.wholeFile) return null;
      const located = [...d.figures, ...d.clauses, ...d.observations, ...d.debtTable ? [d.debtTable] : []];
      for (const x of located) x.at = {page: x.at.page ?? 1, section: x.at.section};
      const page = Math.max(1, d.legibility.pageCount ?? 0, ...located.map((x) => x.at.page!), ...d.legibility.unreadablePages.map((p) => p.page)) + 1;
      d.legibility = {pageCount: page, unreadablePages: [...d.legibility.unreadablePages, {page, reason: "illegible_scan", expectedContent: null, expectedFrom: null}], wholeFile: null};
      // The same bytes are read the same way: every copy of the hash carries the injected reading.
      for (const x of files.filter((y) => y !== d && y.sha256 === d.sha256)) files.splice(files.indexOf(x), 1, {...structuredClone(d), fileId: x.fileId, fileName: x.fileName});
      return "unread";
    },
    conflict: (files, id) => {const d = file(files, id); files.push({...structuredClone(d), fileId: `${id}-x`, fileName: `${id}-x.pdf`, description: `${d.description} (outra leitura)`}); return "conflict";},
    future: (files, id) => {
      const d = file(files, id); if (d.legibility.wholeFile) return null;
      for (const x of files.filter((y) => y.sha256 === d.sha256)) x.version = {...x.version, lastUpdated: "2027-01-15"};
      return "future";
    },
    // A source absent or outside the registry, where that does not change what the document is: an instrument outside
    // the registry (its chain is by reference), or the only document of a month removed.
    missing_source: (files, id) => {
      const d = file(files, id); if (d.legibility.wholeFile || d.substitutesPages) return null;
      if (d.instrument) {for (const x of files.filter((y) => y.sha256 === d.sha256)) x.entity = {...x.entity, primaryId: "fora-do-cadastro"}; return "missing_source";}
      if (d.kind === "trial_balance" && !files.some((x) => x !== d && x.kind === d.kind && x.period.start === d.period.start)) {files.splice(files.indexOf(d), 1); return "missing_source";}
      return null;
    },
  };
  /** The injection matrix over any input: every state into every document an emitted effect judged. */
  function matrix(name: string, variant: (files: DocumentReading[]) => void) {
    const baseline = traced(variant);
    const emitted = baseline.traces.filter((t) => t.emitted);
    it(`${name}: every effect read only what its guard judged`, () => {
      expect(emitted.length).toBeGreaterThanOrEqual(5);
      for (const t of baseline.traces) for (const x of t.tracked) expect(t.guarded, `${t.effect} read ${x}`).toContain(x);
      for (const t of emitted) expect(t.state, t.effect).toBe("known");
    });
    const all = () => {const f = [...auroraFolderReadings(), ...auroraTurnTwoReadings()]; variant(f); return f;};
    const judged = [...new Set(emitted.flatMap((t) => t.guarded))].filter((x) => !x.endsWith("-x")).sort();
    for (const id of judged) for (const state of ["unread", "conflict", "future", "missing_source"] as const) it(`${name}: ${id} ${state}`, () => {
      let expected: State | null = null;
      const o = traced((files) => {variant(files); expected = inject[state](files, id);});
      if (expected === null) return;
      for (const t of o.traces) for (const x of t.tracked) expect(t.guarded, `${t.effect} read ${x}`).toContain(x);
      const files = all(), sha = file(files, id).sha256, same = files.filter((f) => f.sha256 === sha).map((f) => f.fileId);
      for (const b of emitted) {
        const after = o.traces.find((t) => t.effect === b.effect);
        const touched = same.some((x) => b.guarded.includes(x) && !(expected === "unread" && b.ignoreUnread.includes(x)));
        if (!touched) {expect(after?.emitted, `control ${b.effect}`).toBe(true); continue;}
        expect(after?.emitted ?? false, `${b.effect} withheld`).toBe(false);
        const rank = (x: string) => ["known", "future", "unread", "missing_source", "conflict"].indexOf(x);
        const declared = after ? rank(after.state) >= rank(expected!)
          : o.inventory.findings.some((f) => f.knowledge === expected && (f.anchor === id || f.sources.some((x) => x.fileId === id || b.guarded.includes(x.fileId))));
        expect(declared, `${b.effect} declared as ${expected}`).toBe(true);
      }
    });
  }
  it("the schema's effects are all present in the full calibration", () => {
    expect([...new Set(traced().inventory.findings.flatMap((f) => f.effect ? [f.effect] : []))].sort()).toEqual([...effectCodes].sort());
  });
  matrix("calibration", () => undefined);
  // Generated inputs off the nominal configuration.
  matrix("parent statements of another period only", (files) => {for (const id of ["f01", "f02", "f30"]) files.splice(files.indexOf(file(files, id)), 1);});
  matrix("covenant recovered on a signed page", (files) => {const s01 = file(files, "s01"); s01.clauses = [covenantClause("2", "covenant-ccb", 7)];});
  matrix("two amendments in a row", (files) => files.push({...structuredClone(file(files, "f19")), fileId: "f31", fileName: "f31.pdf", sha256: hex("f31-chain"),
    period: {label: "jun/2024", start: "2024-06-01", end: "2024-06-30"}, referenceDate: {kind: "update", date: "2024-06-30", origin: "stated_month"}, instrument: {ref: "deb-aurora-1-ad2", label: "2º aditamento", amends: "deb-aurora-1"},
    clauses: [covenantClause("2.8")]}));

});

describe("property: a check runs only on whole months matching the report's period exactly", () => {
  for (let n = 1; n <= 24; n++) it(`period ${n}`, () => {
    const r = random(70000 + n), startDay = pick(r, [1, 1, 2, 15] as const), endDay = pick(r, [30, 30, 29, 15] as const);
    const start = `2026-01-${String(startDay).padStart(2, "0")}`, end = `2026-06-${String(endDay).padStart(2, "0")}`;
    const files = [...readings((list) => {file(list, "f12").period = {label: "1S26", start, end};}), auroraTurnTwoReadings()[1]!];
    const c = run(files).identityChecks.find((x) => x.kind === "period_against_months")!;
    const whole = startDay === 1 && endDay === 30;
    expect([c.status, c.reason]).toEqual(whole ? ["matches", null] : ["not_run", "partial_period"]);
  });
});

describe("property: a recovered page carries the copy's own documentary force", () => {
  for (const status of documentStatuses) it(`copy ${status}`, () => {
    const two = auroraTurnTwoReadings().map((x) => x.fileId === "s01" ? {...x, version: {...x.version, status}, clauses: [covenantClause("1", "covenant-ccb", 7)]} : x);
    const prior = run(auroraFolderReadings());
    const o = run([...auroraFolderReadings(), ...two], {asOf: "2026-09-02", informed: auroraTurnTwoInformed, prior: {inventory: prior, fingerprint: inventoryFingerprint(prior)}});
    const strong = binds(status);
    expect(o.rows.find((x) => x.fileId === "f20")!.situation.read).toBe(strong ? "complete" : "partial");
    expect(o.findings.some((f) => f.code === "substitute_not_binding")).toBe(!strong);
    expect(o.findings.find((f) => f.id === "f24-politica")!.statement.includes("covenant vigente de 1,0x")).toBe(strong);
  });
});

describe("property: an existence that enables an effect is judged with it", () => {
  for (const when of [null, "2026-05-01", "2027-01-15"]) it(`parent statements of another period, updated ${when}`, () => {
    const o = organizeDocumentFolderTraced(auroraKernelInput({files: readings((list) => {for (const id of ["f01", "f02", "f30"]) list.splice(list.indexOf(file(list, id)), 1); file(list, "f03").version.lastUpdated = when;})}));
    const t = o.traces.find((x) => x.effect === "perimeter:f04")!;
    expect(t.guarded).toContain("f03");
    expect(t.emitted).toBe(when !== "2027-01-15");
  });
});
