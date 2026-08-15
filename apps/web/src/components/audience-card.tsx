import type {LucideIcon} from "lucide-react";
import {ArrowUpRight} from "lucide-react";

type AudienceCardProps = {
  action: string;
  body: string;
  href: string;
  icon: LucideIcon;
  label: string;
  number: string;
  title: string;
};

export function AudienceCard({
  action,
  body,
  href,
  icon: Icon,
  label,
  number,
  title,
}: AudienceCardProps) {
  return (
    <article className="audience-card">
      <div className="audience-card__top">
        <span>{number}</span>
        <Icon aria-hidden="true" size={21} strokeWidth={1.5} />
      </div>
      <p className="micro-label">{label}</p>
      <h3>{title}</h3>
      <p>{body}</p>
      <a href={href}>
        <span>{action}</span>
        <ArrowUpRight aria-hidden="true" size={16} />
      </a>
    </article>
  );
}
