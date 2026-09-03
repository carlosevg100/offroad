import {ArrowRight, BriefcaseBusiness, Building2, Check, ChevronDown, Sparkles} from "lucide-react";

import {
  affiliationKinds,
  operatingModels,
  productFamilies,
  professionalObjectives,
  professionalRoles,
} from "@/lib/professional-context";

export type ProfessionalContextCopy = {
  eyebrow: string;
  title: string;
  body: string;
  institutionName: string;
  institutionPlaceholder: string;
  affiliationLegend: string;
  affiliation: Record<(typeof affiliationKinds)[number], string>;
  role: string;
  rolePlaceholder: string;
  roles: Record<(typeof professionalRoles)[number], string>;
  team: string;
  teamPlaceholder: string;
  operatingLegend: string;
  operatingBody: string;
  operating: Record<(typeof operatingModels)[number], string>;
  objectiveLegend: string;
  objectiveBody: string;
  objectives: Record<(typeof professionalObjectives)[number], string>;
  optionalTitle: string;
  optionalBody: string;
  products: Record<(typeof productFamilies)[number], string>;
  notes: string;
  notesPlaceholder: string;
  save: string;
  skip: string;
  assurance: string;
};

export type ProfessionalContextValue = {
  affiliationKind?: string | null;
  professionalRole?: string | null;
  institutionName?: string | null;
  teamName?: string | null;
  operatingModels?: string[];
  primaryObjectives?: string[];
  productFamilies?: string[];
  capabilityNotes?: string | null;
};

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  copy: ProfessionalContextCopy;
  initial?: ProfessionalContextValue;
  locale: string;
  mode?: "onboarding" | "settings";
};

export function ProfessionalContextForm({action, copy, initial = {}, locale, mode = "onboarding"}: Props) {
  const selectedOperatingModels = new Set(initial.operatingModels ?? []);
  const selectedObjectives = new Set(initial.primaryObjectives ?? []);
  const selectedProducts = new Set(initial.productFamilies ?? []);

  return (
    <section className={`professional-context professional-context--${mode}`}>
      <header className="professional-context__header">
        <span className="professional-context__mark"><Sparkles aria-hidden="true" size={19} /></span>
        <div>
          <p className="section-kicker">{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
          <p>{copy.body}</p>
        </div>
      </header>

      <form action={action} className="professional-context__form">
        <input name="locale" type="hidden" value={locale} />

        <div className="professional-context__identity">
          <label className="field field--wide">
            <span>{copy.institutionName}</span>
            <div className="field-with-icon"><Building2 aria-hidden="true" size={16} /><input defaultValue={initial.institutionName ?? ""} maxLength={200} name="institution_name" placeholder={copy.institutionPlaceholder} /></div>
          </label>
          <label className="field">
            <span>{copy.role}</span>
            <select defaultValue={initial.professionalRole ?? ""} name="professional_role">
              <option value="">{copy.rolePlaceholder}</option>
              {professionalRoles.map((role) => <option key={role} value={role}>{copy.roles[role]}</option>)}
            </select>
          </label>
          <label className="field">
            <span>{copy.team}</span>
            <div className="field-with-icon"><BriefcaseBusiness aria-hidden="true" size={16} /><input defaultValue={initial.teamName ?? ""} maxLength={160} name="team_name" placeholder={copy.teamPlaceholder} /></div>
          </label>
        </div>

        <fieldset className="professional-context__choice-group">
          <legend>{copy.affiliationLegend}</legend>
          <div className="professional-context__pills professional-context__pills--compact">
            {affiliationKinds.map((kind) => (
              <label key={kind}>
                <input defaultChecked={initial.affiliationKind === kind} name="affiliation_kind" type="radio" value={kind} />
                <span>{copy.affiliation[kind]}<Check aria-hidden="true" size={12} /></span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="professional-context__columns">
          <fieldset className="professional-context__choice-group">
            <legend>{copy.operatingLegend}</legend>
            <p>{copy.operatingBody}</p>
            <div className="professional-context__pills">
              {operatingModels.map((model) => (
                <label key={model}>
                  <input defaultChecked={selectedOperatingModels.has(model)} name="operating_models" type="checkbox" value={model} />
                  <span>{copy.operating[model]}<Check aria-hidden="true" size={12} /></span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="professional-context__choice-group">
            <legend>{copy.objectiveLegend}</legend>
            <p>{copy.objectiveBody}</p>
            <div className="professional-context__pills">
              {professionalObjectives.map((objective) => (
                <label key={objective}>
                  <input defaultChecked={selectedObjectives.has(objective)} name="primary_objectives" type="checkbox" value={objective} />
                  <span>{copy.objectives[objective]}<Check aria-hidden="true" size={12} /></span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <details className="professional-context__optional">
          <summary><span><strong>{copy.optionalTitle}</strong><small>{copy.optionalBody}</small></span><ChevronDown aria-hidden="true" size={16} /></summary>
          <div className="professional-context__optional-body">
            <div className="professional-context__pills professional-context__pills--products">
              {productFamilies.map((product) => (
                <label key={product}>
                  <input defaultChecked={selectedProducts.has(product)} name="product_families" type="checkbox" value={product} />
                  <span>{copy.products[product]}<Check aria-hidden="true" size={12} /></span>
                </label>
              ))}
            </div>
            <label className="field field--wide"><span>{copy.notes}</span><textarea defaultValue={initial.capabilityNotes ?? ""} maxLength={2000} name="capability_notes" placeholder={copy.notesPlaceholder} rows={3} /></label>
          </div>
        </details>

        <footer className="professional-context__actions">
          <p><Check aria-hidden="true" size={13} />{copy.assurance}</p>
          <div>
            {mode === "onboarding" ? <button className="button button--ghost" name="intent" type="submit" value="skip">{copy.skip}</button> : null}
            <button className="button" type="submit">{copy.save}<ArrowRight aria-hidden="true" size={15} /></button>
          </div>
        </footer>
      </form>
    </section>
  );
}
