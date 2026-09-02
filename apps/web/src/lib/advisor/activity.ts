export type AdvisorActivityStatus = "waiting" | "queued" | "running" | "succeeded" | "failed" | "blocked" | "cancelled";

export type AdvisorActivityInput = {
  id: string;
  taskId: string;
  label: string;
  status: AdvisorActivityStatus;
};

export type AdvisorActivity = {
  id: string;
  label: string;
  status: AdvisorActivityStatus;
};

const originationStages = [
  {id: "context", taskIds: ["M01", "M02", "M03", "M04", "M05", "M06"]},
  {id: "research", taskIds: ["C02"]},
  {id: "market", taskIds: ["K04"]},
  {id: "readout", taskIds: ["M07"]},
] as const;

/**
 * The TaskSpec DAG is an internal execution contract. Customers see the work being performed,
 * never implementation codes or orchestration language. Only the origination workflow is grouped
 * here for now; unreleased journeys retain their already-localized task labels.
 */
export function advisorActivities(
  entryJob: string,
  tasks: AdvisorActivityInput[],
  labels: Record<string, string>,
): AdvisorActivity[] {
  if (entryJob !== "origination_thesis") {
    return tasks.map((task) => ({id: task.id, label: task.label, status: task.status}));
  }

  return originationStages.flatMap((stage) => {
    const taskIds: readonly string[] = stage.taskIds;
    const members = tasks.filter((task) => taskIds.includes(task.taskId));
    if (members.length === 0) return [];
    return [{
      id: stage.id,
      label: labels[stage.id] ?? members[0]!.label,
      status: aggregateStatus(members.map((task) => task.status)),
    }];
  });
}

function aggregateStatus(statuses: AdvisorActivityStatus[]): AdvisorActivityStatus {
  if (statuses.some((status) => status === "failed")) return "failed";
  if (statuses.some((status) => status === "running")) return "running";
  if (statuses.every((status) => status === "succeeded")) return "succeeded";
  if (statuses.some((status) => status === "queued")) return "queued";
  if (statuses.some((status) => status === "blocked")) return "blocked";
  if (statuses.every((status) => status === "cancelled")) return "cancelled";
  return "waiting";
}
