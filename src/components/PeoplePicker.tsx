import { useEffect, useState, type ReactElement } from "react";
import { searchOwners, type OwnerHit } from "../lib/api";
import "../styles/announcements.css";
import "../styles/interactions.css";

/**
 * Picked people: search account owners by email, name or company (at least 2 letters) and add them as chips (their
 * sign-in emails). Owners only: employees can't be picked.
 */
export function PeoplePicker({
  emails,
  onChange,
  invalid,
  id = "ix-owner_emails",
}: {
  emails: string[];
  onChange: (list: string[]) => void;
  invalid: boolean;
  id?: string;
}): ReactElement {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<OwnerHit[]>([]);
  const [known, setKnown] = useState<Record<string, OwnerHit>>({});
  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) {
      setHits([]);
      return;
    }
    let alive = true;
    const timer = window.setTimeout(() => {
      searchOwners(text)
        .then((r) => alive && setHits(r))
        .catch(() => alive && setHits([]));
    }, 200);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [q]);

  const add = (hit: OwnerHit) => {
    setKnown((k) => ({ ...k, [hit.email.toLowerCase()]: hit }));
    onChange(Array.from(new Set([...emails, hit.email.toLowerCase()])));
    setQ("");
    setHits([]);
  };
  const shown = hits.filter((h) => !emails.includes(h.email.toLowerCase()));

  return (
    <div className="ix-people">
      <label className="sr" htmlFor={id}>
        Search owners by email, name or company
      </label>
      <input
        id={id}
        className={"inp" + (invalid ? " bad" : "")}
        placeholder="Search by email, name or company"
        autoComplete="off"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (shown[0]) add(shown[0]);
          }
        }}
      />
      {shown.length ? (
        <ul className="ix-hits" aria-label="Owners found">
          {shown.map((h) => (
            <li key={h.id}>
              <button type="button" onClick={() => add(h)}>
                <b>{h.company || h.full_name || h.email}</b>
                <span className="k">
                  {h.email}
                  {h.plan ? ` · ${h.plan}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : q.trim().length >= 2 ? (
        <span className="k">No owner matches “{q.trim()}”.</span>
      ) : null}
      {emails.length ? (
        <div className="an-chips">
          {emails.map((e) => {
            const who = known[e];
            const name = who ? who.company || who.full_name : "";
            return (
              <span key={e} className="an-chip">
                {name ? `${name} · ${e}` : e}
                <button type="button" className="an-chip__x" aria-label={`Remove ${name || e}`} onClick={() => onChange(emails.filter((x) => x !== e))}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                    <path d="M7 7l10 10M17 7L7 17" />
                  </svg>
                </button>
              </span>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
