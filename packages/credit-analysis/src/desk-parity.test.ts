import {createHash} from "node:crypto";

import {describe, expect, it} from "vitest";

import {analyzeCreditPosition, type DeskAnalysis} from "./analyze";
import {deskCases} from "./desk-cases.test-support";
import {questionsForCompany} from "./questions";
import {projectLeverageTrajectory, type Trajectory} from "./trajectory";

/**
 * Byte-identity of the desk battery, the leverage trajectory and the questions to the company
 * across the move of their arithmetic into `@offroad/financial-core` (stage 19, post-closure
 * polish). The fingerprints were captured from `analyze.ts`, `trajectory.ts` and `questions.ts` as
 * increment 6C left them, before any kernel was used, over every case of `desk-cases.test-support.ts`:
 * the six desks of the verdict runs with the trajectories the verdict re-ran, the package's own
 * fixtures and the synthetic variants that reach every finding and every branch of its sentence.
 * The whole output is pinned, not only the sentences: every total, ratio, window, scenario and year
 * of the trajectory. A pin moves only with a deliberate change.
 *
 * The move of the arithmetic kept every pin. Then the questions moved fifteen of their nineteen pins
 * deliberately, for two reasons only (compared question by question: no question was added, removed,
 * reordered or given another severity). Every figure a question states is printed by financial-core
 * in the language of the question, so the English amounts carry en-US separators and the two
 * diverging amounts are joined by "and" (invariant 9); and a missing input is named in words instead
 * of by its field path, in both languages. On these cases the Portuguese changed only in the
 * missing-input questions; the four Nimbus unit cases ask nothing with an amount or a missing input
 * and keep their pins. The desk and trajectory pins are unchanged.
 */
const sha256 = (value: unknown) => createHash("sha256").update(JSON.stringify(value, null, 1)).digest("hex");

type Outputs = {desk: Record<string, DeskAnalysis>; trajectory: Record<string, Trajectory>; questions: Record<string, ReturnType<typeof questionsForCompany>>};

function outputs(): Outputs {
  const result: Outputs = {desk: {}, trajectory: {}, questions: {}};
  for (const [key, entry] of Object.entries(deskCases())) {
    const desk = entry.desk ? analyzeCreditPosition(entry.desk) : null;
    const trajectory = entry.trajectory ? projectLeverageTrajectory(entry.trajectory) : null;
    if (desk) result.desk[key] = desk;
    if (trajectory) result.trajectory[key] = trajectory;
    if (desk || entry.missing.length > 0) result.questions[key] = questionsForCompany(desk, trajectory, entry.missing);
  }
  return result;
}

const pins = {
  desk: {
    "gold:camil": "b3206f96d2fef07d5514c96c0e3af78fb8ea32806b8aad4201fb8e75f3d7a487",
    "gold:fakeco": "bdd2620c52a744320f7f3d649facb191cdca565e799416f949c5c00dda8e7570",
    "gold:nimbus": "4669a71fb0c4f7de51ccbcb80f14c39559eda4ca10b24703c9b0d02e5a6da844",
    "gold:rede-horizonte": "19acb3f2e9befc0f6e91debcda6343c74b7871516f8ec4d9e3c91c3263fc6945",
    "gold:camil:ask-800": "cd2d5a9dba382cf18283eef67360645da41c5714b6a06efce347c387ea3f78bc",
    "aurora": "d16ca628dd102d93e047ec90f1c8cfe462b88deca313a2799be6d4885a815c13",
    "unit:aurora": "e3369983b12f4f862ee8655935a2fbc2e37760dc0505e920311a3f477031e812",
    "unit:aurora-questions": "3ce5a6f28d73d463176a5ba034c194098e17d8d7a6904bc701744e4934543457",
    "unit:nimbus": "86b86b1ba59b2cc17a23000f857fdc33e92344463bc9ac135c947ff70e25d766",
    "unit:nimbus-short-runway": "49a0188b1b463baa6ba65e9dbafb7fccaf821e7c11c5286bb843678c00b9e75a",
    "unit:camil-listed": "dec36ceee429533ad7c9c4baa8f16081cd05f0e19b86937dacadd79d056bc18f",
    "unit:maturity-profile": "86e6a238d99915cad05e591024b49284f9f3aa50bd8c5de7e7930702c558fb23",
    "unit:aurora-schedule-above-balance": "0311c0c48dbfb90730c20c640e9c71a49c416a5128c83756a866b1ef35dc924a",
    "unit:aurora-unpriced-lines": "695077484085ebed41303120358fe64316ae10a04569631c035820ec70f64b10",
    "unit:aurora-thin-coverage-ask": "6ef6c199f5cb7232305ffd64095877edd14fc4548b552cc7a214665a53d683b3",
    "unit:aurora-thin-coverage-stack": "5053bdfbe9710f687da157de379c056729786f568f34a16b0ee283f0e49faee8",
    "unit:nimbus-runway-under-twelve": "416731cf4cd5a1d1c1721cf40c1b81e9fce4c113609aa17fe12d8000cb3cecaf",
    "unit:nimbus-rate-asked": "b5701289806f6c127e23bca903d0b7e1fda17c8a432a23245d882e1d2f01bf21",
  } as Record<string, string>,
  trajectory: {
    "gold:camil": "2abe4524a859bb8cbc10250a023fb64eaf7a2a4df97fc73dd9991043888f7b20",
    "gold:camil:cra:simulation-1": "b6e8bf3a836535b6a0ed2d3d05fff4f4f5a1a66bb52d39484ac2e6b15e2b85c7",
    "gold:fakeco": "ade5fc129ae03937f2ee32be5b5b1e5eed934223c21d837f3b47443295f8d128",
    "gold:fakeco:cra:simulation-1": "badb5666a008d35edde487873d745cf6157546752b4c5f6cd07fd3877ce2ddde",
    "gold:fakeco:ccb:simulation-1": "badb5666a008d35edde487873d745cf6157546752b4c5f6cd07fd3877ce2ddde",
    "gold:camil:ask-800": "0d1b73e89e6ee4fcdd2884b52db38a1ee1027346959db95086ce7599c60a6916",
    "gold:camil:cra:ask-800:simulation-1": "ff3637d1a0fe0befcd294b32f6501490ea9dd54b7441f497a94da2e36b3a4e57",
    "aurora": "de9b5d34ad7ab4c5677b438213a4c8c84db72e8aa547acad3db5f3894e139a2a",
    "aurora:ccb:simulation-1": "4bf0ee1c93980029e7823ab941489acb853afd668f0bb5455b90598a76614c88",
    "unit:aurora": "de9b5d34ad7ab4c5677b438213a4c8c84db72e8aa547acad3db5f3894e139a2a",
    "unit:aurora-questions": "7701419106985665c76f2d85ea53e60b197b0d27f415524333565c4acf42089b",
    "unit:camil-listed": "e3d4105db6f0f0e0d08a7d3b66e6798756f7972749457f3f91c938f4dd83e098",
    "unit:trajectory-held-flat": "a5adfe4097a256d6fc2587cc28fdbcb9f5174d47ec989bc01ba53939cf043047",
    "unit:trajectory-flat-line": "bb4343026b08e21336ca9cfa2df375fc98772d9ddb70431cb680c243504c5448",
    "unit:trajectory-below-base": "010ae5050e03bc6ab079a15d3e99b092358bd421be6f735396aa9e18df7d5374",
    "unit:trajectory-nearest-first": "465016d8cacd93f50b77a698255a12eca079260e6d4a0cabcab8e82701b8180d",
    "unit:trajectory-pure-swap": "4a2b73344ca34cec9430ba130deac2161a2763b94c943244d4e1467b91ee54cf",
  } as Record<string, string>,
  questions: {
    "gold:camil": "54594414a06d422e9a93fa800cb12bafd751333a55f69d9eaff9ea1f6617f44d",
    "gold:fakeco": "45d460d04b9473858ddc50cab6cac6937e4103789f8d3f791d38696aa24a6bd1",
    "gold:nimbus": "3f5e5bb300c06229336eece3017d8038c6722af1a92a70b138706b7e036bcf78",
    "gold:rede-horizonte": "b262dfdc32d6521fde0b95f02b4f21546adb53dde49497a159faec849c6ac1e7",
    "gold:camil:ask-800": "54594414a06d422e9a93fa800cb12bafd751333a55f69d9eaff9ea1f6617f44d",
    "aurora": "b28ff9c592752026e42406b99b8ff97f70da5125ba51b486caf5a6193746d76f",
    "unit:aurora": "2d2e492f232edb873afb921f977701898c36e519fcf8ee86eae4533628dfbdbf",
    "unit:aurora-questions": "e4c8f5014c1fd5a2b1bd22b372d9be325a069217480ca172b481422e798101a1",
    "unit:nimbus": "013259accee6c09c1f4433c949f36a36d22b6c6ceac3886edaf97ee81691f5e9",
    "unit:nimbus-short-runway": "660b71721829825e1ce8d5e0176b76fa4526bd31dcd5ba97d25a43fb61cde6b5",
    "unit:camil-listed": "87b3c9dc12a0d318d690adb083bfcef03803060b3138fcb187d866ce96060871",
    "unit:maturity-profile": "5cea5ed950bcd429d5f240e7e4b68ad78f0de0bf5b72e42d0909c4364819c614",
    "unit:no-desk": "097ee37a83dc684eb4d3e3b9fd8caacbc05f6652c502df1cdda86bb9572201ff",
    "unit:aurora-schedule-above-balance": "45114c09bf7137972ab19033e251b5da2ebb2696b838ea4d5c953612a8a9f732",
    "unit:aurora-unpriced-lines": "0cecb2a20faea3661bc329adb516aad4ac639ccdbd554eadf3f7cdcb48f15ba5",
    "unit:aurora-thin-coverage-ask": "2d2e492f232edb873afb921f977701898c36e519fcf8ee86eae4533628dfbdbf",
    "unit:aurora-thin-coverage-stack": "279efd3cc1aa4d9b622ae023269bf4755aea934f316b2e6036e58139c505d65f",
    "unit:nimbus-runway-under-twelve": "32c85550dcfe1396bb6ba963d2569143995174d28822ff2825921e6a55fd2299",
    "unit:nimbus-rate-asked": "013259accee6c09c1f4433c949f36a36d22b6c6ceac3886edaf97ee81691f5e9",
  } as Record<string, string>,
};

describe("the desk, the trajectory and the questions across the move to financial-core", () => {
  const {desk, trajectory, questions} = outputs();

  it("reach every finding of the battery and of the trajectory, and every branch of their sentences", () => {
    const findings = Object.values(desk).flatMap((analysis) => analysis.findings);
    expect([...new Set(findings.map((finding) => finding.id))].sort()).toEqual([
      "amount-divergence", "covenant-breach-day-one", "customer-concentration", "debt-to-arr", "grace-vs-project", "maturity-wall",
      "nrr-below-par", "rate-ask-vs-stack", "receivables-encumbrance", "runway-bought", "runway-short", "runway-stated-vs-computed",
      "short-term-principal-vs-cash", "stack-vs-balance", "thin-interest-coverage", "unparsed-rates", "wc-ask-vs-need",
    ]);
    const branches = (id: string) => [...new Set(findings.filter((finding) => finding.id === id).map((finding) => `${finding.severity}:${finding.pt.slice(0, 40)}`))];
    expect(findings.some((finding) => finding.id === "covenant-breach-day-one" && finding.pt.startsWith("A companhia já está acima do covenant"))).toBe(true);
    expect(findings.some((finding) => finding.id === "covenant-breach-day-one" && finding.pt.startsWith("A operação como solicitada"))).toBe(true);
    expect(new Set(branches("short-term-principal-vs-cash").map((branch) => branch.split(":")[0]))).toEqual(new Set(["critical", "high"]));
    expect(new Set(branches("runway-short").map((branch) => branch.split(":")[0]))).toEqual(new Set(["critical", "high"]));
    expect(new Set(branches("thin-interest-coverage").map((branch) => branch.split(":")[0]))).toEqual(new Set(["critical", "high"]));
    expect(findings.some((finding) => finding.id === "thin-interest-coverage" && finding.pt.includes(", a taxa pedida"))).toBe(true);
    expect(findings.some((finding) => finding.id === "thin-interest-coverage" && finding.pt.includes(", o custo médio do estoque"))).toBe(true);
    expect(findings.some((finding) => finding.id === "stack-vs-balance" && finding.pt.includes("fora do mapa"))).toBe(true);
    expect(findings.some((finding) => finding.id === "stack-vs-balance" && finding.pt.includes("a mais no mapa"))).toBe(true);
    expect(findings.some((finding) => finding.id === "runway-bought" && finding.pt.includes(", a taxa pedida"))).toBe(true);
    expect(findings.some((finding) => finding.id === "runway-bought" && finding.pt.includes("prática de venture debt"))).toBe(true);

    const paths = Object.values(trajectory);
    expect([...new Set(paths.flatMap((path) => path.findings.map((finding) => finding.id)))].sort())
      .toEqual(["amortization-outruns-cash", "leverage-trajectory", "liability-management", "refinancing-inside-ticket"]);
    expect(paths.some((path) => path.assumptions.ebitdaHeldFlat)).toBe(true);
    expect(paths.some((path) => path.crossings.some((crossing) => crossing.yearStressed === null))).toBe(true);
  });

  it("ask every question the desk can ask, in each of its branches", () => {
    const asked = Object.values(questions).flat();
    expect([...new Set(asked.map((question) => question.findingId.replace(/^missing:.*/, "missing")))].sort()).toEqual([
      "amount-divergence", "covenant-breach-day-one", "customer-concentration", "debt-to-arr", "grace-vs-project", "missing", "nrr-below-par",
      "rate-ask-vs-stack", "receivables-encumbrance", "runway-short", "runway-stated-vs-computed", "short-term-principal-vs-cash",
      "stack-vs-balance", "wc-ask-vs-need",
    ]);
    expect(asked.some((question) => question.pt.startsWith("A alavancagem já está acima do covenant"))).toBe(true);
    expect(asked.some((question) => question.pt.startsWith("Do jeito pedido"))).toBe(true);
    expect(asked.some((question) => question.pt.startsWith("O balanço reconhece"))).toBe(true);
    expect(asked.some((question) => question.pt.startsWith("O mapa de dívida soma"))).toBe(true);
    expect(asked.some((question) => question.pt.startsWith("A análise de crédito não pôde ser montada"))).toBe(true);
    expect(asked.some((question) => question.pt.startsWith("Para completar a análise, falta este dado:"))).toBe(true);
  });

  it("reproduces every pinned output byte for byte", () => {
    const actual = {
      desk: Object.fromEntries(Object.entries(desk).map(([key, value]) => [key, sha256(value)])),
      trajectory: Object.fromEntries(Object.entries(trajectory).map(([key, value]) => [key, sha256(value)])),
      questions: Object.fromEntries(Object.entries(questions).map(([key, value]) => [key, sha256(value)])),
    };
    expect(actual).toEqual(pins);
  });
});
