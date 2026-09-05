import {FlaskConical} from "lucide-react";

export type IntegrationPreviewBannerCopy = {
  kicker: string;
  title: string;
  body: string;
  note: string;
};

type Props = {copy: IntegrationPreviewBannerCopy; note: string | null};

/**
 * The internal validation banner. It is rendered only when the organization holds the
 * `integration_preview` grant, on every workspace screen, so nobody mistakes a preview run for
 * released work: the methods behind it are in the `implemented` rung and nothing here is a client
 * deliverable.
 */
export function IntegrationPreviewBanner({copy, note}: Props) {
  return (
    <aside aria-label={copy.title} className="integration-preview-banner" data-testid="integration-preview-banner" role="status">
      <FlaskConical aria-hidden="true" size={15} />
      <div>
        <span className="integration-preview-banner__kicker">{copy.kicker}</span>
        <strong>{copy.title}</strong>
        <p>{copy.body}{note ? ` ${copy.note.replace("{note}", note)}` : null}</p>
      </div>
    </aside>
  );
}
