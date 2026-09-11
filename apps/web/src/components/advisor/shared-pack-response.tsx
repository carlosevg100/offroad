"use client";

import {LoaderCircle, ShieldCheck} from "lucide-react";
import {useActionState, useState} from "react";
import {useFormStatus} from "react-dom";
import {useTranslations} from "next-intl";

import {recordSharedPackResponse, type SharedPackResponseState} from "@/app/[locale]/app/shared/actions";

import styles from "./shared-pack-response.module.css";

const initial: SharedPackResponseState = {ok: false};

export const sharedPackConditionCodes = [
  "pool_detail_by_debtor",
  "updated_financials",
  "collateral_documents",
  "covenant_package",
  "cash_flow_projection",
  "legal_documents",
] as const;

export const sharedPackObjectionCodes = [
  "ticket_outside_mandate",
  "sector_outside_mandate",
  "tenor_too_long",
  "pricing_below_mandate",
  "structure_not_supported",
  "collateral_insufficient",
] as const;

/**
 * The recipient organization answers about the pack it can open. Interest, a request for
 * information, a decline or silence are observations; none of them commits anyone to anything.
 */
export function SharedPackResponse({latestResponseId, locale, shareId}: {
  latestResponseId: string | null;
  locale: "pt-BR" | "en-US";
  shareId: string;
}) {
  const t = useTranslations("SharedInformationPacks");
  const [state, action] = useActionState(recordSharedPackResponse, initial);
  const [responseState, setResponseState] = useState("interested");
  const silent = responseState === "no_response_yet";
  return <form action={action} className={styles.response} data-testid="shared-pack-response">
    <input name="locale" type="hidden" value={locale} />
    <input name="share_id" type="hidden" value={shareId} />
    {latestResponseId ? <input name="supersedes_response_id" type="hidden" value={latestResponseId} /> : null}
    <h3>{t("responseTitle")}</h3>
    <p className={styles.muted}>{t("responseBody")}</p>
    <label>
      <span>{t("responseStateLabel")}</span>
      <select name="response_state" onChange={(event) => setResponseState(event.target.value)} value={responseState}>
        {(["interested", "needs_information", "declined", "no_response_yet"] as const).map((option) => (
          <option key={option} value={option}>{t(`responseState.${option}`)}</option>
        ))}
      </select>
    </label>
    {silent ? null : <>
      <label><span>{t("noteLabel")}</span><textarea maxLength={4000} name="note" rows={2} /></label>
      <fieldset>
        <legend>{t("conditionsLegend")}</legend>
        {sharedPackConditionCodes.map((code) => <label className={styles.check} key={code}>
          <input name="requested_condition" type="checkbox" value={code} />
          <span>{t(`condition.${code}`)}</span>
        </label>)}
      </fieldset>
      <fieldset>
        <legend>{t("objectionsLegend")}</legend>
        {sharedPackObjectionCodes.map((code) => <label className={styles.check} key={code}>
          <input name="term_objection" type="checkbox" value={code} />
          <span>{t(`objection.${code}`)}</span>
        </label>)}
      </fieldset>
      <div className={styles.row}>
        <label><span>{t("ticketLabel")}</span><input min={0} name="ticket_amount" step="0.01" type="number" /></label>
        <label><span>{t("currencyLabel")}</span><select defaultValue="BRL" name="ticket_currency">
          <option value="BRL">BRL</option><option value="USD">USD</option><option value="EUR">EUR</option>
        </select></label>
        <label><span>{t("tenorLabel")}</span><input max={600} min={1} name="tenor_months" type="number" /></label>
      </div>
      <div className={styles.row}>
        <label><span>{t("pricingBasisLabel")}</span><select defaultValue="cdi_plus" name="pricing_basis">
          <option value="cdi_plus">{t("pricingBasis.cdi_plus")}</option>
          <option value="ipca_plus">{t("pricingBasis.ipca_plus")}</option>
          <option value="fixed_rate">{t("pricingBasis.fixed_rate")}</option>
        </select></label>
        <label><span>{t("pricingMinLabel")}</span><input min={0} name="pricing_min" step="0.0001" type="number" /></label>
        <label><span>{t("pricingMaxLabel")}</span><input min={0} name="pricing_max" step="0.0001" type="number" /></label>
      </div>
    </>}
    <Submit idle={t("save")} pending={t("saving")} />
    {state.ok ? <p className="form-notice form-notice--success" role="status">{t("saved")}</p> : null}
    {!state.ok && state.code ? <p className="form-notice form-notice--error" role="alert">{t(`errors.${state.code}`)}</p> : null}
    <p className={styles.boundary}><ShieldCheck aria-hidden="true" size={13} />{t("responseBoundary")}</p>
  </form>;
}

function Submit({idle, pending}: {idle: string; pending: string}) {
  const status = useFormStatus();
  return <button className="button" disabled={status.pending} type="submit">
    {status.pending ? <LoaderCircle aria-hidden="true" className="spin" size={14} /> : null}
    {status.pending ? pending : idle}
  </button>;
}
