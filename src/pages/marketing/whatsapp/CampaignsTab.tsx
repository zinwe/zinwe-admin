import { useState, type ReactElement } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { Modal } from "../../../components/Modal";
import { useToast } from "../../../components/Toast";
import type { Audience } from "../../../lib/marketingApi";
import {
  addToWaCampaign, deleteWaCampaign, saveWaCampaign, waCampaignAction,
  type WaCampaign, type WaContact, type WaGoal, type WaKind, type WaStats, type WaTemplate,
} from "../../../lib/whatsappApi";
import { claudeCommand, OUTREACH_SKILL } from "./claudeCommand";
import { Bubble, errText, sampleText } from "./shared";

/** The saved campaign as a prompt for Claude in Chrome: copy it, paste it, and Claude runs today's round. */
function ClaudeCommand({ campaign }: { campaign: WaCampaign }): ReactElement {
  const toast = useToast();
  const [confirmEach, setConfirmEach] = useState(true);
  const text = claudeCommand(campaign, window.location.origin, confirmEach);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast("Command copied. Paste it into Claude in Chrome.");
    } catch {
      toast("Couldn't copy. Select the text and copy it yourself.", "bad");
    }
  };
  return (
    <section className="wa-claude" aria-labelledby="wa-claude-h">
      <div className="fighead">
        <h2 id="wa-claude-h">Launch with Claude in Chrome</h2>
        <button type="button" className="btn dark sm" onClick={() => void copy()}>Copy command</button>
      </div>
      <span className="k">
        Paste it into Claude in Chrome. Claude loads {OUTREACH_SKILL} first (the skill you update every week), works
        through Today in this admin and WhatsApp Web side by side, and marks every send here as it goes. Built from the
        saved campaign: save first after a change.
      </span>
      <label className="wa-check">
        <input type="checkbox" checked={confirmEach} onChange={(e) => setConfirmEach(e.target.checked)} />
        <span><b>Ask me before each send</b> <span className="k">Recommended. Off, Claude sends on its own within the daily limit.</span></span>
      </label>
      <textarea className="inp wa-claude__text" readOnly rows={10} value={text} aria-label="Command for Claude in Chrome" onFocus={(e) => e.currentTarget.select()} />
    </section>
  );
}

const STATUS: Record<string, [string, string]> = { draft: ["Draft", ""], live: ["Live", "good"], paused: ["Paused", "warn"] };
const GOALS: [WaGoal, string][] = [["Conversations", "They reply to you"], ["Free signups", "They create a free account"], ["Installs", "Zinwe runs on one PC"], ["Paid plans", "They upgrade"]];
const STEPS: [keyof WaCampaign & WaKind, string, string][] = [
  ["first", "First message", "Day 0"],
  ["followup", "Free tip if no reply", "After the wait below"],
  ["touch3", "Polite close if still no reply", "The last message, on the day set below"],
  ["touch4", "Extra message", "Leave off for outreach: three messages at most"],
  ["interested", "If they reply YES", "You send it the same day"],
  ["question", "If they ask a question", "You answer, Claude drafts a start"],
  ["notnow", "If they say not now", "Close kindly, never again"],
];

const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : "–");
const LANG_SHORT: Record<string, string> = { en: "English", hi: "Hinglish", ab: "English + Hinglish" };
const codeOf = (name: string) => /^(?:90 days: )?([A-Z]{2}-\d+)\s+(.*)$/.exec(name);

type Filter = "all" | "live" | "draft" | "paused" | "empty";

/** What to do next with a campaign, in one button: the step that unblocks it. */
function NextStep({ c }: { c: WaCampaign }): ReactElement {
  const s = c.stats;
  const to = `/marketing/whatsapp/campaigns/${c.id}`;
  if (!s?.contacts) return <Link className="btn sm dark" to={`${to}#contacts`} onClick={(e) => e.stopPropagation()}>Add contacts</Link>;
  if (!s.opted_in) return <Link className="btn sm" to="/marketing/whatsapp/contacts" onClick={(e) => e.stopPropagation()}>Get opt-ins</Link>;
  if (c.status !== "live") return <Link className="btn sm dark" to={to} onClick={(e) => e.stopPropagation()}>Start</Link>;
  return <Link className="btn sm" to="/marketing/whatsapp" onClick={(e) => e.stopPropagation()}>Open Today</Link>;
}

/** One campaign: what it says, who it reaches, how far it got, and the next step. */
function CampaignRow({ c, templates }: { c: WaCampaign; templates: WaTemplate[] }): ReactElement {
  const navigate = useNavigate();
  const s = c.stats ?? { contacts: 0, messaged: 0, replied: 0, interested: 0, signed: 0, stopped: 0 };
  const m = codeOf(c.name);
  const first = templates.find((t) => t.id === c.first);
  const problem = first?.parts?.problem;
  const status = c.status ?? "draft";
  const steps: [string, number, number][] = [["Messaged", s.messaged, s.contacts], ["Replied", s.replied, s.messaged], ["Interested", s.interested, s.messaged], ["Signed up", s.signed, s.messaged]];
  return (
    <article className={`card wa-crow is-${status}${s.contacts ? "" : " is-empty"}`} onClick={() => navigate(`/marketing/whatsapp/campaigns/${c.id}`)}>
      <div className="wa-crow__main">
        <div className="wa-crow__title">
          <span className={`wa-dot is-${status}`} aria-hidden="true" />
          {m ? <span className="wa-code">{m[1]}</span> : null}
          <Link to={`/marketing/whatsapp/campaigns/${c.id}`} onClick={(e) => e.stopPropagation()}>{m ? m[2] : c.name}</Link>
          <span className={"pill " + STATUS[status][1]}>{STATUS[status][0]}</span>
        </div>
        {problem ? <p className="wa-crow__quote">“{problem}”</p> : null}
        <div className="wa-crow__meta k">
          <span>{LANG_SHORT[c.language ?? "en"]}</span>
          <span>Day 0 · 3 · {c.touch3_days}</span>
          <span>{c.daily_limit} a day</span>
          <span>Goal: {c.goal}</span>
        </div>
      </div>
      <div className="wa-crow__people">
        <b className="num">{s.contacts}</b>
        <span className="k">contacts</span>
        <div className="wa-meter" aria-hidden="true"><i style={{ width: s.contacts ? `${Math.round(((s.opted_in ?? 0) / s.contacts) * 100)}%` : "0%" }} /></div>
        <span className="k">{s.contacts ? `${s.opted_in ?? 0} opted in · ${s.ready ?? 0} ready` : "No contacts yet"}</span>
      </div>
      <ol className="wa-funnel" aria-label="Results">
        {steps.map(([label, n, of]) => (
          <li key={label}><b className="num">{n}</b><span className="k">{label}</span><span className="k wa-funnel__pct">{label === "Messaged" ? pct(n, of) + " of contacts" : pct(n, of)}</span></li>
        ))}
      </ol>
      <div className="wa-crow__act"><NextStep c={c} /></div>
    </article>
  );
}

/**
 * Campaigns at a glance (inspired by outreach tools like lemlist and Instantly, kept simple): a strip of what matters
 * now, filters, then each audience's campaigns as rows that show the message, who it reaches, how far it got, and
 * the one next step.
 */
export function CampaignList({ campaigns, templates }: { campaigns: WaCampaign[]; templates: WaTemplate[] }): ReactElement {
  const [filter, setFilter] = useState<Filter>("all");
  if (!campaigns.length) {
    return (
      <section className="card empty">
        <b>Start your first WhatsApp campaign</b>
        <span>Pick a target audience, a first message and a follow-up. Nothing is sent until you send each message yourself.</span>
        <Link className="btn dark" to="/marketing/whatsapp/campaigns/new">New campaign</Link>
      </section>
    );
  }
  const sum = (k: keyof WaStats) => campaigns.reduce((a, c) => a + ((c.stats?.[k] as number | undefined) ?? 0), 0);
  const live = campaigns.filter((c) => c.status === "live").length;
  const empty = campaigns.filter((c) => !c.stats?.contacts).length;
  const tests: Record<Filter, (c: WaCampaign) => boolean> = {
    all: () => true, live: (c) => c.status === "live", draft: (c) => (c.status ?? "draft") === "draft",
    paused: (c) => c.status === "paused", empty: (c) => !c.stats?.contacts,
  };
  const shown = campaigns.filter(tests[filter]).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const groups = [...new Set(shown.map((c) => c.audience_name || "No target audience"))];
  const contacts = sum("contacts"), optedIn = sum("opted_in"), messaged = sum("messaged"), replied = sum("replied");
  return (
    <>
      <div className="wa-cstrip">
        {([
          [live ? `${live} live` : "None live", `${campaigns.length - live} draft or paused`],
          [`${contacts}`, "contacts in campaigns"],
          [`${optedIn}`, optedIn ? `opted in · ${pct(optedIn, contacts)}` : "opted in: nobody can be messaged yet"],
          [`${messaged}`, `messaged · ${pct(replied, messaged)} replied`],
        ] as [string, string][]).map(([v, l]) => (
          <div key={l} className="card tile"><b className="num">{v}</b><span className="k">{l}</span></div>
        ))}
      </div>
      <div className="fr between wa-cfilter">
        <div className="fr" role="group" aria-label="Show">
          {([["all", "All"], ["live", "Live"], ["draft", "Draft"], ["paused", "Paused"], ["empty", "Needs contacts"]] as [Filter, string][]).map(([k, l]) => (
            <button key={k} type="button" className={"chip" + (filter === k ? " on" : "")} aria-pressed={filter === k} onClick={() => setFilter(k)}>
              {l} <span className="k">{campaigns.filter(tests[k]).length}</span>
            </button>
          ))}
        </div>
        {empty ? <span className="k">{empty} campaign{empty === 1 ? " has" : "s have"} no contacts: open it and use Add contacts, or delete it.</span> : null}
      </div>
      {groups.map((g) => {
        const rows = shown.filter((c) => (c.audience_name || "No target audience") === g);
        const gc = rows.reduce((a, c) => a + (c.stats?.contacts ?? 0), 0);
        return (
          <section key={g} className="wa-cgroup" aria-label={g}>
            <header className="wa-cgroup__head"><h2>{g}</h2><span className="k">{rows.length} campaign{rows.length === 1 ? "" : "s"} · {gc} contacts</span></header>
            {rows.map((c) => <CampaignRow key={c.id} c={c} templates={templates} />)}
          </section>
        );
      })}
      {shown.length ? null : <section className="card empty"><span>No campaigns here.</span></section>}
    </>
  );
}

/** Pick contacts to add to this campaign: unassigned first, or move ones from another campaign that haven't been messaged. */
function ContactPicker({ campaign, contacts, onClose, onAdded }: { campaign: WaCampaign; contacts: WaContact[]; onClose: () => void; onAdded: () => void }): ReactElement {
  const toast = useToast();
  const [from, setFrom] = useState<"free" | "other">("free");
  const [seg, setSeg] = useState("");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const movable = (c: WaContact) => c.step === 0 && !c.yes_date && c.status !== "stop" && c.campaign !== campaign.id;
  const pool = contacts.filter((c) => movable(c) && (from === "free" ? !c.campaign : !!c.campaign));
  const segments = [...new Set(pool.map((c) => c.segment))].sort();
  const needle = q.trim().toLowerCase();
  const rows = pool.filter((c) => (!seg || c.segment === seg) && (!needle || `${c.firm} ${c.phone} ${c.city}`.toLowerCase().includes(needle)));
  const all = rows.length > 0 && rows.every((c) => picked.has(c.id));
  const toggle = (id: number) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const add = async () => {
    setBusy(true);
    try {
      const r = await addToWaCampaign(campaign.id as number, [...picked]);
      toast(`${r.added} contact${r.added === 1 ? "" : "s"} added${r.skipped ? `, ${r.skipped} skipped (already messaged or stopped)` : ""}. Nothing was sent.`);
      onAdded();
      onClose();
    } catch (err) {
      toast(errText(err, "Couldn't add them."), "bad");
      setBusy(false);
    }
  };
  return (
    <Modal title={`Add contacts to ${campaign.name}`} subtitle="Only contacts who haven’t had a message yet can join. Nothing is sent now." onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="button" className="btn dark" disabled={busy || !picked.size} onClick={() => void add()}>{picked.size ? `Add ${picked.size} contact${picked.size === 1 ? "" : "s"}` : "Pick contacts"}</button></>}>
      <div className="mk wa-picker">
        <div className="seg" role="tablist" aria-label="From">
          <button type="button" role="tab" aria-selected={from === "free"} className={from === "free" ? "on" : ""} onClick={() => { setFrom("free"); setPicked(new Set()); }}>Not in a campaign <span className="k">{contacts.filter((c) => movable(c) && !c.campaign).length}</span></button>
          <button type="button" role="tab" aria-selected={from === "other"} className={from === "other" ? "on" : ""} onClick={() => { setFrom("other"); setPicked(new Set()); }}>From other campaigns <span className="k">{contacts.filter((c) => movable(c) && !!c.campaign).length}</span></button>
        </div>
        <div className="fr">
          <select className={"inp" + (seg ? " set" : "")} aria-label="Segment" value={seg} onChange={(e) => setSeg(e.target.value)}>
            <option value="">All segments</option>
            {segments.map((x) => <option key={x}>{x}</option>)}
          </select>
          <input type="search" className="inp" aria-label="Search" placeholder="Search business, phone or city" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="scroll wa-picker__list">
          <table className="tbl">
            <thead><tr>
              <th scope="col"><input type="checkbox" aria-label="Pick all shown" checked={all} onChange={() => setPicked((p) => { const n = new Set(p); rows.forEach((c) => (all ? n.delete(c.id) : n.add(c.id))); return n; })} /></th>
              <th scope="col">Business</th><th scope="col">Segment</th><th scope="col">{from === "free" ? "City" : "Now in"}</th><th scope="col">Opt-in</th>
            </tr></thead>
            <tbody>
              {rows.slice(0, 300).map((c) => (
                <tr key={c.id} className="click" onClick={() => toggle(c.id)}>
                  <td><input type="checkbox" aria-label={`Pick ${c.firm}`} checked={picked.has(c.id)} onChange={() => toggle(c.id)} onClick={(e) => e.stopPropagation()} /></td>
                  <th scope="row">{c.short_name || c.firm}<span className="k" style={{ display: "block" }}>{c.phone}</span></th>
                  <td>{c.segment}</td>
                  <td className="k">{from === "free" ? c.city : c.campaign_name}</td>
                  <td>{c.opted_in ? <span className="pill good">Opted in</span> : <span className="pill">Not yet</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length ? null : <div className="empty">{pool.length ? "No contacts match." : from === "free" ? "Every contact is in a campaign. Try From other campaigns." : "No contacts to move."}</div>}
        </div>
        <span className="k">{rows.length > 300 ? `Showing 300 of ${rows.length}: search or pick a segment to narrow it. ` : ""}Contacts already messaged stay in their campaign, so nobody gets two first messages.</span>
      </div>
    </Modal>
  );
}

/** The campaign's contacts: how many, opted in, ready, and the way to add more by hand. */
function CampaignContacts({ campaign, contacts, onChanged }: { campaign: WaCampaign; contacts: WaContact[]; onChanged: () => void }): ReactElement {
  const [picking, setPicking] = useState(false);
  const mine = contacts.filter((x) => x.campaign === campaign.id);
  const opted = mine.filter((x) => x.opted_in && x.status !== "stop").length;
  const ready = mine.filter((x) => x.opted_in && x.step === 0 && x.status === "ready").length;
  return (
    <section className="card afsec" id="contacts">
      <div className="fighead"><h2>Contacts</h2><button type="button" className="btn dark sm" onClick={() => setPicking(true)}>Add contacts</button></div>
      {mine.length ? (
        <div className="wa-cstats">
          <span><b className="num">{mine.length}</b> <span className="k">in this campaign</span></span>
          <span><b className="num">{opted}</b> <span className="k">opted in</span></span>
          <span><b className="num">{ready}</b> <span className="k">ready for a first message</span></span>
        </div>
      ) : <span className="k">No contacts yet. Add them here, or from Contacts (Add contacts, then pick this campaign).</span>}
      {mine.length && !opted ? <span className="k">Nobody here is opted in yet, so nothing will be queued. Mark contacts opted in from Contacts as they agree.</span> : null}
      {picking ? <ContactPicker campaign={campaign} contacts={contacts} onClose={() => setPicking(false)} onAdded={onChanged} /> : null}
    </section>
  );
}

const blank = (templates: WaTemplate[]): WaCampaign => {
  const pick = (k: WaKind) => templates.find((t) => t.kind === k)?.id ?? null;
  return { name: "", audience: null, goal: "Conversations", daily_limit: 15, followup_days: 3, first: pick("first"), followup: pick("followup"), interested: pick("interested"), question: pick("question"), notnow: pick("notnow"), touch3: pick("touch3"), touch4: null, touch3_days: 7, touch4_days: 60 };
};

/** New campaign and campaign settings: name and goal, target audience, the message sequence, the daily limit. */
export function CampaignEditor({ campaign, templates, audiences, contacts, onSaved }: {
  campaign: WaCampaign | null;
  templates: WaTemplate[];
  audiences: Audience[];
  contacts: WaContact[];
  onSaved: () => void;
}): ReactElement {
  const toast = useToast();
  const navigate = useNavigate();
  const [c, setC] = useState<WaCampaign>(campaign ?? blank(templates));
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<"" | "start" | "pause" | "delete">("");
  const set = (patch: Partial<WaCampaign>) => setC((x) => ({ ...x, ...patch }));
  const first = templates.find((t) => t.id === c.first);
  const sample = contacts.find((x) => x.campaign === c.id) ?? contacts[0];
  const preview = first ? sampleText(first.text, sample?.firm || "Gupta Exim", sample?.first_name || "Rakesh") : "";
  const mine = contacts.filter((x) => x.campaign === c.id && c.id);
  const save = async () => {
    setBusy(true);
    try {
      const saved = await saveWaCampaign(c);
      toast(campaign ? "Campaign saved." : "Draft campaign added. Nothing has been sent.");
      onSaved();
      if (!campaign) navigate(`/marketing/whatsapp/campaigns/${saved.id}`);
      else setC(saved);
    } catch (err) {
      toast(errText(err, "Couldn't save the campaign."), "bad");
    }
    setBusy(false);
  };
  return (
    <>
      <Link className="lnk afback" to="/marketing/whatsapp/campaigns">Back to campaigns</Link>
      {campaign ? (
        <section className="check">
          <div>
            <h2>{campaign.name} <span className={"pill " + STATUS[campaign.status ?? "draft"][1]}>{STATUS[campaign.status ?? "draft"][0]}</span></h2>
            <span className="k">{campaign.status === "live" ? "Due messages appear in Today, up to the daily limit." : `${mine.length} contacts. Starting sends nothing: it puts the first messages in Today for you to send.`}</span>
          </div>
          <div className="fr">
            {campaign.status === "live"
              ? <button type="button" className="btn sm" onClick={() => setConfirm("pause")}>Pause</button>
              : <button type="button" className="btn sm dark" onClick={() => setConfirm("start")}>Start campaign</button>}
            {campaign.status === "draft" ? <button type="button" className="btn sm danger" onClick={() => setConfirm("delete")}>Delete</button> : null}
          </div>
        </section>
      ) : null}
      {campaign?.stats ? (
        <div className="tiles">
          {([["Contacts", campaign.stats.contacts], ["Messaged", campaign.stats.messaged], ["Replied", campaign.stats.replied], ["Reply rate", `${campaign.stats.messaged ? Math.round((campaign.stats.replied / campaign.stats.messaged) * 100) : 0}%`], ["Interested", campaign.stats.interested], ["Signed up", campaign.stats.signed], ["Asked to stop", campaign.stats.stopped]] as [string, string | number][]).map(([l, v]) => (
            <div key={l} className="card tile"><b className="num">{v}</b><span className="k">{l}</span></div>
          ))}
        </div>
      ) : null}
      <div className="afgrid">
        <form className="afmain" noValidate onSubmit={(e) => e.preventDefault()}>
          <section className="card afsec">
            <h2>Name and goal</h2>
            <label className="fl">Campaign name<input className="inp" maxLength={120} value={c.name} placeholder="Example: Noida exporters, customer list check" onChange={(e) => set({ name: e.target.value })} /></label>
            <div className="wa-goals" role="radiogroup" aria-label="Goal">
              {GOALS.map(([g, help]) => <button key={g} type="button" role="radio" aria-checked={c.goal === g} className="patc" onClick={() => set({ goal: g })}><b>{g}</b><span>{help}</span></button>)}
            </div>
          </section>
          <section className="card afsec">
            <h2>Target audience</h2>
            <label className="fl">From Persona
              <select className="inp" value={c.audience ?? 0} onChange={(e) => set({ audience: Number(e.target.value) || null })}>
                <option value={0}>No target audience</option>
                {audiences.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
          </section>
          {campaign?.id ? <CampaignContacts campaign={campaign} contacts={contacts} onChanged={onSaved} /> : null}
          <section className="card afsec">
            <h2>Messages and sequence</h2>
            <label className="fl">Plan <span className="k">90 days: the Outreach templates by day (Templates → 90-day campaign), then Engage, the Track’s Demo videos, Setup, Offer and Testimonial</span>
              <select className="inp" value={c.plan ?? "touches"} onChange={(e) => set({ plan: e.target.value as WaCampaign["plan"] })}>
                <option value="touches">First message and up to three touches</option>
                <option value="ninety">90-day campaign (100 Reviews)</option>
              </select>
            </label>
            <label className="fl">Language <span className="k">Pick the English templates below; Hinglish and 50/50 send each one’s Hinglish version where it has one</span>
              <select className="inp" value={c.language ?? "en"} onChange={(e) => set({ language: e.target.value as WaCampaign["language"] })}>
                <option value="en">English</option>
                <option value="hi">Hinglish</option>
                <option value="ab">Half English, half Hinglish (compare in Analytics)</option>
              </select>
            </label>
            {STEPS.map(([key, label, help]) => (
              <label key={key} className="fl">{label} <span className="k">{help}</span>
                <select className="inp" value={(c[key] as number | null) ?? 0} onChange={(e) => set({ [key]: Number(e.target.value) || null } as Partial<WaCampaign>)}>
                  {key === "first" ? null : <option value={0}>{key === "followup" ? "No follow-up" : key === "touch3" || key === "touch4" ? "None" : "Use any template of this kind"}</option>}
                  {templates.filter((t) => t.kind === key && t.language !== "hi" && !t.archived && (!t.category || (key === "first" && t.category === "outreach"))).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
            ))}
            <span className="k">Opted-in numbers only. Someone who never replies gets three messages at most: the first, a tip and a polite close. After a YES, the After YES templates take over (Templates). Claude personalises each message from the contact's Useful Info when the key is set.</span>
          </section>
          <section className="card afsec">
            <h2>Pace</h2>
            <div className="fr">
              <label className="fl">New messages a day<input className="inp" type="number" min={1} max={50} value={c.daily_limit} onChange={(e) => set({ daily_limit: Number(e.target.value) })} /></label>
              <label className="fl">Days before the follow-up<input className="inp" type="number" min={1} max={14} value={c.followup_days} onChange={(e) => set({ followup_days: Number(e.target.value) })} /></label>
              <label className="fl">Polite close on day<input className="inp" type="number" min={2} max={89} value={c.touch3_days} onChange={(e) => set({ touch3_days: Number(e.target.value) })} /></label>
              <label className="fl">Extra message on day<input className="inp" type="number" min={3} max={90} value={c.touch4_days} onChange={(e) => set({ touch4_days: Number(e.target.value) })} /></label>
            </div>
            <span className="k">Replies to people who wrote back don't count towards the limit.</span>
          </section>
          <div className="card affoot">
            <Link className="btn" to="/marketing/whatsapp/campaigns">Cancel</Link>
            <button type="button" className="btn dark" disabled={busy || !c.name.trim() || !c.first} onClick={() => void save()}>{campaign ? "Save campaign" : "Create draft campaign"}</button>
          </div>
        </form>
        <aside className="card afrail" aria-label="Preview">
          {campaign?.id ? <ClaudeCommand campaign={campaign} /> : null}
          <h2>Preview on WhatsApp</h2>
          <div className="wa-chat">{preview ? <Bubble text={preview} meta="10:24" /> : <span className="k">Pick a first message.</span>}</div>
          <span className="k">{sample ? `Sample: ${sample.firm}` : "Sample: Rakesh, Gupta Exim"}</span>
        </aside>
      </div>
      {confirm && campaign?.id ? (
        <ConfirmDialog
          title={confirm === "start" ? "Start this campaign?" : confirm === "pause" ? "Pause this campaign?" : "Delete this draft?"}
          confirmLabel={confirm === "start" ? "Start campaign" : confirm === "pause" ? "Pause" : "Delete"}
          danger={confirm === "delete"}
          onClose={() => setConfirm("")}
          onConfirm={async () => {
            const id = campaign.id as number;
            if (confirm === "delete") { await deleteWaCampaign(id); onSaved(); navigate("/marketing/whatsapp/campaigns"); return; }
            const next = await waCampaignAction(id, confirm);
            setC(next);
            onSaved();
            toast(confirm === "start" ? "Started. Due messages are in Today." : "Paused. Nothing new appears in Today.");
          }}
        >
          {confirm === "start" ? "Nothing is sent automatically. Each day's first messages appear in Today for you to send yourself." : confirm === "pause" ? "Replies still appear in Today. No new first messages or follow-ups will." : "The campaign is removed. Its contacts stay in Contacts."}
        </ConfirmDialog>
      ) : null}
    </>
  );
}
