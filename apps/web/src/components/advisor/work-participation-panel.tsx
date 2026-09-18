import {loadWorkContributions, loadWorkPeople} from "@/app/[locale]/app/work-contribution-actions";
import {WorkParticipants} from "./work-participants";

export async function WorkParticipationPanel({locale, workId}: {locale: string; workId: string}) {
  const language = locale === "en-US" ? "en-US" : "pt-BR";
  const identity = {locale: language, workId};
  const [people, initial] = await Promise.all([loadWorkPeople({...identity, search: "", offset: 0}), loadWorkContributions({...identity, audience: "personal", offset: 0})]);
  return <WorkParticipants locale={language} workId={workId} viewerId={people.viewerId} canManage={people.canManage} people={people.people} initial={initial} />;
}
