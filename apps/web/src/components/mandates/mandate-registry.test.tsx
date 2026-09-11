import {renderToStaticMarkup} from "react-dom/server";
import {NextIntlClientProvider} from "next-intl";
import {describe, expect, it, vi} from "vitest";

import pt from "../../../messages/pt-BR.json";
import en from "../../../messages/en-US.json";
import {groupMandatesByFund, readProviderMandates, type ProviderMandate} from "@/lib/mandates/provider-mandates";

import {MandateRegistry} from "./mandate-registry";

vi.mock("next/navigation", () => ({useRouter: () => ({refresh: vi.fn()})}));
vi.mock("@/app/[locale]/app/mandates/actions", () => ({
  registerProviderMandate: vi.fn(),
  confirmProviderMandate: vi.fn(),
  withdrawProviderMandate: vi.fn(),
}));

const today = "2026-09-10";

function mandate(overrides: Partial<ProviderMandate> = {}): ProviderMandate {
  return {
    id: "40000000-0000-4000-8000-000000000001",
    fundId: "50000000-0000-4000-8000-000000000001",
    fundName: "FIDC Horizonte",
    fundStrategy: "Credito estruturado",
    versionNumber: 2,
    status: "confirmed",
    effectiveStatus: "confirmed",
    currency: "BRL",
    ticketMin: "5000000",
    ticketMax: "40000000",
    instruments: ["debenture", "nota_comercial"],
    sectors: ["varejo alimentar"],
    geographies: ["BR"],
    collateral: ["recebiveis"],
    termMonthsMin: 12,
    termMonthsMax: 60,
    leverageCeiling: "3.5",
    minimumDscr: "1.2",
    acceptingNewTransactions: true,
    validFrom: "2026-03-01",
    validUntil: "2027-03-01",
    sources: [],
    confirmedAt: "2026-03-01T12:00:00+00:00",
    withdrawnAt: null,
    note: null,
    lastConfirmation: {
      channel: "official_document",
      confirmedAt: "2026-03-01T12:00:00+00:00",
      documentReference: "Regulamento, 3a alteracao",
      contactRecordId: null,
      contactDate: null,
      validFrom: "2026-03-01",
      validUntil: "2027-03-01",
    },
    confirmationCount: 1,
    ...overrides,
  };
}

function render(locale: "pt-BR" | "en-US", mandates: ProviderMandate[], pendingFunds: {id: string; name: string; strategy: string}[] = []) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={locale === "pt-BR" ? pt : en} timeZone="UTC">
      <MandateRegistry funds={groupMandatesByFund(mandates, today)} locale={locale} pendingFunds={pendingFunds} today={today} />
    </NextIntlClientProvider>,
  );
}

describe("funds and mandates registry", () => {
  it.each(["pt-BR", "en-US"] as const)("shows the box, the date and the origin of the confirmation in %s", (locale) => {
    const messages = locale === "pt-BR" ? pt : en;
    const html = render(locale, [mandate()]);
    expect(html).toContain('data-testid="mandate-registry"');
    expect(html).toContain('data-status="confirmed"');
    expect(html).toContain('data-renewal="current"');
    expect(html).toContain(messages.MandateRegistry.status.confirmed);
    expect(html).toContain(messages.MandateRegistry.channels.official_document);
    expect(html).toContain(messages.MandateRegistry.instruments.debenture);
    expect(html).toContain(messages.MandateRegistry.collateral.recebiveis);
    expect(html).toContain("varejo alimentar");
    expect(html).toContain(messages.MandateRegistry.boundary);
    expect(html).not.toMatch(/—/);
  });

  it("asks for a renewal before the window closes and says the mandate left the selection once it has", () => {
    const dueSoon = render("pt-BR", [mandate({validUntil: "2026-09-20"})]);
    expect(dueSoon).toContain('data-renewal="due_soon"');
    expect(dueSoon).toContain(pt.MandateRegistry.renewal.due_soon);

    const expired = render("pt-BR", [mandate({status: "confirmed", effectiveStatus: "expired", validUntil: "2026-08-01"})]);
    expect(expired).toContain('data-renewal="expired"');
    expect(expired).toContain(pt.MandateRegistry.renewal.expired);
    // The date of the last confirmation stays visible; that is what the renewal is measured from.
    expect(expired).toContain('data-testid="mandate-freshness"');
  });

  it("keeps a draft out of the selection and offers no withdrawal on a withdrawn record", () => {
    const draft = render("en-US", [mandate({status: "draft", effectiveStatus: "draft", confirmedAt: null, lastConfirmation: null, confirmationCount: 0})]);
    expect(draft).toContain('data-renewal="unconfirmed"');
    expect(draft).toContain(en.MandateRegistry.renewal.unconfirmed);
    expect(draft).toContain(en.MandateRegistry.neverConfirmed);
    expect(draft).toContain(en.MandateRegistry.confirmAction);

    const withdrawn = render("en-US", [mandate({status: "withdrawn", effectiveStatus: "withdrawn", withdrawnAt: "2026-09-01T00:00:00+00:00"})]);
    expect(withdrawn).toContain(en.MandateRegistry.withdrawnNote);
    expect(withdrawn).not.toContain(en.MandateRegistry.withdrawAction);
  });

  it("names the newest version as the current one and keeps the earlier ones on record", () => {
    const html = render("en-US", [
      mandate(),
      mandate({id: "40000000-0000-4000-8000-000000000002", versionNumber: 3, status: "draft", effectiveStatus: "draft", confirmedAt: null, lastConfirmation: null, confirmationCount: 0}),
    ]);
    expect(html).toContain('data-renewal="unconfirmed"');
    expect(html).toContain(en.MandateRegistry.history.replace("{count}", "1"));
  });

  it("lists funds that carry no structured mandate yet", () => {
    const html = render("pt-BR", [], [{id: "50000000-0000-4000-8000-0000000000ff", name: "Fundo antigo", strategy: "Legado"}]);
    expect(html).toContain('data-testid="mandate-pending-funds"');
    expect(html).toContain("Fundo antigo");
    expect(html).toContain(pt.MandateRegistry.empty);
  });

  it("drops a listing that does not match the mandate contract instead of guessing", () => {
    expect(readProviderMandates([{...mandate(), effectiveStatus: "renewed"}])).toEqual([]);
    expect(readProviderMandates([{...mandate(), instruments: ["convertible"]}])).toEqual([]);
    expect(readProviderMandates([mandate()])).toHaveLength(1);
  });
});
