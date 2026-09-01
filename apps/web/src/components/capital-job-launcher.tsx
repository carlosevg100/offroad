import {
  BriefcaseBusiness,
  Building2,
  FileSearch2,
  FileStack,
  FolderInput,
  Route,
} from "lucide-react";
import Link from "next/link";

import {capitalProjectJobs, type CapitalProjectJob} from "@offroad/work-plan";

const jobIcons = {
  company_debt_view: Building2,
  origination_thesis: BriefcaseBusiness,
  capital_planning: Route,
  structure_from_documents: FolderInput,
  review_existing_operation: FileSearch2,
  prepare_materials_and_process: FileStack,
} satisfies Record<CapitalProjectJob, typeof Building2>;

type Props = {
  existingProjectHref?: string;
  jobHrefs?: Partial<Record<CapitalProjectJob, string>>;
  locale: string;
  newProjectBaseHref: string;
  releasedJobs?: readonly CapitalProjectJob[];
};

/** Six ways into one project truth. The cards choose the first task subgraph, never a new silo. */
export function CapitalJobLauncher({existingProjectHref, jobHrefs = {}, locale, newProjectBaseHref, releasedJobs = ["capital_planning"]}: Props) {
  const language = locale === "en-US" ? "en" : "pt";
  const copy = language === "pt"
    ? {
        kicker: "Comece de onde você está",
        title: "Como a Offroad pode ajudar agora?",
        body: "Escolha o ponto de partida. Informações, decisões e materiais permanecem no mesmo projeto conforme o trabalho evolui.",
        existing: "Escolha um projeto abaixo para continuar.",
        unavailable: "Este fluxo ainda não está disponível.",
      }
    : {
        kicker: "Start where you are",
        title: "How can Offroad help now?",
        body: "Choose a starting point. Information, decisions and materials remain in the same project as the work evolves.",
        existing: "Choose a project below to continue.",
        unavailable: "This workflow is not available yet.",
      };

  return (
    <section aria-labelledby="capital-job-title" className="capital-job-launcher" id="capital-jobs">
      <header>
        <span className="section-kicker">{copy.kicker}</span>
        <h2 id="capital-job-title">{copy.title}</h2>
        <p>{copy.body}</p>
      </header>
      <div className="capital-job-launcher__grid">
        {capitalProjectJobs.map((job, index) => {
          const Icon = jobIcons[job.id];
          const needsProject = job.requiresExistingProject;
          // A visible job enters production only through an explicit released list. This keeps
          // unreleased labels from silently falling back to the legacy generic intake.
          const isReleased = releasedJobs.includes(job.id);
          const separator = newProjectBaseHref.includes("?") ? "&" : "?";
          const href = isReleased
            ? jobHrefs[job.id] ?? (needsProject ? existingProjectHref : `${newProjectBaseHref}${separator}job=${job.id}`)
            : undefined;
          const contents = (
            <>
              <span className="capital-job-card__number">{String(index + 1).padStart(2, "0")}</span>
              <span className="capital-job-card__icon"><Icon aria-hidden="true" size={18} /></span>
              <strong>{job.title[language]}</strong>
              <p id={`capital-job-${job.id}-body`}>{job.description[language]}</p>
              {!isReleased || needsProject ? <small>{isReleased && existingProjectHref ? copy.existing : copy.unavailable}</small> : null}
            </>
          );
          return href ? (
            <Link aria-describedby={`capital-job-${job.id}-body`} className="capital-job-card" href={href} key={job.id}>
              {contents}
            </Link>
          ) : (
            <div aria-disabled="true" className="capital-job-card is-unavailable" key={job.id}>
              {contents}
            </div>
          );
        })}
      </div>
    </section>
  );
}
