import {z} from "zod";

/**
 * Every way a Brazilian mid-market company can raise debt, and what each one actually costs it.
 *
 * This is the answer to a question the company came here unable to answer: "essa operação sai
 * como o quê?" Nobody running a R$ 80 million supermarket chain should be expected to know that
 * a debênture requires becoming a sociedade anônima, that a CRA needs the credit to qualify as
 * agribusiness, or that a nota comercial became available to limitadas only in 2021. That is the
 * expertise they are buying, and asking them for it is handing the problem back.
 *
 * **The instrument is usually the first thing that eliminates a lender, and it eliminates by
 * rule rather than by taste.** An FIDC buys credit rights and cannot hold a debenture. A CRI has
 * to be issued by a securitisation company, not by the borrower. A limitada cannot issue a
 * debenture at all, whatever its numbers look like. Modelling this as a preference would erase
 * the constraint that most often decides who can even look at a transaction.
 *
 * ## The taxonomy that explains the rest
 *
 * The instruments do not all put the company in the same position, and `issuerRole` is what makes
 * the pros and cons fall out rather than having to be memorised:
 *
 * - `issues` — the company itself is the issuer and the debtor. Debenture, nota comercial, CPR.
 *   It reaches investors directly and it carries the issuance machinery.
 * - `originates` — the company originates a credit that somebody else turns into a security.
 *   CRI and CRA are issued exclusively by a companhia securitizadora (Lei 14.430/2022), so the
 *   company's counterparty is the securitisation company, not the final investor.
 * - `assigns` — the company sells a receivable and the buyer's risk moves toward the payer.
 *   FIDC, receivables discounting. This is why a concentrated or already-pledged receivables book
 *   changes everything here and matters much less elsewhere.
 * - `borrows` — a bilateral contract with a single counterparty. CCB, bank loan, leasing, FINAME.
 *   Fastest and simplest, reaches the fewest buyers.
 *
 * ## Honesty about this file
 *
 * The legal claims here were checked against primary sources, and the ones that decide eligibility
 * carry `legalBasis` so a lawyer can verify us rather than trust us. It is still a working
 * reference and not legal advice: the rite, the exemptions and the required parties must be
 * confirmed for each transaction with counsel, which is exactly what `disclaimer` says and what
 * any material generated from this has to repeat.
 */

export const instrumentSchema = z.enum([
  // The company issues
  "debenture",
  "debenture_incentivada",
  "nota_comercial",
  "cpr",
  // Somebody else issues against credit the company originated
  "cri",
  "cra",
  "cdca",
  // The company assigns a receivable
  "fidc",
  "receivables_purchase",
  // Bilateral
  "ccb",
  "direct_loan",
  "leasing",
  "finame",
  "project_finance",
  "equity_kicker_debt",
  // Backed by a round rather than by EBITDA
  "venture_debt",
  "mutuo_conversivel",
  "revenue_based_financing",
]);
export type Instrument = z.infer<typeof instrumentSchema>;

export const issuerRoleSchema = z.enum(["issues", "originates", "assigns", "borrows"]);
export type IssuerRole = z.infer<typeof issuerRoleSchema>;

/**
 * The legal form of the company that will owe the money.
 *
 * Modelled as an explicit enum rather than a boolean because the difference between an S.A.
 * fechada and an S.A. aberta decides which offer rites are available, and the difference between
 * a limitada and either of them decides whether half the catalogue exists at all.
 */
export const legalFormSchema = z.enum([
  "sa_aberta",
  "sa_fechada",
  "ltda",
  "cooperativa",
  "produtor_rural",
  "outro",
]);
export type LegalForm = z.infer<typeof legalFormSchema>;

/** A condition that must hold or the instrument is impossible, not merely unattractive. */
export type Eligibility = {
  id: string;
  labels: {pt: string; en: string};
  /** Evaluated against the issuer profile. Returning false means the instrument is out. */
  test: (issuer: IssuerProfile) => boolean;
  /** What to say when it fails, including what would change it when anything can. */
  whenUnmet: {pt: string; en: string};
};

export type IssuerProfile = {
  legalForm: LegalForm;
  /** Audited statements exist for at least the last full year. */
  auditedStatements?: boolean;
  /** The credit being financed qualifies as agribusiness under the CRA/CDCA rules. */
  agribusinessCredit?: boolean;
  /** The credit being financed qualifies as real estate under the CRI rules. */
  realEstateCredit?: boolean;
  /** The company has a receivables book that could be assigned. */
  hasAssignableReceivables?: boolean;
  /** The company is a rural producer or a cooperative of them. */
  ruralProducer?: boolean;
  /** The use of proceeds is an infrastructure project under Lei 12.431. */
  infrastructureProject?: boolean;
  /** The purchase being financed is machinery or equipment. */
  financingEquipment?: boolean;
  /** Amount sought, decimal string. Decides whether fixed structuring costs are bearable. */
  amount?: string;

  // ---- the venture track -----------------------------------------------------------------
  //
  // A startup fails every test the rest of this system applies. Leverage over EBITDA is
  // undefined when EBITDA is negative, and DSCR is meaningless when the cash that repays comes
  // from the next round rather than from operations. That is not a gap in the company: it is a
  // different underwriting, and the instruments below are underwritten on the size of the last
  // round, the recurring revenue and the months of runway.

  /** Closed an institutional equity round. The precondition for venture debt in practice. */
  venturebacked?: boolean;
  /** Size of the last round, decimal string. Venture debt is typically sized against it. */
  lastRoundAmount?: string;
  /** Annual recurring revenue, decimal string. The base for recurring-revenue lending. */
  arr?: string;
  /** Months of cash at the current burn. Below roughly six, a lender is funding the fall. */
  runwayMonths?: number;
  /** Revenue is recurring and contracted rather than transactional. */
  recurringRevenue?: boolean;
};

export type InstrumentProfile = {
  id: Instrument;
  labels: {pt: string; en: string};
  issuerRole: IssuerRole;
  /** One sentence a non-technical reader understands, with no jargon left undefined. */
  what: {pt: string; en: string};
  /** The statute or regulation that governs it, so a lawyer can check this file. */
  legalBasis: string;
  eligibility: readonly Eligibility[];
  /** Which kinds of buyer this reaches. Wider is not automatically better; it costs more. */
  reaches: readonly {pt: string; en: string}[];
  /** Who has to be involved. Every party is a fee and a week. */
  parties: readonly {pt: string; en: string}[];
  pros: readonly {pt: string; en: string}[];
  cons: readonly {pt: string; en: string}[];
  /**
   * Below this amount the fixed costs of structuring usually eat the benefit.
   *
   * A range rather than a number, and deliberately conservative: it is the desk's read of where
   * the economics stop working in the Brazilian mid-market, not a rule, and a transaction below
   * it is discouraged rather than refused.
   */
  economicFloor?: {amount: string; note: {pt: string; en: string}};
  /** Weeks from mandate to money, when nothing goes wrong. */
  weeksToFunding: {min: number; max: number};
};

export const CATALOGUE_DISCLAIMER = {
  pt: "Referência de trabalho da mesa, não parecer jurídico. O rito aplicável, as dispensas de registro e os participantes obrigatórios precisam ser confirmados com assessoria legal na data da operação.",
  en: "The desk's working reference, not legal advice. The applicable rite, registration exemptions and required parties must be confirmed with counsel at the date of the transaction.",
} as const;
