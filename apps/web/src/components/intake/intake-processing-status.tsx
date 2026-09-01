"use client";

import {Check, Circle, LoaderCircle, TriangleAlert} from "lucide-react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {useEffect} from "react";

type Props = {
  body: string;
  locale: string;
  newProjectLabel: string;
  overviewLabel: string;
  tasks?: Array<{
    label: string;
    status: "pending" | "running" | "completed" | "failed";
    statusLabel: string;
  }>;
  title: string;
};

/** Keeps the project state fresh while analysis runs without blocking navigation. */
export function IntakeProcessingStatus({body, locale, newProjectLabel, overviewLabel, tasks, title}: Props) {
  const router = useRouter();

  useEffect(() => {
    const interval = window.setInterval(() => router.refresh(), 5000);
    return () => window.clearInterval(interval);
  }, [router]);

  return (
    <div className="form-notice intake-processing-status" role="status">
      <p><strong><LoaderCircle aria-hidden="true" className="spin" size={14} /> {title}</strong> {body}</p>
      {tasks?.length ? (
        <ol className="intake-processing-status__tasks">
          {tasks.map((task) => (
            <li className={`is-${task.status}`} key={task.label}>
              <span aria-hidden="true">
                {task.status === "completed" ? <Check size={13} /> : task.status === "running" ? <LoaderCircle className="spin" size={13} /> : task.status === "failed" ? <TriangleAlert size={13} /> : <Circle size={11} />}
              </span>
              <strong>{task.label}</strong>
              <small>{task.statusLabel}</small>
            </li>
          ))}
        </ol>
      ) : null}
      <div className="intake-processing-status__links">
        <Link className="text-link" href={`/${locale}/app`}>{overviewLabel}</Link>
        <Link className="text-link" href={`/${locale}/app/new`}>{newProjectLabel}</Link>
      </div>
    </div>
  );
}
