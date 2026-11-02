import type { ReactElement, ReactNode } from "react";
import { Link } from "react-router-dom";
import type { Audience } from "../../lib/marketingApi";
import { OBJECTIVE_TEXT, place } from "./data";

/**
 * A target audience as a group of people: who they are, what worries them, and what we do about it.
 * With `to` it is a card in the list. Without it, the same card fills in beside the form while staff type.
 */
export function AudienceCard({ a, to, onCopy }: { a: Audience; to?: string; onCopy?: () => void }): ReactElement {
  const initials = a.name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
  const kind = [a.business_category, a.business_segment].filter(Boolean).join(" · ");
  const fill = (value: string, blank: string): ReactNode => value.trim() || <span className="audblank">{blank}</span>;
  const n = a.campaign_count ?? 0;

  return (
    <article className={"aud" + (to ? " card" : "")}>
      <header className="audtop">
        <span className="audav" aria-hidden="true">{initials}</span>
        <div>
          <h3>{to ? <Link to={to}>{a.name}</Link> : fill(a.name, "Name this group")}</h3>
          <span className="k">{[place(a), kind].filter(Boolean).join(" · ")}</span>
        </div>
      </header>
      <div className="audsay">
        <span className="sr">What worries them: </span>
        <p>{a.primary_problem.trim() ? `“${a.primary_problem.trim()}”` : <span className="audblank">Their biggest worry goes here</span>}</p>
        {a.secondary_problem.trim() ? <p className="also">Also: {a.secondary_problem.trim()}</p> : null}
      </div>
      <dl className="audrows">
        <dt>We offer</dt>
        <dd>{fill(a.primary_offer, "Not set yet")}</dd>
        <dt>We want</dt>
        <dd>{OBJECTIVE_TEXT[a.objective][0]}</dd>
        <dt>They click</dt>
        <dd>{fill(a.cta, "Not set yet")}</dd>
        <dt>Reach them on</dt>
        <dd>
          {a.channels.length ? (
            <span className="achs">
              <span className="pill accent" title="Best channel">{a.channels[0]}</span>
              {a.channels.length > 1 ? <span>{a.channels.slice(1).join(", ")}</span> : null}
            </span>
          ) : <span className="audblank">Not set yet</span>}
        </dd>
      </dl>
      {to ? (
        <footer className="audfoot">
          <span className="k">{n === 0 ? "No campaigns yet" : n === 1 ? "1 campaign" : `${n} campaigns`}</span>
          <div className="fr">
            <button type="button" className="btn sm" onClick={onCopy}>Copy for AI</button>
            <Link className="btn sm" to={`/marketing/email/new?audience=${a.id}`}>Start a campaign</Link>
          </div>
        </footer>
      ) : null}
    </article>
  );
}
