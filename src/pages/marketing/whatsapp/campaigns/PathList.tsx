/**
 * Campaigns (owner, 11 Nov 2026; board AdminWaCampaigns, view "All campaigns"): the Templates look. A menu like
 * ChatGPT's sidebar (Live, Drafts, Paused, Ended with reply % chips), then each campaign as a card with its path in
 * one line of chips, its numbers and the next step. Campaigns still on the older three-touch plan ("slots") are
 * listed too and open the older editor.
 */
import { useEffect, useMemo, useState, type ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "../../../../components/Toast";
import {
  createWaPathCampaign, getWaPath, putWaPath, type WaCampaign, type WaPath, type WaTemplate,
} from "../../../../lib/whatsappApi";
import { errText } from "../shared";
import { band } from "../templateModel";
import { Svg } from "../templateParts";
import { draftSteps, miniOf, normalisePath, pathDays, statusOf, STATUS_LABEL, stepCount, type Status } from "./pathModel";
import "../../../../styles/wa-templates.css";
import "../../../../styles/wa-campaigns.css";

const DOT: Record<Status, string> = { live: "var(--ok)", draft: "var(--ink-4)", paused: "var(--accent)", ended: "var(--line-2)" };
const GROUPS: [Status, string][] = [["live", "LIVE"], ["draft", "DRAFTS"], ["paused", "PAUSED"], ["ended", "ENDED"]];

/** A campaign's numbers, from the path API's fields or the older stats. */
export function numbersOfCampaign(c: WaCampaign): { contacts: number; sent: number; replies: number; rate: number; yes: number; paid: number } {
  const s = c.stats;
  const contacts = c.contacts ?? s?.contacts ?? 0;
  const sent = c.sent ?? s?.messaged ?? 0;
  const replies = c.replies ?? s?.replied ?? 0;
  const rate = typeof c.reply_rate === "number" ? c.reply_rate : sent ? Math.round((replies / sent) * 100) : 0;
  return { contacts, sent, replies, rate, yes: c.yes ?? s?.interested ?? 0, paid: c.paid ?? 0 };
}

const isPath = (c: WaCampaign) => c.engine === "path";

/** The older plan in chips: first message, the follow-up after its wait, the polite close. */
function slotsMini(c: WaCampaign, templates: WaTemplate[]): { t: string; cls: string }[] {
  const name = (id: number | null) => templates.find((t) => t.id === id)?.name ?? "";
  const out: { t: string; cls: string }[] = [];
  if (c.first) out.push({ t: name(c.first) || "First message", cls: "wf-chip" });
  if (c.followup) out.push({ t: `→ ${c.followup_days} d →`, cls: "wf-chip is-wait" }, { t: name(c.followup) || "Follow-up", cls: "wf-chip" });
  if (c.touch3) out.push({ t: `→ day ${c.touch3_days} →`, cls: "wf-chip is-wait" }, { t: name(c.touch3) || "Polite close", cls: "wf-chip" });
  return out;
}

export function PathList({ campaigns, templates, onChanged }: { campaigns: WaCampaign[]; templates: WaTemplate[]; onChanged?: () => void }): ReactElement {
  const navigate = useNavigate();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [sideOpen, setSideOpen] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  // Each path campaign's path, for the chips: from the list when it sends it, else one GET each.
  const [paths, setPaths] = useState<Record<number, WaPath>>({});
  const need = useMemo(() => campaigns.filter((c) => isPath(c) && c.id && !c.path).map((c) => c.id as number).slice(0, 30), [campaigns]);
  useEffect(() => {
    let alive = true;
    need.forEach((id) => {
      getWaPath(id).then((r) => { if (alive) setPaths((p) => ({ ...p, [id]: normalisePath(r.path) })); }).catch(() => undefined);
    });
    return () => { alive = false; };
  }, [need]);
  const pathOf = (c: WaCampaign): WaPath | null => (c.path ? normalisePath(c.path) : paths[c.id as number] ?? null);

  const open = (c: WaCampaign) => navigate(`/marketing/whatsapp/campaigns/${c.id}`);
  const needle = q.trim().toLowerCase();
  const shown = campaigns.filter((c) => !needle || `${c.name} ${c.audience_name ?? ""}`.toLowerCase().includes(needle));
  const all = campaigns.map(numbersOfCampaign);
  const sentAll = all.reduce((a, n) => a + n.sent, 0);
  const repAll = all.reduce((a, n) => a + n.replies, 0);
  const rateAll = sentAll ? Math.round((repAll / sentAll) * 100) : 0;
  const live = campaigns.filter((c) => statusOf(c) === "live").length;

  const duplicate = async (c: WaCampaign) => {
    const p = pathOf(c);
    if (!p) return;
    setBusy(c.id as number);
    try {
      const copy: WaCampaign = { ...c, id: undefined, name: `${c.name} (copy)`.slice(0, 120), status: "draft", stats: undefined, path: undefined, path_summary: undefined };
      const made = await createWaPathCampaign(copy, "blank");
      await putWaPath(made.id as number, p);
      toast("Duplicated as a draft. The copy has the same steps and no people yet.");
      if (onChanged) onChanged();
      else window.location.assign(`/marketing/whatsapp/campaigns/${made.id}`);
    } catch (err) {
      toast(errText(err, "Couldn't duplicate it."), "bad");
    }
    setBusy(null);
  };

  const sideItem = (c: WaCampaign) => {
    const st = statusOf(c);
    const n = numbersOfCampaign(c);
    const p = pathOf(c);
    const steps = c.path_summary?.steps ?? (p ? stepCount(p) : 0);
    const days = c.path_summary?.days ?? (p ? pathDays(p) : 0);
    const sub = !isPath(c) ? `Three touches · ${n.contacts} people`
      : st === "live" ? (c.day && days ? `Day ${c.day} of ${days} · ${n.contacts} people` : `${n.contacts} people · ${steps} steps`)
        : st === "draft" ? `Not started · ${steps} steps`
          : st === "paused" ? `Paused${c.day ? ` on day ${c.day}` : ""} · ${n.contacts} people` : `${n.contacts} people · ${n.paid} paid`;
    return (
      <button key={c.id} type="button" className="wt-item" aria-pressed="false" onClick={() => { setSideOpen(false); open(c); }}>
        <span className="wt-dot" style={{ background: DOT[st] }} />
        <span className="wt-item__t"><b>{c.name}</b><small>{sub}</small></span>
        <span className={`wt-pct ${band(n.rate, n.sent)}`} title={n.sent ? `${n.rate} % of ${n.sent} sent got a reply` : "Nothing sent yet"}>{n.sent ? `${n.rate} %` : "—"}</span>
      </button>
    );
  };

  const card = (c: WaCampaign) => {
    const st = statusOf(c);
    const n = numbersOfCampaign(c);
    const p = pathOf(c);
    const path = isPath(c);
    const days = c.path_summary?.days ?? (p ? pathDays(p) : 0);
    const dr = p ? draftSteps(p, templates) : 0;
    const mini = path ? (p ? miniOf(p, templates) : []) : slotsMini(c, templates);
    const pctDone = (st === "live" || st === "paused") && c.day && days ? Math.min(100, Math.round((c.day / days) * 100)) : st === "ended" ? 100 : 0;
    const progL = !path ? "Older plan: a first message and up to three touches. It moves to a path when it is converted."
      : st === "live" ? (c.day && days ? `Day ${c.day} of ${days}` : `Live${days ? ` · the path runs ${days} days` : ""}`)
        : st === "draft" ? `Not started${dr ? ` · ${dr} draft ${dr === 1 ? "template" : "templates"} to write first` : ""}`
          : st === "paused" ? (c.day && days ? `Paused on day ${c.day} of ${days}` : "Paused: nobody gets a message")
            : "Ended";
    const next = st === "live" ? "Due sends are in Today" : st === "draft" ? "Not live yet" : st === "paused" ? "Nobody gets a message" : "Numbers kept in Analytics";
    return (
      <article key={c.id} className="wf-card" aria-label={c.name}>
        <div className="wf-cardh">
          <div><b>{c.name}</b><small>{c.audience_name || "Contacts you add to it"}</small></div>
          <span className={`wf-st is-${st}`}><i />{STATUS_LABEL[st]}</span>
        </div>
        <div className="wf-mini" aria-label="The path">
          {mini.length ? mini.map((m, i) => <span key={i} className={m.cls}>{m.t}</span>) : <span className="wf-chip is-more">{path && !p ? "Loading the path…" : "No steps yet"}</span>}
          {!path ? <span className="wt-pill">Three touches</span> : null}
        </div>
        <div className="wf-kpis">
          {([[n.contacts || "—", "people"], [n.sent ? `${n.rate} %` : "—", "replied"], [n.yes || "—", "said YES"], [n.paid || "—", "paid"]] as [string | number, string][]).map(([v, l]) => (
            <div key={l} className="wf-kpi"><b>{v}</b><span>{l}</span></div>
          ))}
        </div>
        <div className="wf-prog"><span>{progL}</span>{path ? <div className="wt-bar"><i className={st === "paused" ? "is-mid" : undefined} style={{ width: `${pctDone}%` }} /></div> : null}</div>
        <div className="wf-cardf">
          <button type="button" className="wt-btn is-dark" onClick={() => open(c)}>{!path ? "Open" : st === "draft" ? "Continue building" : "Open the path"}</button>
          {path ? <button type="button" className="wt-btn" disabled={!p || busy === c.id} onClick={() => void duplicate(c)}>Duplicate</button> : null}
          <span className="wt-when">{next}</span>
        </div>
      </article>
    );
  };

  const groups = GROUPS.map(([k, head]) => ({ k, head, items: shown.filter((c) => statusOf(c) === k) })).filter((g) => g.items.length);
  const title = needle ? `Campaigns matching “${q.trim()}”` : "All campaigns";
  return (
    <div className="wt-wrap wf-camps">
      <div className="wt-in">
        <aside className={"wt-side" + (sideOpen ? " is-open" : "")} aria-label="Campaigns">
          <button type="button" className="wt-sidetoggle" aria-expanded={sideOpen} onClick={() => setSideOpen((o) => !o)}>
            <span>{title}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d={sideOpen ? "m6 15 6-6 6 6" : "m6 9 6 6 6-6"} /></svg>
          </button>
          <div className="wt-sidebody">
            <button type="button" className="wt-new" onClick={() => navigate("/marketing/whatsapp/campaigns/new")}><Svg d="M12 5v14M5 12h14" />New campaign</button>
            <label className="wt-search">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search campaigns" aria-label="Search campaigns" />
            </label>
            <div className="wt-sec">
              <button type="button" className="wt-item" aria-pressed={!needle} onClick={() => { setQ(""); setSideOpen(false); }}>
                <span className="wt-item__t"><b>All campaigns</b><small>{campaigns.length} campaigns · {live} live</small></span>
                <span className={`wt-pct ${band(rateAll, sentAll)}`} title="Replies ÷ sent, all campaigns">{sentAll ? `${rateAll} %` : "—"}</span>
              </button>
            </div>
            {groups.map((g) => (
              <div key={g.k} className="wt-sec">
                <div className="wt-sech"><span>{g.head}</span></div>
                {g.items.map(sideItem)}
              </div>
            ))}
          </div>
        </aside>
        <section className="wt-main" aria-label={title}>
          <div className="wt-head"><div><h2>{title}</h2><p>Open a campaign to see its path. Every step is a template or a wait; you set how long each wait is.</p></div></div>
          <div className="wt-stats">
            <span><b>{all.reduce((a, n) => a + n.contacts, 0)}</b> contacts in campaigns</span><span>·</span>
            <span><b>{live}</b> live</span><span>·</span>
            <span><b>{all.reduce((a, n) => a + n.yes, 0)}</b> said YES</span><span>·</span>
            <span><b>{all.reduce((a, n) => a + n.paid, 0)}</b> paid</span><span>·</span>
            <span>replies <b>{sentAll ? `${rateAll} %` : "—"}</b></span>
          </div>
          {shown.length ? <div className="wf-cards">{shown.map(card)}</div> : (
            <div className="wt-empty">
              {needle ? "No campaign matches that search." : (
                <div className="wf-first">
                  <b>Start your first WhatsApp campaign</b>
                  <span>Build its path step by step, or start from a ready one. Nothing is sent until you send each message yourself from Today.</span>
                  <button type="button" className="wt-btn is-dark" onClick={() => navigate("/marketing/whatsapp/campaigns/new")}>New campaign</button>
                </div>
              )}
            </div>
          )}
          <p className="wt-foot">Replies = replies ÷ messages sent, from day 1 of each campaign. A YES moves the contact to the YES path; STOP, band karo or mat bhejo ends every campaign for that number.</p>
        </section>
      </div>
    </div>
  );
}
