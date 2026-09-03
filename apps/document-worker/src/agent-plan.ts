import {randomUUID} from "node:crypto";

import {createInitialDcmPlan} from "@offroad/agent-contracts";
import {localizedOffroadTaskLabel, offroadTaskRegistry} from "@offroad/work-plan";
import {z} from "zod";

import type {AgentPlanJob, QueueClient} from "./queue";

const contextSchema = z.object({
  project: z.object({id: z.uuid(), project_name: z.string().min(2)}),
  objective: z.record(z.string(), z.unknown()),
  plan: z.object({id: z.uuid()}),
  tasks: z.array(z.object({
    id: z.string().regex(/^[A-Z][0-9]{2}$/),
    dependencies: z.array(z.string().regex(/^[A-Z][0-9]{2}$/)),
    execution_class: z.enum(["deterministic", "extraction", "research", "judgment", "compilation", "action"]),
    effect: z.enum(["none", "propose_state", "commit", "external"]),
  })).min(1).max(80),
});

const registryById = new Map(offroadTaskRegistry.map((task) => [task.id, task]));

export async function ensureInitialAgentPlan(
  job: AgentPlanJob,
  queue: QueueClient,
  now: () => Date = () => new Date(),
): Promise<string> {
  if (!queue.loadAgentPlanContext || !queue.recordAgentPlan) {
    throw new Error("agent-plan persistence is unavailable");
  }
  const context = contextSchema.parse(await queue.loadAgentPlanContext(job));
  const planId = randomUUID();
  const workIds = new Map(context.tasks.map((task) => [task.id, randomUUID()]));
  const objective = objectiveFrom(context.objective, context.project.project_name);
  const plan = createInitialDcmPlan({
    id: planId,
    projectId: context.project.id,
    goal: objective,
    triggerRef: `processing_job:${job.job_id}`,
    createdAt: now().toISOString(),
    idForTask: (taskId) => {
      const id = workIds.get(taskId);
      if (!id) throw new Error(`missing work id for ${taskId}`);
      return id;
    },
    taskSpecs: context.tasks.map((task) => {
      const registryTask = registryById.get(task.id);
      if (!registryTask) throw new Error(`compiled plan contains unknown TaskSpec ${task.id}`);
      return {
        id: task.id,
        label: localizedOffroadTaskLabel(
          task.id,
          registryTask.label,
          job.payload?.locale === "en-US" ? "en-US" : "pt-BR",
        ),
        dependencies: task.dependencies,
        executionClass: task.execution_class,
        effect: task.effect,
      };
    }),
  });
  return queue.recordAgentPlan(job, plan);
}

function objectiveFrom(content: Record<string, unknown>, projectName: string): string {
  for (const key of ["initial_request", "capitalIntent", "meetingContext", "objective", "request", "capital_objective"]) {
    const value = content[key];
    if (typeof value === "string" && value.trim().length >= 5) return value.trim().slice(0, 2_000);
  }
  const brief = content.brief;
  if (brief && typeof brief === "object" && !Array.isArray(brief)) {
    const nested = objectiveFrom(brief as Record<string, unknown>, projectName);
    if (!nested.startsWith("Desenvolver o trabalho")) return nested;
  }
  return `Desenvolver o trabalho de mercado de capitais para ${projectName}.`;
}
