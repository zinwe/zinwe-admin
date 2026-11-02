import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ApiError } from "../../lib/api";
import { campaignAction, getAudience, getCampaign, getCampaigns, getContacts, type Audience, type CampaignDetail, type Contact, type Sender } from "../../lib/marketingApi";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { PageHeader } from "../../components/PageHeader";
import { ErrorState, LoadingState } from "../../components/States";
import { useToast } from "../../components/Toast";
import { AudienceCard } from "./AudienceCard";
import { ContactDrawer, ContactsTab } from "./CampaignContacts";
import { EmailsTab } from "./CampaignEmails";
import { SettingsTab } from "./CampaignSettings";
import { ApproveBar, CAMPAIGN_STATUS, patternName, type Ctx } from "./campaignShared";
import "../../styles/marketing.css";

const TABS: [string, string][] = [["overview", "Overview"], ["contacts", "Contacts"], ["emails", "Email pattern"], ["analytics", "Analytics"], ["settings", "Settings"]];

/** The launch checks, each with the action that finishes it. */
function Launch({ c, run, go }: Ctx): ReactElement {
  const [launching, setLaunching] = useState(false);
  const action = (key: string): ReactElement | null => {
    if (key === "dns") return <button type="button" className="btn sm" onClick={() => void run(() => campaignAction(c.id, "dns"), "Records checked.")}>Check records</button>;
    if (key === "rules") return <button type="button" className="btn sm" onClick={() => go("settings")}>Open the rules</button>;
    if (key === "emails") return <button type="button" className="btn sm" onClick={() => go("emails")}>Read the emails</button>;
    if (key === "test") return <button type="button" className="btn sm" onClick={() => void run(() => campaignAction(c.id, "test", { n: 1 }), "Test sent to your address.")}>Send test to me</button>;
    if (key === "contacts") return <button type="button" className="btn sm" onClick={() => go("contacts")}>Add contacts</button>;
    return null;
  };
  const left = c.checks.filter((x) => !x.done).length;
  return (
    <section className="card editor">
      <div className="fighead">
        <h2>Get ready to launch</h2>
        <span className="k">{left ? `${left} of ${c.checks.length} left` : "All done"}</span>
      </div>
      <div>
        {c.checks.map((x) => (
          <div key={x.key} className={"ckrow" + (x.done ? " done" : "")}>
            <span className="ckmark" aria-label={x.done ? "Done" : "To do"}>{x.done ? "✓" : ""}</span>
            <span>{x.label}</span>
            {x.done ? null : action(x.key)}
          </div>
        ))}
      </div>
      <button type="button" className="btn dark mk-start" disabled={left > 0} onClick={() => setLaunching(true)}>Launch campaign</button>
      <span className="k">Launching sends nothing by itself. It lets you approve daily batches.</span>
      {launching ? (
        <ConfirmDialog title="Launch this campaign?" confirmLabel="Launch campaign" onClose={() => setLaunching(false)} onConfirm={async () => { await campaignAction(c.id, "launch"); await run(async () => undefined, "Campaign launched. No email has gone out yet."); }}>
          You can then approve batches of up to {c.daily_limit} emails a day.
        </ConfirmDialog>
      ) : null}
    </section>
  );
}

function Today({ c, go }: Ctx): ReactElement {
  const items: [number, string, string, () => void][] = [
    [c.counts.paused, "questions waiting for your answer", "Open", () => go("contacts", "you")],
    [c.counts.waiting, "contacts with no reply after Email 2", "Review", () => go("contacts", "you")],
    [c.counts.failed, "emails that failed to send", "See contacts", () => go("contacts")],
  ];
  return (
    <section className="card editor">
      <h2>What needs you today</h2>
      <div className="todo">
        {items.map(([n, label, action, open]) => (
          <div key={label} className={n ? "" : "done"}>
            <b className="num">{n}</b>
            <span>{label}</span>
            {n ? <button type="button" className="btn sm" onClick={open}>{action}</button> : <span className="k">All clear</span>}
          </div>
        ))}
      </div>
    </section>
  );
}

function OverviewTab(ctx: Ctx): ReactElement {
  const { c, go, run } = ctx;
  const [audience, setAudience] = useState<Audience | null>(null);
  useEffect(() => { void getAudience(c.audience).then(setAudience).catch(() => undefined); }, [c.audience]);
  return (
    <>
      <ApproveBar c={c} run={run} onShow={() => go("contacts", "due")} />
      <div className="hgrid">
        {c.status === "draft" ? <Launch {...ctx} /> : <Today {...ctx} />}
        <section className="card editor">
          <div className="fighead">
            <h2>Who it goes to</h2>
            <Link className="k" to={`/marketing/persona/${c.persona}/audiences/${c.audience}`}>Edit audience</Link>
          </div>
          {audience ? <AudienceCard a={audience} /> : <span className="k">{c.audience_name}</span>}
        </section>
      </div>
      <div className="tiles">
        {c.report.funnel.map((f) => <div key={f.label} className="card tile"><b>{f.value}</b><span className="k">{f.label}</span></div>)}
      </div>
    </>
  );
}

function AnalyticsTab({ c }: Ctx): ReactElement {
  const f = c.report.funnel;
  const max = Math.max(1, ...f.map((x) => x.value));
  const h = c.report.health;
  const health: [string, string, string][] = [
    ["Bounce rate", `${h.bounce_rate}%`, "Keep under 3%"],
    ["Unsubscribe rate", `${h.unsubscribe_rate}%`, "Keep under 0.5%"],
    ["Spam complaints", String(h.complaints), "Sending pauses at any complaint"],
  ];
  return (
    <>
      <div className="tiles">
        <div className="card tile"><b>{c.counts.total}</b><span className="k">Contacts</span></div>
        <div className="card tile"><b>{f[0]?.value ?? 0}</b><span className="k">Emailed</span></div>
        <div className="card tile"><b>{c.report.reply_rate}%</b><span className="k">Reply rate</span></div>
        <div className="card tile"><b>{f.find((x) => x.label === "Signed up")?.value ?? 0}</b><span className="k">Signed up</span></div>
        <div className="card tile"><b>{f.find((x) => x.label === "Installed")?.value ?? 0}</b><span className="k">Installed</span></div>
      </div>
      <section className="card editor">
        <h2>From first email to installed</h2>
        <div className="rbars">
          {f.map((x, i) => (
            <div key={x.label}>
              <span>{x.label}</span><i><em style={{ width: `${(x.value / max) * 100}%` }} /></i><b className="num">{x.value}</b>
              <small>{i && f[i - 1].value ? `${Math.round((x.value / f[i - 1].value) * 100)}% of previous` : ""}</small>
            </div>
          ))}
        </div>
      </section>
      <section className="card tablebox">
        <div className="fighead pad"><h2>Which email gets replies?</h2><span className="k">A reply counts toward the last email they had</span></div>
        <div className="scroll">
          <table className="tbl narrow">
            <caption className="sr">Results by email</caption>
            <thead><tr><th scope="col">Email</th><th scope="col">Subject</th><th scope="col" className="num">Sent</th><th scope="col" className="num">Replies</th><th scope="col" className="num">Reply rate</th></tr></thead>
            <tbody>
              {c.report.by_email.map((e) => (
                <tr key={e.n}>
                  <th scope="row"><b>Email {e.n}</b></th><td>{e.subject}</td><td className="num">{e.sent}</td><td className="num">{e.replies}</td>
                  <td className="num">{e.sent ? `${Math.round((e.replies / e.sent) * 100)}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="card editor">
        <h2>List health</h2>
        <div className="psy">
          {health.map(([a, b, d]) => <div key={a}><span>{a}</span><b className="hnum num">{b}</b><span>{d}</span></div>)}
        </div>
      </section>
      <p className="scap">Judge a campaign by replies, signups and installed PCs. Opens and clicks are not tracked, because tracking pixels hurt cold email delivery and break our privacy promise.</p>
    </>
  );
}

export function CampaignPage(): ReactElement {
  const id = Number(useParams().id);
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [c, setC] = useState<CampaignDetail | null>(null);
  const [sender, setSender] = useState<Sender | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tab = TABS.some((t) => t[0] === params.get("tab")) ? (params.get("tab") as string) : "overview";

  const refresh = useCallback(async () => {
    const [detail, people] = await Promise.all([getCampaign(id), getContacts(id)]);
    setC(detail);
    setContacts(people);
  }, [id]);

  const load = useCallback(() => {
    setError(null);
    getCampaigns().then((r) => setSender(r.sender)).catch(() => undefined);
    refresh().catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load this campaign."));
  }, [refresh]);
  useEffect(load, [load]);

  const run = useCallback(async (work: () => Promise<unknown>, done?: string) => {
    try {
      await work();
      await refresh();
      if (done) toast(done);
      return true;
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "That didn't work.", "bad");
      return false;
    }
  }, [refresh, toast]);

  const go = useCallback((next: string, show?: string) => setParams({ ...(next === "overview" ? {} : { tab: next }), ...(show ? { show } : {}) }), [setParams]);
  const opened = useMemo(() => contacts.find((x) => x.id === open) ?? null, [contacts, open]);
  const ctx: Ctx | null = c && sender ? { c, sender, contacts, run, go, openContact: (x) => setOpen(x.id) } : null;

  return (
    <div className="mk">
      {error ? <ErrorState message={error} onRetry={load} /> : !ctx || !c || !sender ? <LoadingState /> : (
        <>
          <PageHeader
            title={c.name}
            badge={<span className={"pill " + CAMPAIGN_STATUS[c.status][1]} style={{ marginLeft: 10, verticalAlign: "middle" }}>{CAMPAIGN_STATUS[c.status][0]}</span>}
            subtitle={`${c.audience_name} · ${patternName(sender, c.pattern, c.emails_count)}, ${c.emails_count} emails`}
            onReload={load}
          >
            {c.status === "active" ? <button type="button" className="btn" onClick={() => void run(() => campaignAction(c.id, "pause"), "Campaign paused. Nothing more will send.")}>Pause campaign</button> : null}
          </PageHeader>
          <Link className="lnk afback" to="/marketing/email">Back to campaigns</Link>
          {c.status === "paused" ? (
            <div className="card alertbar">
              <span><b>Sending paused.</b> {c.pause_reason}</span>
              <button type="button" className="btn sm" onClick={() => void run(() => campaignAction(c.id, "launch"), "Sending resumed.")}>Resume sending</button>
            </div>
          ) : null}
          <div className="tabs" role="tablist" aria-label="Campaign">
            {TABS.map(([k, label]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} className={"tab" + (tab === k ? " on" : "")} onClick={() => go(k)}>
                {label}
                {k === "contacts" && c.counts.needs_you ? <em>{c.counts.needs_you}</em> : null}
              </button>
            ))}
          </div>
          {tab === "overview" ? <OverviewTab {...ctx} /> : null}
          {tab === "contacts" ? <ContactsTab {...ctx} show={params.get("show") ?? "all"} /> : null}
          {tab === "emails" ? <EmailsTab {...ctx} /> : null}
          {tab === "analytics" ? <AnalyticsTab {...ctx} /> : null}
          {tab === "settings" ? <SettingsTab {...ctx} /> : null}
          {opened ? <ContactDrawer x={opened} onClose={() => setOpen(null)} onActed={() => { void run(async () => undefined); }} /> : null}
        </>
      )}
    </div>
  );
}
