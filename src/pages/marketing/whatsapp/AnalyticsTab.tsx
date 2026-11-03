import type { ReactElement } from "react";
import { Link } from "react-router-dom";
import type { WaAnalytics } from "../../../lib/whatsappApi";
import { when } from "./shared";

const pct = (a: number, b: number): string => (b ? `${Math.round((a / b) * 100)}%` : "—");

/** Messages sent (bars) and replies (line) per day. */
function Chart({ days }: { days: WaAnalytics["daily"] }): ReactElement {
  const W = 560, H = 190, pl = 28, pb = 26, pt = 10;
  const top = Math.max(4, ...days.map((d) => Math.max(d.sent, d.replies)));
  const max = Math.ceil(top / 4) * 4;
  const bw = (W - pl) / days.length;
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

export function AnalyticsTab({ data }: { data: WaAnalytics }): ReactElement {
  const t = data.total;
  return (
    <>
      <div className="tiles">
        {([["Messaged", t.messaged], ["Replied", t.replied], ["Reply rate", pct(t.replied, t.messaged)], ["Interested", t.interested], ["Signed up", t.signed], ["Opt-out rate", pct(t.stopped, t.messaged)]] as [string, string | number][]).map(([l, v]) => (
          <div key={l} className="card tile"><b className="num">{v}</b><span className="k">{l}</span></div>
        ))}
      </div>
      <div className="wa-grid">
        <section className="card editor">
          <div className="fighead"><h2>Daily messages and replies</h2><span className="k">Last 14 days</span></div>
          <Chart days={data.daily} />
          <div className="fr"><span className="wa-key"><i style={{ background: "var(--ink)" }} />Messages sent</span><span className="wa-key"><i style={{ background: "var(--accent)" }} />Replies</span></div>
        </section>
        <section className="card editor">
          <h2>Reply rate by segment</h2>
          <div className="rbars">
            {data.segments.length ? data.segments.map((s) => (
              <div key={s.segment} className="wa-bar">
                <span title={s.segment}>{s.segment}</span>
                <i><em style={{ width: s.messaged ? `${Math.round((s.replied / s.messaged) * 100)}%` : "0%" }} /></i>
                <b className="num">{pct(s.replied, s.messaged)}</b>
              </div>
            )) : <span className="k">No contacts yet.</span>}
          </div>
          <span className="k">WhatsApp read ticks aren't tracked: only what people reply and do. {data.blocked} numbers asked to stop.</span>
        </section>
      </div>
      <section className="card tablebox">
        <div className="scroll">
          <table className="tbl">
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
        {data.campaigns.length ? null : <div className="empty">No campaigns yet.</div>}
      </section>
    </>
  );
}

export function SettingsTab(): ReactElement {
  return (
    <div className="wa-grid">
      <section className="card editor">
        <h2>How messages are sent</h2>
        <div className="wa-mode on"><div className="fr between"><b>By a person, from the WhatsApp Business app</b><span className="pill good">In use</span></div><span className="k">Zinwe drafts each message. Open in WhatsApp fills in the chat; you press Send on the Zinwe WhatsApp Business number, then Mark as sent here.</span></div>
        <div className="wa-mode"><div className="fr between"><b>WhatsApp Business Platform</b><span className="pill">Later</span></div><span className="k">Official sending through Meta with approved templates, only for people who said yes or signed up. Replies would arrive here by themselves.</span></div>
        <div className="wa-mode dashed"><b>Never: a bot that sends from WhatsApp Web</b><span className="k">WhatsApp bans numbers that send automatically through WhatsApp Web or browser tools. Zinwe doesn't do this.</span></div>
        <span className="k">Claude drafts: personalised when ANTHROPIC_API_KEY is set on the server, otherwise the template with the name and business filled in.</span>
      </section>
      <section className="card editor">
        <h2>Rules for every campaign</h2>
        <ul className="wa-rules">
          <li>Only businesses you found yourself, each with a source. Never a bought list.</li>
          <li>The first message says who you are and how to stop.</li>
          <li>At most one follow-up. No reply means we stop.</li>
          <li>STOP, block or "not interested" means never again, in every campaign.</li>
          <li>Message between 10:00 and 18:00, Monday to Saturday, in the contact's time.</li>
          <li>Real contacts live in production only. Dev and local get a few test numbers.</li>
          <li>US office numbers are often landlines with no WhatsApp: use email for US firms.</li>
        </ul>
      </section>
    </div>
  );
}
