"use client";

import {collateralKindSchema, instrumentSchema, mandateConfirmationChannelSchema} from "@offroad/fund-mandate";
import {useFormatter, useTranslations} from "next-intl";
import {useRouter} from "next/navigation";
import {useState, useTransition} from "react";

import {confirmProviderMandate, registerProviderMandate, withdrawProviderMandate, type MandateActionResult} from "@/app/[locale]/app/mandates/actions";
import type {MandateFund} from "@/lib/mandates/provider-mandates";

import styles from "./mandate-registry.module.css";

const instruments = instrumentSchema.options;
const collateralKinds = collateralKindSchema.options;
const channels = mandateConfirmationChannelSchema.options;
const currencies = ["BRL", "USD", "EUR"] as const;

export type PendingFund = {id: string; name: string; strategy: string};
type Props = {funds: MandateFund[]; pendingFunds: PendingFund[]; locale: "pt-BR" | "en-US"; today: string};
type MandateActionError = "invalid" | "denied" | "not_found" | "conflict" | "save" | null;

const listValues = (form: FormData, field: string) => form.getAll(field).map(String).filter((value) => value.length > 0);
const textValue = (form: FormData, field: string) => {
  const value = String(form.get(field) ?? "").trim();
  return value.length > 0 ? value : null;
};
const numberValue = (form: FormData, field: string) => {
  const value = textValue(form, field);
  return value === null ? null : Number(value);
};
const splitLabels = (value: string | null) =>
  (value ?? "").split(",").map((entry) => entry.trim()).filter((entry) => entry.length > 0);

/**
 * The funds and mandates registry.
 *
 * Registering a mandate does not make it count. The record enters as a draft, a confirmation is a
 * separate act with a date and a channel, and the panel says which state each fund is in and what
 * would change it. That distinction is the product's, not the form's: a fund appears to a company
 * as a verified candidate only while a confirmed record is inside its window.
 *
 * Nothing here contacts anybody. A record that is due for renewal is a line asking somebody in
 * this organization to confirm it again, and the renewal is that person deciding to.
 */
export function MandateRegistry({funds, pendingFunds, locale, today}: Props) {
  const t = useTranslations("MandateRegistry");
  const format = useFormatter();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<MandateActionError>(null);
  const [openForm, setOpenForm] = useState<"none" | "register">("none");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [channel, setChannel] = useState<(typeof channels)[number]>("direct_declaration");

  function run(action: () => Promise<MandateActionResult>, onDone?: () => void) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) setError(result.error);
        else {
          onDone?.();
          router.refresh();
        }
      } catch {
        setError("save");
      }
    });
  }

  function submitRegistration(form: FormData) {
    run(() => registerProviderMandate({
      locale,
      fundId: textValue(form, "fund_id"),
      fundName: textValue(form, "fund_name"),
      fundStrategy: textValue(form, "fund_strategy"),
      mandate: {
        currency: String(form.get("currency") ?? "BRL"),
        ticketMin: String(form.get("ticket_min") ?? ""),
        ticketMax: String(form.get("ticket_max") ?? ""),
        instruments: listValues(form, "instrument"),
        sectors: splitLabels(textValue(form, "sectors")),
        geographies: splitLabels(textValue(form, "geographies")),
        collateral: listValues(form, "collateral"),
        termMonthsMin: numberValue(form, "term_min"),
        termMonthsMax: numberValue(form, "term_max"),
        leverageCeiling: textValue(form, "leverage"),
        minimumDscr: textValue(form, "dscr"),
        acceptingNewTransactions: form.get("accepting") !== null,
        validFrom: String(form.get("valid_from") ?? today),
        validUntil: textValue(form, "valid_until"),
        note: textValue(form, "note"),
      },
    }), () => setOpenForm("none"));
  }

  function submitConfirmation(mandateId: string, form: FormData) {
    const base = {
      locale,
      mandateId,
      validFrom: String(form.get("confirm_valid_from") ?? today),
      validUntil: textValue(form, "confirm_valid_until"),
      note: textValue(form, "confirm_note"),
    };
    const payload = channel === "official_document"
      ? {...base, channel, documentReference: String(form.get("document_reference") ?? "")}
      : channel === "recorded_contact"
        ? {...base, channel, contactRecordId: String(form.get("contact_record_id") ?? ""), contactDate: String(form.get("contact_date") ?? today)}
        : {...base, channel};
    run(() => confirmProviderMandate(payload), () => setConfirming(null));
  }

  const day = (value: string) => format.dateTime(new Date(value.length === 10 ? `${value}T00:00:00Z` : value), {dateStyle: "medium", timeZone: "UTC"});

  return <section className={styles.registry} data-testid="mandate-registry">
    <header className={styles.header}>
      <div>
        <h2>{t("title")}</h2>
        <p>{t("intro")}</p>
        <p className={styles.muted}>{t("boundary")}</p>
      </div>
      <button className="button" data-testid="mandate-register-toggle" disabled={pending} onClick={() => setOpenForm(openForm === "register" ? "none" : "register")} type="button">
        {t("registerAction")}
      </button>
    </header>

    {error ? <p className={styles.error} role="alert">{t(`errors.${error}`)}</p> : null}

    {openForm === "register" ? <form action={submitRegistration} className={styles.form} data-testid="mandate-register-form">
      <p className={styles.formIntro}>{t("registerIntro")}</p>
      <div className={styles.grid}>
        <label>{t("fields.fundId")}
          <select defaultValue="" disabled={pending} name="fund_id">
            <option value="">{t("fields.newFund")}</option>
            {[...funds.map((fund) => ({id: fund.fundId, name: fund.fundName})), ...pendingFunds].map((fund) => <option key={fund.id} value={fund.id}>{fund.name}</option>)}
          </select>
        </label>
        <label>{t("fields.fundName")}<input disabled={pending} maxLength={200} name="fund_name" type="text" /></label>
        <label>{t("fields.fundStrategy")}<input disabled={pending} maxLength={200} name="fund_strategy" type="text" /></label>
        <label>{t("fields.currency")}
          <select defaultValue="BRL" disabled={pending} name="currency">
            {currencies.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label>{t("fields.ticketMin")}<input disabled={pending} inputMode="decimal" name="ticket_min" required type="text" /></label>
        <label>{t("fields.ticketMax")}<input disabled={pending} inputMode="decimal" name="ticket_max" required type="text" /></label>
        <label>{t("fields.termMin")}<input disabled={pending} max={1200} min={1} name="term_min" type="number" /></label>
        <label>{t("fields.termMax")}<input disabled={pending} max={1200} min={1} name="term_max" type="number" /></label>
        <label>{t("fields.leverage")}<input disabled={pending} inputMode="decimal" name="leverage" type="text" /></label>
        <label>{t("fields.dscr")}<input disabled={pending} inputMode="decimal" name="dscr" type="text" /></label>
        <label>{t("fields.sectors")}<input disabled={pending} maxLength={2000} name="sectors" type="text" /></label>
        <label>{t("fields.geographies")}<input disabled={pending} maxLength={2000} name="geographies" type="text" /></label>
        <label>{t("fields.validFrom")}<input defaultValue={today} disabled={pending} name="valid_from" required type="date" /></label>
        <label>{t("fields.validUntil")}<input disabled={pending} name="valid_until" type="date" /></label>
      </div>
      <fieldset className={styles.choices}>
        <legend>{t("fields.instruments")}</legend>
        {instruments.map((value) => <label key={value}>
          <input disabled={pending} name="instrument" type="checkbox" value={value} />{t(`instruments.${value}`)}
        </label>)}
      </fieldset>
      <fieldset className={styles.choices}>
        <legend>{t("fields.collateral")}</legend>
        {collateralKinds.map((value) => <label key={value}>
          <input disabled={pending} name="collateral" type="checkbox" value={value} />{t(`collateral.${value}`)}
        </label>)}
      </fieldset>
      <label className={styles.inline}><input defaultChecked disabled={pending} name="accepting" type="checkbox" />{t("fields.accepting")}</label>
      <label>{t("fields.note")}<textarea disabled={pending} maxLength={2000} name="note" rows={2} /></label>
      <button className="button" data-testid="mandate-register-submit" disabled={pending} type="submit">{t("saveDraft")}</button>
    </form> : null}

    {funds.length === 0 ? <p className={styles.empty} role="status">{t("empty")}</p> : null}

    {pendingFunds.length ? <div className={styles.pending} data-testid="mandate-pending-funds">
      <h3>{t("pendingTitle")}</h3>
      <p className={styles.muted}>{t("pendingBody")}</p>
      <ul>{pendingFunds.map((fund) => <li key={fund.id}>{fund.name}<small>{fund.strategy}</small></li>)}</ul>
    </div> : null}

    <ul className={styles.funds}>
      {funds.map((fund) => {
        const mandate = fund.current;
        return <li className={styles.fund} data-renewal={fund.renewal} data-status={mandate.effectiveStatus} data-testid="mandate-fund" key={fund.fundId}>
          <div className={styles.fundHead}>
            <div>
              <h3>{fund.fundName}</h3>
              <small>{fund.fundStrategy}</small>
            </div>
            <span className={styles.badge}>{t(`status.${mandate.effectiveStatus}`)}</span>
          </div>

          <p className={styles.freshness} data-testid="mandate-freshness">
            {mandate.confirmedAt
              ? t("lastConfirmed", {date: day(mandate.confirmedAt), channel: t(`channels.${mandate.lastConfirmation?.channel ?? "direct_declaration"}`)})
              : t("neverConfirmed")}
          </p>
          <p className={styles.renewal}>{t(`renewal.${fund.renewal}`)}</p>
          <p className={styles.window}>
            {mandate.validUntil
              ? t("windowClosed", {from: day(mandate.validFrom), until: day(mandate.validUntil)})
              : t("windowOpen", {from: day(mandate.validFrom)})}
          </p>

          <dl className={styles.box}>
            <div><dt>{t("fields.version")}</dt><dd>{mandate.versionNumber}</dd></div>
            <div><dt>{t("fields.ticket")}</dt><dd>{format.number(Number(mandate.ticketMin))} {t("to")} {format.number(Number(mandate.ticketMax))} {mandate.currency}</dd></div>
            <div><dt>{t("fields.instruments")}</dt><dd>{mandate.instruments.map((value) => t(`instruments.${value}`)).join(", ")}</dd></div>
            <div><dt>{t("fields.sectors")}</dt><dd>{mandate.sectors.length ? mandate.sectors.join(", ") : t("unrestricted")}</dd></div>
            <div><dt>{t("fields.geographies")}</dt><dd>{mandate.geographies.length ? mandate.geographies.join(", ") : t("unrestricted")}</dd></div>
            <div><dt>{t("fields.collateral")}</dt><dd>{mandate.collateral.length ? mandate.collateral.map((value) => t(`collateral.${value}`)).join(", ") : t("unrestricted")}</dd></div>
            <div><dt>{t("fields.tenor")}</dt><dd>{mandate.termMonthsMin !== null && mandate.termMonthsMax !== null ? t("months", {min: mandate.termMonthsMin, max: mandate.termMonthsMax}) : t("unrestricted")}</dd></div>
            <div><dt>{t("fields.creditProfile")}</dt><dd>{mandate.leverageCeiling || mandate.minimumDscr ? t("creditProfileValue", {leverage: mandate.leverageCeiling ?? t("unrestricted"), dscr: mandate.minimumDscr ?? t("unrestricted")}) : t("unrestricted")}</dd></div>
            <div><dt>{t("fields.accepting")}</dt><dd>{t(mandate.acceptingNewTransactions ? "yes" : "no")}</dd></div>
            <div><dt>{t("fields.confirmations")}</dt><dd>{mandate.confirmationCount}</dd></div>
          </dl>

          {fund.history.length ? <details className={styles.history}>
            <summary>{t("history", {count: fund.history.length})}</summary>
            <ul>{fund.history.map((version) => <li key={version.id}>
              {t("historyEntry", {version: version.versionNumber, status: t(`status.${version.effectiveStatus}`), date: version.confirmedAt ? day(version.confirmedAt) : t("neverConfirmedShort")})}
            </li>)}</ul>
          </details> : null}

          <div className={styles.actions}>
            {mandate.effectiveStatus === "withdrawn" ? <p className={styles.muted}>{t("withdrawnNote")}</p> : <>
              <button className="button button--ghost" data-testid="mandate-confirm-toggle" disabled={pending} onClick={() => setConfirming(confirming === mandate.id ? null : mandate.id)} type="button">
                {t(mandate.confirmationCount > 0 ? "renewAction" : "confirmAction")}
              </button>
              <button className="button button--ghost" data-testid="mandate-withdraw" disabled={pending} onClick={() => run(() => withdrawProviderMandate({locale, mandateId: mandate.id, note: null}))} type="button">
                {t("withdrawAction")}
              </button>
            </>}
          </div>

          {confirming === mandate.id ? <form action={(form) => submitConfirmation(mandate.id, form)} className={styles.form} data-testid="mandate-confirm-form">
            <p className={styles.formIntro}>{t("confirmIntro")}</p>
            <label>{t("fields.channel")}
              <select disabled={pending} name="channel" onChange={(event) => setChannel(event.target.value as (typeof channels)[number])} value={channel}>
                {channels.map((value) => <option key={value} value={value}>{t(`channels.${value}`)}</option>)}
              </select>
            </label>
            <p className={styles.muted}>{t(`channelHelp.${channel}`)}</p>
            {channel === "official_document" ? <label>{t("fields.documentReference")}
              <input disabled={pending} maxLength={500} name="document_reference" required type="text" />
            </label> : null}
            {channel === "recorded_contact" ? <>
              <label>{t("fields.contactRecordId")}<input disabled={pending} name="contact_record_id" required type="text" /></label>
              <label>{t("fields.contactDate")}<input defaultValue={today} disabled={pending} name="contact_date" required type="date" /></label>
            </> : null}
            <div className={styles.grid}>
              <label>{t("fields.validFrom")}<input defaultValue={mandate.validFrom} disabled={pending} name="confirm_valid_from" required type="date" /></label>
              <label>{t("fields.validUntil")}<input defaultValue={mandate.validUntil ?? ""} disabled={pending} name="confirm_valid_until" type="date" /></label>
            </div>
            <label>{t("fields.note")}<textarea disabled={pending} maxLength={2000} name="confirm_note" rows={2} /></label>
            <button className="button" data-testid="mandate-confirm-submit" disabled={pending} type="submit">{t("confirmSubmit")}</button>
          </form> : null}
        </li>;
      })}
    </ul>
  </section>;
}
