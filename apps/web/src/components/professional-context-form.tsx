"use client";

import {ArrowRight, Building2, Check} from "lucide-react";
import {useState} from "react";

import {
  practiceAreas,
  professionalObjectives,
  professionalRoles,
  useForms,
} from "@/lib/professional-context";

export type ProfessionalContextCopy = {
  title: string;
  body: string;
  useFormsQuestion: string;
  useFormsHelp: string;
  useForms: Record<(typeof useForms)[number], string>;
  institutionQuestion: string;
  institutionHelp: string;
  institutionPlaceholder: string;
  rolesQuestion: string;
  rolesHelp: string;
  roles: Record<(typeof professionalRoles)[number], string>;
  areasQuestion: string;
  areasHelp: string;
  areas: Record<(typeof practiceAreas)[number], string>;
  objectivesQuestion: string;
  objectivesHelp: string;
  objectives: Record<(typeof professionalObjectives)[number], string>;
  save: string;
  saveSettings: string;
  skip: string;
  assurance: string;
};

export type ProfessionalContextValue = {
  useForms?: string[];
  professionalRoles?: string[];
  practiceAreas?: string[];
  primaryObjectives?: string[];
  institutionName?: string | null;
};

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  copy: ProfessionalContextCopy;
  initial?: ProfessionalContextValue;
  locale: string;
  mode?: "onboarding" | "settings";
};

type OptionGridProps<Option extends string> = {
  copy: Record<Option, string>;
  name: string;
  onToggle?: (option: Option, checked: boolean) => void;
  options: readonly Option[];
  selected: Set<string>;
  wide?: boolean;
};

function OptionGrid<Option extends string>({copy, name, onToggle, options, selected, wide}: OptionGridProps<Option>) {
  return (
    <div className={wide ? "professional-context__options professional-context__options--wide" : "professional-context__options"}>
      {options.map((option) => (
        <label key={option}>
          <input
            defaultChecked={selected.has(option)}
            name={name}
            onChange={(event) => onToggle?.(option, event.target.checked)}
            type="checkbox"
            value={option}
          />
          <span><i aria-hidden="true"><Check size={11} strokeWidth={3} /></i>{copy[option]}</span>
        </label>
      ))}
    </div>
  );
}

export function ProfessionalContextForm({action, copy, initial = {}, locale, mode = "onboarding"}: Props) {
  // Asking where someone works only makes sense once they have said they work somewhere. The
  // follow-up therefore belongs to the first question rather than standing as one of its own.
  const [institutional, setInstitutional] = useState(Boolean(initial.useForms?.includes("institutional_work")));

  return (
    <section className={`professional-context professional-context--${mode}`}>
      <header className="professional-context__header">
        <h1>{copy.title}</h1>
        <p>{copy.body}</p>
      </header>

      <form action={action} className="professional-context__form">
        <input name="locale" type="hidden" value={locale} />

        <fieldset className="professional-context__question">
          <legend><b>01</b>{copy.useFormsQuestion}</legend>
          <p>{copy.useFormsHelp}</p>
          <OptionGrid
            copy={copy.useForms}
            name="use_forms"
            onToggle={(option, checked) => {
              if (option === "institutional_work") setInstitutional(checked);
            }}
            options={useForms}
            selected={new Set(initial.useForms ?? [])}
          />
          {institutional ? (
            <label className="professional-context__follow-up">
              <span>{copy.institutionQuestion}</span>
              <div className="field-with-icon">
                <Building2 aria-hidden="true" size={15} />
                <input
                  defaultValue={initial.institutionName ?? ""}
                  maxLength={200}
                  name="institution_name"
                  placeholder={copy.institutionPlaceholder}
                />
              </div>
              <small>{copy.institutionHelp}</small>
            </label>
          ) : null}
        </fieldset>

        <fieldset className="professional-context__question">
          <legend><b>02</b>{copy.rolesQuestion}</legend>
          <p>{copy.rolesHelp}</p>
          <OptionGrid copy={copy.roles} name="professional_roles" options={professionalRoles} selected={new Set(initial.professionalRoles ?? [])} wide />
        </fieldset>

        <fieldset className="professional-context__question">
          <legend><b>03</b>{copy.areasQuestion}</legend>
          <p>{copy.areasHelp}</p>
          <OptionGrid copy={copy.areas} name="practice_areas" options={practiceAreas} selected={new Set(initial.practiceAreas ?? [])} wide />
        </fieldset>

        <fieldset className="professional-context__question">
          <legend><b>04</b>{copy.objectivesQuestion}</legend>
          <p>{copy.objectivesHelp}</p>
          <OptionGrid copy={copy.objectives} name="primary_objectives" options={professionalObjectives} selected={new Set(initial.primaryObjectives ?? [])} />
        </fieldset>

        <footer className="professional-context__actions">
          <p>{copy.assurance}</p>
          <div>
            {mode === "onboarding" ? <button className="button button--ghost" name="intent" type="submit" value="skip">{copy.skip}</button> : null}
            <button className="button" type="submit">{mode === "onboarding" ? copy.save : copy.saveSettings}<ArrowRight aria-hidden="true" size={15} /></button>
          </div>
        </footer>
      </form>
    </section>
  );
}
