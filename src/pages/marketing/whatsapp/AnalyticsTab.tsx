/**
 * Marketing -> WhatsApp -> Analytics (wa3, 11 Nov 2026), in the Templates look: the campaigns on the left with their
 * reply %, and cards on the right: the funnel, sends and replies per day, the path's steps (GET /analytics/steps/ on a
 * wa3 server), the template leaderboard, segments, English vs Hinglish and the campaigns compared.
 */
import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { WaAnalytics, WaCampaign, WaStats, WaTemplate } from "../../../lib/whatsappApi";
import { getWaSteps, LANE_LABEL, type WaCampaignX, type WaLane, type WaStepRow } from "../../../lib/whatsappApi.tabs";
import { CATEGORY_LABEL, RateChip, SideItem, when, WtShell } from "./shared";
import { numbersOf } from "./templateModel";

const pct = (a: number, b: number): string => (b ? `${Math.round((a / b) * 100)}%` : "—");

/** Messages sent (bars) and replies (line) per day. */
function Chart({ days }: { days: WaAnalytics["daily"] }): ReactElement {
  const W = 560, H = 190, pl = 28, pb = 26, pt = 10;
  const top = Math.max(4, ...days.map((d) => Math.max(d.sent, d.replies)));
  const max = Math.ceil(top / 4) * 4;
  const bw = (W - pl) / Math.max(1, days.length);
  const y = (v: number) => pt + (H - pt - pb) * (1 - v / max);
  const ticks = [0, max / 4, max / 2, (3 * max) / 4, max];
  const line = days.map((d, i) => `${pl + i * bw + bw / 2},${y(d.replies)}`).join(" ");
  const last = days[days.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Messages sent and replies per day, last 14 days" className="wa-svg">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={pl} x2={W} y1={y(v)} y2={y(v)} stroke="var(--line-soft)" />
          <text x={pl - 6} y={y(v) + 4} textAnchor="end" fontSize="10" fill="var(--ink-3)">{v}</text>
        </g>
      ))}
      {days.map((d, i) => (
        <g key={d.date}>
          <rect x={pl + i * bw + bw * 0.18} y={y(d.sent)} width={bw * 0.64} height={y(0) - y(d.sent)} rx="2" fill="var(--ink)"><title>{`${when(d.date)}: ${d.sent} sent, ${d.replies} replies`}</title></rect>
          {i % 2 === 0 ? <text x={pl + i * bw + bw / 2} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--ink-3)">{when(d.date)}</text> : null}
        </g>
      ))}
      <polyline points={line} fill="none" stroke="var(--accent)" strokeWidth="2.5" />
      {last ? <circle cx={pl + (days.length - 1) * bw + bw / 2} cy={y(last.replies)} r="4" fill="var(--accent)" /> : null}
    </svg>
  );
}

function Panel({ title, note, wide, children, id }: { title: string; note?: ReactNode; wide?: boolean; children: ReactNode; id: string }): ReactElement {
  return (
    <section className={"wc-card wtx-panel" + (wide ? " is-wide" : "")} aria-labelledby={id}>
      <div className="wtx-panelh"><h3 id={id}>{title}</h3>{note ? <span>{note}</span> : null}</div>
      <div className="wtx-panelb">{children}</div>
    </section>
  );
}

/** Contacts → Messaged → Replied → YES → Paid (or Signed up on an older server), each with its share of the step before. */
function Funnel({ steps }: { steps: [string, number][] }): ReactElement {
  const top = Math.max(1, steps[0]?.[1] ?? 1);
  return (
    <ol className="wtx-funnel" aria-label="Funnel">
      {steps.map(([label, n], i) => (
        <li key={label}>
          <div className="wc-ml"><span>{label}</span><b>{n}{i ? <em> · {pct(n, steps[i - 1][1])} of {steps[i - 1][0].toLowerCase()}</em> : null}</b></div>
          <div className="wt-bar"><i className={i ? "is-mid" : ""} style={{ width: `${Math.round((n / top) * 100)}%` }} /></div>
        </li>
      ))}
    </ol>
  );
}

function Steps({ campaign }: { campaign: number }): ReactElement {
  const [rows, setRows] = useState<WaStepRow[] | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    setRows(undefined);
    setFailed(false);
    getWaSteps(campaign).then((r) => { if (alive) setRows(r); }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [campaign]);
  if (failed) return <span className="k">Couldn't load the steps. Refresh to try again.</span>;
  if (rows === undefined) return <span className="k">Loading the steps…</span>;
  if (rows === null) return <span className="k">This server doesn't count by step yet. The steps show here once the path engine is live.</span>;
  if (!rows.length) return <span className="k">This campaign runs on the older plan, so it has no path steps yet.</span>;
  return (
    <div className="wtx-scroll">
      <table className="tbl wtx-tbl">
        <caption className="sr">The path, step by step</caption>
        <thead><tr><th scope="col">Step</th><th scope="col">Lane</th><th scope="col" className="num">Here now</th><th scope="col" className="num">Sent</th><th scope="col" className="num">Replies</th><th scope="col" className="num">Reply rate</th></tr></thead>
        <tbody>
          {rows.map((s) => (
            <tr key={`${s.lane}-${s.step_id}`}>
              <th scope="row">{s.label}</th>
              <td>{LANE_LABEL[s.lane as WaLane] ?? s.lane}</td>
              <td className="num">{s.here}</td>
              <td className="num">{s.sent}</td>
              <td className="num">{s.replies}</td>
              <td className="num"><RateChip replied={s.replies} sent={s.sent} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const csvCell = (v: string | number): string => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
function download(name: string, rows: (string | number)[][]): void {
  const blob = new Blob([`\uFEFF${rows.map((r) => r.map(csvCell).join(",")).join("\n")}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const LEADERS = 10;

export function AnalyticsTab({ data, campaigns, templates }: { data: WaAnalytics; campaigns: WaCampaign[]; templates: WaTemplate[] }): ReactElement {
  const [pick, setPick] = useState<number | null>(null);
  const [allLeaders, setAllLeaders] = useState(false);
  const list = campaigns as WaCampaignX[];
  const row = pick === null ? null : data.campaigns.find((c) => c.id === pick) ?? null;
  const camp = pick === null ? null : list.find((c) => c.id === pick) ?? null;
  const t: WaStats = row ?? camp?.stats ?? data.total;
  const name = pick === null ? "All campaigns" : camp?.name ?? row?.name ?? "Campaign";
  const sent = camp?.sent ?? t.messaged;
  const replies = camp?.replies ?? t.replied;
  const yes = camp?.yes ?? t.interested;
  const funnel: [string, number][] = [
    ["Contacts", camp?.contacts ?? t.contacts], ["Messaged", t.messaged], ["Replied", t.replied], ["YES", yes],
    typeof camp?.paid === "number" ? ["Paid", camp.paid] : ["Signed up", t.signed],
  ];
  const leaders = templates.filter((x) => x.category && x.category !== "quick_reply" && !x.version_of)
    .map((x) => ({ t: x, n: numbersOf(x) })).filter((x) => x.n.total.sends > 0)
    .sort((a, b) => b.n.total.rate - a.n.total.rate || b.n.total.sends - a.n.total.sends);
  const shownLeaders = allLeaders ? leaders : leaders.slice(0, LEADERS);
  const sheet = () => {
    const rows: (string | number)[][] = [["Campaign", "Messaged", "Replied", "Reply rate", "Interested", "Signed up", "Asked to stop"]];
    data.campaigns.forEach((c) => rows.push([c.name, c.messaged, c.replied, pct(c.replied, c.messaged), c.interested, c.signed, c.stopped]));
    rows.push([], ["Template", "Category", "Sends", "Replies", "Reply rate"]);
    leaders.forEach(({ t: x, n }) => rows.push([x.name, CATEGORY_LABEL[x.category as keyof typeof CATEGORY_LABEL] ?? "", n.total.sends, n.total.replies, `${n.total.rate}%`]));
    download("zinwe-whatsapp-analytics.csv", rows);
  };

  return (
    <WtShell label="Campaigns" current={name} side={(close) => (
      <>
        <div className="wt-sec">
          <SideItem on={pick === null} onPick={() => { setPick(null); close(); }} label="All campaigns" sub={`${data.total.messaged} messaged · ${data.blocked} asked to stop`}
            chip={<RateChip replied={data.total.replied} sent={data.total.messaged} />} />
        </div>
        {data.campaigns.length ? (
          <div className="wt-sec">
            <div className="wt-sech"><span>CAMPAIGNS</span></div>
            {data.campaigns.map((c) => {
              const x = list.find((y) => y.id === c.id);
              const state = c.status === "live" ? "Live" : c.status === "paused" ? "Paused" : c.status ? "Draft" : "";
              return (
                <SideItem key={c.id} on={pick === c.id} onPick={() => { setPick(c.id); close(); }} label={c.name}
                  sub={[state, `${c.messaged} messaged`, x?.engine === "path" ? "Path" : ""].filter(Boolean).join(" · ")}
                  chip={<RateChip replied={c.replied} sent={c.messaged} />} />
              );
            })}
          </div>
        ) : null}
      </>
    )}>
      <div className="wt-head">
        <div><h2>{name}</h2><p>{pick === null ? "All WhatsApp campaigns together: what was sent, who replied and what they did next." : `${camp?.audience_name ? `${camp.audience_name} · ` : ""}what this campaign sent, who replied and what they did next.`}</p></div>
        <div className="wt-tools">
          {pick !== null ? <Link className="wt-btn" to={`/marketing/whatsapp/campaigns/${pick}`}>Open the campaign</Link> : null}
          <button type="button" className="wt-btn" onClick={sheet}>Download as sheet</button>
        </div>
      </div>
      <div className="wt-stats" aria-label="Totals">
        <span><b>{t.messaged}</b> messaged</span><span>·</span>
        <span><b>{t.replied}</b> replied</span><RateChip replied={t.replied} sent={t.messaged} /><span>·</span>
        <span><b>{t.interested}</b> interested</span><span>·</span>
        <span><b>{t.signed}</b> signed up</span><span>·</span>
        <span>opt-out rate <b>{pct(t.stopped, t.messaged)}</b></span>
      </div>
      <div className="wtx-cards">
        <Panel id="wtx-funnel" title="Funnel" note={pick === null ? "Every campaign" : "This campaign"}>
          <Funnel steps={funnel} />
          <span className="k">{sent} sends, {replies} replies{camp?.reply_rate !== undefined ? ` · ${camp.reply_rate}% reply rate` : ""}.</span>
        </Panel>
        <Panel id="wtx-daily" title="Sends and replies per day" note={pick === null ? "Last 14 days" : "Last 14 days · all campaigns"}>
          <Chart days={data.daily} />
          <div className="fr"><span className="wa-key"><i style={{ background: "var(--ink)" }} />Messages sent</span><span className="wa-key"><i style={{ background: "var(--accent)" }} />Replies</span></div>
          <span className="k">Sunday is blank: the send window is Monday to Saturday. A contact can reply more than once.</span>
        </Panel>
        {pick !== null ? (
          <Panel id="wtx-steps" title="The path, step by step" note="Where contacts are now, and what each step got" wide>
            <Steps campaign={pick} />
          </Panel>
        ) : null}
        <Panel id="wtx-leaders" title={`Template leaderboard · ${leaders.length}`} note="Best reply rate first · last 30 days, every campaign" wide>
          {leaders.length ? (
            <div className="wtx-scroll">
              <table className="tbl wtx-tbl">
                <caption className="sr">Templates by reply rate</caption>
                <thead><tr><th scope="col">#</th><th scope="col">Template</th><th scope="col">Category</th><th scope="col" className="num">Sends</th><th scope="col" className="num">Replies</th><th scope="col" className="num">Reply rate</th><th scope="col" className="num">Next step</th></tr></thead>
                <tbody>
                  {shownLeaders.map(({ t: x, n }, i) => (
                    <tr key={x.id}>
                      <td className="num">{i + 1}</td>
                      <th scope="row">{x.name}{x.archived ? <span className="k"> · archived</span> : null}</th>
                      <td>{CATEGORY_LABEL[x.category as keyof typeof CATEGORY_LABEL] ?? "—"}</td>
                      <td className="num">{n.total.sends}</td>
                      <td className="num">{n.total.replies}</td>
                      <td className="num"><RateChip replied={n.total.replies} sent={n.total.sends} /></td>
                      <td className="num">{n.next === null ? "—" : `${n.next}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <span className="k">No template has been sent in the last 30 days.</span>}
          <div className="fr between">
            <span className="k">Replies = replies ÷ sent. Next step = YES for Intro, paid for Offer, Track set for Engage. Edit a template in <Link to="/marketing/whatsapp/templates">Templates</Link>.</span>
            {leaders.length > LEADERS ? <button type="button" className="wt-btn is-ghost" onClick={() => setAllLeaders((o) => !o)}>{allLeaders ? "Top 10 only" : `All ${leaders.length}`}</button> : null}
          </div>
        </Panel>
        <Panel id="wtx-seg" title="Reply rate by segment" note="Every campaign" wide>
          <div className="rbars">
            {data.segments.length ? data.segments.map((s) => (
              <div key={s.segment} className="wa-bar">
                <span title={s.segment}>{s.segment}</span>
                <i><em style={{ width: s.messaged ? `${Math.round((s.replied / s.messaged) * 100)}%` : "0%" }} /></i>
                <b className="num">{pct(s.replied, s.messaged)}</b>
              </div>
            )) : <span className="k">No contacts yet.</span>}
          </div>
          <span className="k">WhatsApp read ticks aren't tracked: only what people reply and do. {data.blocked} {data.blocked === 1 ? "number" : "numbers"} asked to stop.</span>
        </Panel>
        {data.languages ? (
          <Panel id="wa-lang-h" title="English vs Hinglish" note="By the language of each contact’s first message" wide>
            <div className="wtx-scroll">
              <table className="tbl wtx-tbl">
                <thead><tr><th scope="col">Language</th><th scope="col" className="num">Messaged</th><th scope="col" className="num">Replied</th><th scope="col" className="num">Reply rate</th><th scope="col" className="num">Interested</th><th scope="col" className="num">YES rate</th><th scope="col" className="num">Asked to stop</th></tr></thead>
                <tbody>
                  {data.languages.map((l) => (
                    <tr key={l.language}>
                      <th scope="row">{l.label}</th>
                      <td className="num">{l.messaged}</td>
                      <td className="num">{l.replied}</td>
                      <td className="num">{pct(l.replied, l.messaged)}</td>
                      <td className="num">{l.interested}</td>
                      <td className="num">{pct(l.interested, l.messaged)}</td>
                      <td className="num">{l.stopped}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <span className="k">{data.languages.every((l) => l.messaged >= 30) ? "Both have 30 or more: the difference starts to mean something." : "Wait for at least 30 first messages in each before choosing a winner. Set a campaign to “Half English, half Hinglish” to compare."}</span>
          </Panel>
        ) : null}
        {pick === null ? (
          <Panel id="wtx-camps" title="Campaigns compared" note={`${data.campaigns.length} campaigns`} wide>
            {data.campaigns.length ? (
              <div className="wtx-scroll">
                <table className="tbl wtx-tbl">
                  <caption className="sr">Campaigns compared</caption>
                  <thead><tr><th scope="col">Campaign</th><th scope="col" className="num">Messaged</th><th scope="col" className="num">Reply rate</th><th scope="col" className="num">Interested</th><th scope="col" className="num">Signed up</th><th scope="col" className="num">Opt-out rate</th></tr></thead>
                  <tbody>
                    {data.campaigns.map((c) => (
                      <tr key={c.id}>
                        <th scope="row"><Link className="cobtn" to={`/marketing/whatsapp/campaigns/${c.id}`}>{c.name}</Link></th>
                        <td className="num">{c.messaged}</td>
                        <td className="num">{pct(c.replied, c.messaged)}</td>
                        <td className="num">{c.interested}</td>
                        <td className="num">{c.signed}</td>
                        <td className="num">{pct(c.stopped, c.messaged)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <span className="k">No campaigns yet.</span>}
          </Panel>
        ) : null}
      </div>
    </WtShell>
  );
}
