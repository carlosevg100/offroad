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
    "gold:camil": "ab069947eed4edd065ab5397dd30c04ebd47ab5fff449c5482a423056439f55e",
    "gold:fakeco": "09564f499d832fe4667793f11ca749cbd508018f36c1c73a530fa3ce74fa8973",
    "gold:nimbus": "490a0cc3515732bb4bfedfd1cbd0c4e4870751f9919ece5493865897dbd8107e",
    "gold:rede-horizonte": "4e0a114333070984779c4ef9831e8e528de8e647db110735bd1f1fb63f33a426",
    "gold:camil:ask-800": "ab069947eed4edd065ab5397dd30c04ebd47ab5fff449c5482a423056439f55e",
    "aurora": "baec2ae04036dd349144ae487f1451d94fccbe861f1e10445de2ab32709ea755",
    "unit:aurora": "d73cf883035046e2a8216df980100f6af8d3d92baed45ed4d1288e92df6e952a",
    "unit:aurora-questions": "ea456848a63943d4e02897b492c1048ce91faf0e95e28f00e41758daee6d2580",
    "unit:nimbus": "013259accee6c09c1f4433c949f36a36d22b6c6ceac3886edaf97ee81691f5e9",
    "unit:nimbus-short-runway": "660b71721829825e1ce8d5e0176b76fa4526bd31dcd5ba97d25a43fb61cde6b5",
    "unit:camil-listed": "29e28409319daa3a8467d8ea9d7eb9afd564e0768fd38017cf0b5850333fcc8e",
    "unit:maturity-profile": "719a9c674beae88724bd7868580145639053c503ef2020912cd2edf78b29cda4",
    "unit:no-desk": "3c3074c79243c9b71b59c6cf01c8b54b7ae6a42b877a2e0c86b33f74aa183e2d",
    "unit:aurora-schedule-above-balance": "a4f68395507bde76e7b54ee95a62260a40c6b44221a5ae6196675f3d7008704a",
    "unit:aurora-unpriced-lines": "d8f73662486a6ea8ebdf8762d9a141a461b8cb90af0a288dd4baf3212ce46b5a",
    "unit:aurora-thin-coverage-ask": "d73cf883035046e2a8216df980100f6af8d3d92baed45ed4d1288e92df6e952a",
    "unit:aurora-thin-coverage-stack": "18b4131c4591af7060aadd01933db3d0ee1640c534ea00c99014fe8a153171fa",
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
    expect(asked.some((question) => question.pt.startsWith("Falta "))).toBe(true);
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
