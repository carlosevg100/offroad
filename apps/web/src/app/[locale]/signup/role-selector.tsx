"use client";

import {Building2, Landmark, Network} from "lucide-react";
import {useState} from "react";

type Labels = {
  pathLegend: string;
  origination: string;
  originationBody: string;
  provider: string;
  providerBody: string;
  roleLegend: string;
  company: string;
  companyBody: string;
  originator: string;
  originatorBody: string;
};

export function SignupRoleSelector({labels}: {labels: Labels}) {
  const [entryPath, setEntryPath] = useState<"origination" | "capital_provider">("origination");

  return (
    <div className="registration-paths">
      <fieldset className="registration-roles registration-roles--primary">
        <legend>{labels.pathLegend}</legend>
        <label>
          <input
            checked={entryPath === "origination"}
            name="entry_path"
            onChange={() => setEntryPath("origination")}
            type="radio"
            value="origination"
          />
          <Building2 aria-hidden="true" size={20} />
          <span><strong>{labels.origination}</strong><small>{labels.originationBody}</small></span>
        </label>
        <label>
          <input
            checked={entryPath === "capital_provider"}
            name="entry_path"
            onChange={() => setEntryPath("capital_provider")}
            type="radio"
            value="capital_provider"
          />
          <Landmark aria-hidden="true" size={20} />
          <span><strong>{labels.provider}</strong><small>{labels.providerBody}</small></span>
        </label>
      </fieldset>

      {entryPath === "origination" ? (
        <fieldset className="registration-role-refinement">
          <legend>{labels.roleLegend}</legend>
          <label>
            <input defaultChecked name="originating_role" type="radio" value="company" />
            <Building2 aria-hidden="true" size={17} />
            <span><strong>{labels.company}</strong><small>{labels.companyBody}</small></span>
          </label>
          <label>
            <input name="originating_role" type="radio" value="originator" />
            <Network aria-hidden="true" size={17} />
            <span><strong>{labels.originator}</strong><small>{labels.originatorBody}</small></span>
          </label>
        </fieldset>
      ) : null}
    </div>
  );
}
