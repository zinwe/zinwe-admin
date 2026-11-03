import { useCallback, useEffect, useState, type ReactElement } from "react";
import { Link } from "react-router-dom";
import {
  ApiError,
  fetchIssueScreenshot,
  getIssues,
  replyToIssue,
  setIssueStatus,
  type IssueRow,
  type IssueStatus,
} from "../lib/api";
import { refreshBadges } from "../lib/badges";
import { pageName } from "../lib/pages";
import { useLoad } from "../lib/useLoad";
import { PageHeader } from "../components/PageHeader";
import { ErrorState, LoadingState } from "../components/States";
import { useToast } from "../components/Toast";
import { dayTime } from "./inbox/format";
import "../styles/issues.css";

const STATUSES: [IssueStatus, string, string][] = [
  ["new", "New", "warn"],
  ["looking", "Looking into it", "accent"],
  ["fixed", "Fixed", "good"],
  ["closed", "Closed", "muted"],
];
const LABEL = Object.fromEntries(STATUSES.map(([k, l]) => [k, l])) as Record<IssueStatus, string>;
const TONE = Object.fromEntries(STATUSES.map(([k, , t]) => [k, t])) as Record<IssueStatus, string>;

/** "Chrome 131 · Windows · 1366x768 window" from what the browser sent. */
function contextLine(c: Record<string, string>): string {
  return [c.browser, c.platform, c.viewport ? `${c.viewport} window` : "", c.screen ? `${c.screen} screen` : "",
    c.language, c.timezone, c.online === "no" ? "offline" : ""].filter(Boolean).join(" · ");
}

/** The screenshot, fetched with the staff token on first open; "Open full size" for zooming. */
function Screenshot({ id }: { id: number }): ReactElement {
  const [state, setState] = useState<{ url: string } | "loading" | "error">("loading");
  useEffect(() => {
    let alive = true;
    let url: string | null = null;
    fetchIssueScreenshot(id)
      .then((blob) => {
        url = URL.createObjectURL(blob);
        if (alive) setState({ url });
      })
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id]);
  if (state === "loading") return <span className="iss-shot__wait shimmer" aria-label="Loading the screenshot" />;
  if (state === "error") return <p className="k" role="alert">The screenshot couldn’t be loaded.</p>;
  return (
    <figure className="iss-shot">
      <img src={state.url} alt={`Screenshot sent with issue #${id}`} />
      <figcaption>
        <a className="btn sm" href={state.url} target="_blank" rel="noreferrer">
          Open full size
        </a>
      </figcaption>
    </figure>
  );
}

function IssueCard({ row, onChange }: { row: IssueRow; onChange: (row: IssueRow) => void }): ReactElement {
  const toast = useToast();
  const [showShot, setShowShot] = useState(false);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const who = row.customer.full_name || row.customer.email;

  const move = async (status: IssueStatus) => {
    setBusy(true);
    try {
      const next = await setIssueStatus(row.id, status);
      onChange(next);
      refreshBadges();
      if (next.email === "sent") toast(`Marked ${LABEL[status].toLowerCase()} and emailed ${row.customer.email}.`);
      else if (next.email) toast(`Marked ${LABEL[status].toLowerCase()}, but the email failed: ${next.email}`, "bad");
      else toast(`Marked ${LABEL[status].toLowerCase()}.`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn’t save that.", "bad");
    }
    setBusy(false);
  };

  const send = async () => {
    setBusy(true);
    try {
      onChange(await replyToIssue(row.id, reply));
      setReply("");
      refreshBadges();
      toast(`Reply emailed to ${row.customer.email}.`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn’t send the reply.", "bad");
    }
    setBusy(false);
  };

  return (
    <article className={`card iss${row.status === "new" ? " is-new" : ""}`} aria-labelledby={`iss-${row.id}`}>
      <header className="iss__head">
        <div>
          <h2 id={`iss-${row.id}`}>
            #{row.id} · {row.customer.company || who}
          </h2>
          <span className="k">
            <Link to={`/subscribers?open=${row.customer.id}`}>{who}</Link> · {pageName(row.page || "/app")} · {dayTime(row.created_at)}
          </span>
        </div>
        <span className={`pill ${TONE[row.status]}`}>{LABEL[row.status]}</span>
      </header>

      <p className="iss__text">{row.description}</p>
      {Object.keys(row.context).length ? <p className="k iss__ctx">{contextLine(row.context)}</p> : null}

      {row.has_screenshot ? (
        showShot ? (
          <Screenshot id={row.id} />
        ) : (
          <button type="button" className="btn sm" onClick={() => setShowShot(true)}>
            View screenshot
          </button>
        )
      ) : (
        <span className="k">No screenshot.</span>
      )}

      {row.reply ? (
        <blockquote className="iss__reply">
          <b>Your last reply</b>
          {row.reply}
        </blockquote>
      ) : null}

      <div className="iss__acts">
        <div className="fr" role="group" aria-label="Status">
          {STATUSES.map(([k, l]) => (
            <button
              key={k}
              type="button"
              className={`chip${row.status === k ? " on" : ""}`}
              disabled={busy || row.status === k}
              onClick={() => void move(k)}
            >
              {l}
            </button>
          ))}
        </div>
        {row.contact_ok ? (
          <span className="k">Marking it Fixed emails them.</span>
        ) : (
          <span className="k">They asked not to get emails about this report.</span>
        )}
      </div>

      {row.contact_ok ? (
        <div className="iss__write">
          <label className="fl">
            Reply by email
            <textarea
              className="inp"
              rows={3}
              maxLength={4000}
              value={reply}
              placeholder="Thanks for the screenshot. We can see it and are fixing it now."
              onChange={(e) => setReply(e.target.value)}
            />
          </label>
          <button type="button" className="btn dark sm" disabled={busy || !reply.trim()} onClick={() => void send()}>
            Send reply
          </button>
        </div>
      ) : null}
    </article>
  );
}

/**
 * Issues: problems owners report from the dashboard (Help → Report an issue, the feedback dialog's second tab, the
 * Support panel and "Report it" on error screens), with a screenshot and the browser details. Move each along
 * (New → Looking into it → Fixed / Closed); Fixed and replies email the owner when they agreed.
 */
export function IssuesPage(): ReactElement {
  const loader = useCallback(() => getIssues(), []);
  const { data, error, pending, reload, setData } = useLoad(loader);
  const [filter, setFilter] = useState<IssueStatus | "open" | "all">("open");

  const rows = (data?.rows ?? []).filter((r) =>
    filter === "all" ? true : filter === "open" ? r.status === "new" || r.status === "looking" : r.status === filter,
  );
  const counts = data?.counts;
  const update = (next: IssueRow) => {
    if (!data) return;
    const old = data.rows.find((r) => r.id === next.id);
    const c = { ...data.counts };
    if (old && old.status !== next.status) {
      c[old.status] -= 1;
      c[next.status] += 1;
    }
    setData({ counts: c, rows: data.rows.map((r) => (r.id === next.id ? next : r)) });
  };

  return (
    <>
      <PageHeader
        title="Issues"
        subtitle="Problems customers reported from their dashboard, with a screenshot and their browser details. Reproduce, fix, then mark Fixed: they get an email."
        onReload={reload}
        pending={pending}
      />
      <div className="fr iss-filter" role="group" aria-label="Show">
        {([["open", "Open"], ...STATUSES.map(([k, l]) => [k, l]), ["all", "All"]] as [typeof filter, string][]).map(([k, l]) => (
          <button key={k} type="button" className={`chip${filter === k ? " on" : ""}`} onClick={() => setFilter(k)}>
            {l}
            {counts ? (
              <span className="n">
                {k === "all"
                  ? Object.values(counts).reduce((a, b) => a + b, 0)
                  : k === "open"
                    ? counts.new + counts.looking
                    : counts[k]}
              </span>
            ) : null}
          </button>
        ))}
      </div>
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? (
        <LoadingState rows={5} label="Loading issues…" />
      ) : rows.length ? (
        <div className="iss-list">
          {rows.map((r) => (
            <IssueCard key={r.id} row={r} onChange={update} />
          ))}
        </div>
      ) : (
        <section className="card iss-empty">
          <b>{filter === "open" ? "No open issues" : "Nothing here"}</b>
          <span>Reports from Help → Report an issue in the customer dashboard show up here.</span>
        </section>
      )}
    </>
  );
}
