import { useCallback, useState, type ReactElement } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ApiError } from "../lib/api";
import { dateTime } from "../lib/format";
import { useLoad } from "../lib/useLoad";
import {
  decidePlan,
  downloadPlanPdf,
  listPlans,
  makePlanNow,
  type PlanDecision,
  type PlanItem,
  type PlanStatus,
  type VersionPlan,
} from "../lib/versionsApi";
import { PageHeader } from "../components/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "../components/States";
import { Icon } from "../components/icons";
import { useToast } from "../components/Toast";
import "../styles/versions.css";

const SECTIONS: { key: PlanDecision; label: string }[] = [
  { key: "in", label: "Goes into the next version" },
  { key: "review", label: "To review" },
  { key: "planned", label: "Already planned" },
  { key: "later", label: "Later" },
];
const KIND_LABEL = { bug: "Bug", feature: "Feature", improvement: "Improvement" } as const;
const KIND_TONE = { bug: "bad", feature: "info", improvement: "muted" } as const;
const STATUS_TONE: Record<PlanStatus, string> = {
  drafting: "muted",
  ready: "warn",
  approved: "good",
  set_aside: "muted",
  failed: "bad",
};

function fileName(plan: VersionPlan): string {
  return `New-version-plan-${plan.period_end.slice(0, 10)}.pdf`;
}

/** New version: every Thursday 3 AM the week's feedback and issue reports become a plan for the next version. */
export function NewVersionPage(): ReactElement {
  const toast = useToast();
  const load = useCallback(() => listPlans(), []);
  const list = useLoad(load);
  const [params, setParams] = useSearchParams();
  const [making, setMaking] = useState(false);

  const rows = list.data?.rows ?? [];
  const chosen = rows.find((p) => p.id === Number(params.get("plan"))) ?? rows[0];

  const replace = (plan: VersionPlan) => {
    if (!list.data) return;
    const others = list.data.rows.filter((p) => p.id !== plan.id);
    list.setData({ ...list.data, rows: [plan, ...others].sort((a, b) => b.created_at.localeCompare(a.created_at)) });
  };

  const makeNow = async () => {
    setMaking(true);
    try {
      const plan = await makePlanNow();
      replace(plan);
      setParams({ plan: String(plan.id) });
      toast(plan.status === "failed" ? "The plan couldn't be made. See why below." : "Plan ready. A copy is on its way to your email.",
        plan.status === "failed" ? "bad" : "good");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't make the plan.", "bad");
    } finally {
      setMaking(false);
    }
  };

  return (
    <>
      <PageHeader
        title="New version"
        subtitle="Every Thursday at 3 AM, Zinwe reads the week's feedback and issue reports, plans the next version and emails you the PDF."
        onReload={list.reload}
        pending={list.pending}
      >
        <button type="button" className="btn dark" onClick={makeNow} disabled={making}>
          <Icon name="plus" />
          {making ? "Making the plan… about a minute" : "Make a plan now"}
        </button>
      </PageHeader>

      {list.error ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : !list.data ? (
        <LoadingState rows={6} label="Loading plans…" />
      ) : rows.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="deploy"
            title="No plans yet"
            body={`The first weekly plan arrives ${dateTime(list.data.next_run)}. You can also make one now from the last 7 days.`}
          />
        </div>
      ) : (
        <div className="nv-layout">
          <nav className="card nv-list" aria-label="Plans">
            <p className="k nv-list__next">Next plan: {dateTime(list.data.next_run)}</p>
            <ul>
              {rows.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className={"nv-row" + (p.id === chosen?.id ? " on" : "")}
                    aria-current={p.id === chosen?.id ? "true" : undefined}
                    onClick={() => setParams({ plan: String(p.id) })}
                  >
                    <span className="nv-row__top">
                      <b>{p.version ? `Version ${p.version}` : p.period}</b>
                      <span className={`pill ${STATUS_TONE[p.status]}`}>{p.status_label}</span>
                    </span>
                    <span className="k">
                      {p.version ? `${p.period} · ` : ""}
                      {p.kind === "manual" ? "made by hand" : "weekly"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          {chosen ? <PlanPane plan={chosen} onChange={replace} /> : null}
        </div>
      )}
    </>
  );
}

function PlanPane({ plan, onChange }: { plan: VersionPlan; onChange: (plan: VersionPlan) => void }): ReactElement {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const decided = plan.status === "approved" || plan.status === "set_aside";
  const counts = plan.counts ?? {};

  const decide = async (status: "approved" | "set_aside" | "ready") => {
    setBusy(true);
    try {
      onChange(await decidePlan(plan.id, status));
      toast(status === "approved" ? "Plan approved." : status === "set_aside" ? "Plan set aside." : "Back to ready.");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't save that.", "bad");
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    try {
      await downloadPlanPdf(plan.id, fileName(plan));
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't download the PDF.", "bad");
    }
  };

  return (
    <article className="card nv-pane" aria-labelledby="nv-title">
      <header className="nv-pane__head">
        <div>
          <p className="k">
            {plan.period} · {counts.issues ?? 0} issue reports · {counts.feedback ?? 0} feedback
            {counts.average_rating != null ? ` · average rating ${counts.average_rating}/10` : ""}
          </p>
          <h2 id="nv-title" className="nv-pane__title">
            {plan.version ? `Version ${plan.version}: ` : ""}
            {plan.headline || (plan.status === "failed" ? "This plan couldn't be made" : "New version plan")}
          </h2>
        </div>
        <div className="nv-acts">
          {plan.status !== "failed" && plan.status !== "drafting" ? (
            <button type="button" className="btn" onClick={download}>
              <Icon name="download" />
              PDF
            </button>
          ) : null}
          {plan.status === "ready" ? (
            <>
              <button type="button" className="btn" onClick={() => decide("set_aside")} disabled={busy}>
                Set aside
              </button>
              <button type="button" className="btn dark" onClick={() => decide("approved")} disabled={busy}>
                <Icon name="check" />
                Approve
              </button>
            </>
          ) : decided ? (
            <button type="button" className="btn" onClick={() => decide("ready")} disabled={busy}>
              Undo
            </button>
          ) : null}
        </div>
      </header>

      {plan.summary ? <p className="nv-summary">{plan.summary}</p> : null}
      {plan.error ? <p className={"note " + (plan.status === "failed" ? "warn" : "info")}>{plan.error}</p> : null}
      {decided && plan.decided_by ? (
        <p className="k">
          {plan.status === "approved" ? "Approved" : "Set aside"} by {plan.decided_by} on {dateTime(plan.decided_at)}
        </p>
      ) : null}

      {SECTIONS.map((s) => {
        const items = plan.items.filter((i) => i.decision === s.key);
        return items.length ? (
          <section key={s.key} className="nv-sec" aria-label={s.label}>
            <h3 className="nv-sec__h">
              {s.label} <span className="num k">{items.length}</span>
            </h3>
            <ol className="nv-items">
              {items.map((item, n) => (
                <Item key={n} item={item} />
              ))}
            </ol>
          </section>
        ) : null;
      })}
      {plan.status !== "failed" && plan.items.length === 0 ? (
        <EmptyState title="Nothing to plan from" body="No feedback or issue reports came in during this period." />
      ) : null}

      <p className="k nv-mail">
        {plan.email_status === "sent"
          ? `Emailed to ${plan.emailed_to} on ${dateTime(plan.emailed_at)}.`
          : plan.email_status
            ? `Email not sent: ${plan.email_status}`
            : "Not emailed yet."}
        {plan.drafted_by && plan.drafted_by !== "list" ? ` Drafted by ${plan.drafted_by}.` : ""}
      </p>
    </article>
  );
}

function Item({ item }: { item: PlanItem }): ReactElement {
  return (
    <li className="nv-item">
      <div className="nv-item__top">
        <b>{item.title}</b>
        <span className={`pill ${KIND_TONE[item.kind]}`}>{KIND_LABEL[item.kind]}</span>
      </div>
      {item.why ? <p className="nv-item__why">{item.why}</p> : null}
      {item.sources.length ? (
        <p className="k">
          From{" "}
          {item.sources.map((s, n) => (
            <span key={`${s.type}-${s.id}`}>
              {n ? ", " : ""}
              <Link className="lnk" to={s.type === "issue" ? "/issues" : "/feedback"}>
                {s.type === "issue" ? "Issue" : "Feedback"} #{s.id}
              </Link>
            </span>
          ))}
        </p>
      ) : null}
    </li>
  );
}
