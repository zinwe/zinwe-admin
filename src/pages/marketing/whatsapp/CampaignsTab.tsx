import { useState, type ReactElement } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { useToast } from "../../../components/Toast";
import type { Audience } from "../../../lib/marketingApi";
import {
  deleteWaCampaign, saveWaCampaign, waCampaignAction,
  type WaCampaign, type WaContact, type WaGoal, type WaKind, type WaTemplate,
} from "../../../lib/whatsappApi";
import { Bubble, errText } from "./shared";

const STATUS: Record<string, [string, string]> = { draft: ["Draft", ""], live: ["Live", "good"], paused: ["Paused", "warn"] };
const GOALS: [WaGoal, string][] = [["Conversations", "They reply to you"], ["Free signups", "They create a free account"], ["Installs", "Zinwe runs on one PC"], ["Paid plans", "They upgrade"]];
const STEPS: [keyof WaCampaign & WaKind, string, string][] = [
  ["first", "First message", "Day 0"],
  ["followup", "Follow-up if no reply", "After the wait below"],
  ["interested", "If they reply YES", "You send it the same day"],
  ["question", "If they ask a question", "You answer, Claude drafts a start"],
  ["notnow", "If they say not now", "Close kindly, never again"],
];

export function CampaignList({ campaigns }: { campaigns: WaCampaign[] }): ReactElement {
  const navigate = useNavigate();
  if (!campaigns.length) {
    return (
      <section className="card empty">
        <b>Start your first WhatsApp campaign</b>
        <span>Pick a target audience, a first message and a follow-up. Nothing is sent until you send each message yourself.</span>
        <Link className="btn dark" to="/marketing/whatsapp/campaigns/new">New campaign</Link>
      </section>
    );
  }
  return (
    <section className="card tablebox">
      <div className="scroll">
        <table className="tbl">
          <caption className="sr">WhatsApp campaigns</caption>
          <thead><tr><th scope="col">Campaign</th><th scope="col">Status</th><th scope="col">Goal</th><th scope="col" className="num">Contacts</th><th scope="col" className="num">Messaged</th><th scope="col" className="num">Replied</th><th scope="col" className="num">Interested</th><th scope="col" className="num">Signed up</th></tr></thead>
          <tbody>
            {campaigns.map((c) => {
              const s = c.stats;
              return (
                <tr key={c.id} className="click" onClick={() => navigate(`/marketing/whatsapp/campaigns/${c.id}`)}>
                  <th scope="row"><Link className="cobtn" to={`/marketing/whatsapp/campaigns/${c.id}`} onClick={(e) => e.stopPropagation()}>{c.name}</Link><span className="k" style={{ display: "block" }}>{c.audience_name || "No target audience"}</span></th>
                  <td><span className={"pill " + STATUS[c.status ?? "draft"][1]}>{STATUS[c.status ?? "draft"][0]}</span></td>
                  <td>{c.goal}</td>
                  <td className="num">{s?.contacts ?? 0}</td>
                  <td className="num">{s?.messaged ?? 0}</td>
                  <td className="num">{s?.replied ?? 0}</td>
                  <td className="num">{s?.interested ?? 0}</td>
                  <td className="num">{s?.signed ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const blank = (templates: WaTemplate[]): WaCampaign => {
  const pick = (k: WaKind) => templates.find((t) => t.kind === k)?.id ?? null;
  return { name: "", audience: null, goal: "Conversations", daily_limit: 15, followup_days: 3, first: pick("first"), followup: pick("followup"), interested: pick("interested"), question: pick("question"), notnow: pick("notnow") };
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
  const preview = first ? first.text.replace(/\{\{FirstName\}\}/g, sample?.first_name || "Rakesh").replace(/\{\{Firm\}\}/g, sample?.firm || "Gupta Exim") : "";
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
            <span className="k">Add contacts to this campaign in Contacts, by upload or one by one.</span>
          </section>
          <section className="card afsec">
            <h2>Messages and sequence</h2>
            {STEPS.map(([key, label, help]) => (
              <label key={key} className="fl">{label} <span className="k">{help}</span>
                <select className="inp" value={(c[key] as number | null) ?? 0} onChange={(e) => set({ [key]: Number(e.target.value) || null } as Partial<WaCampaign>)}>
                  {key === "first" ? null : <option value={0}>{key === "followup" ? "No follow-up" : "Use any template of this kind"}</option>}
                  {templates.filter((t) => t.kind === key).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
            ))}
            <span className="k">At most one follow-up. Claude personalises each message from the contact's Useful Info when the key is set.</span>
          </section>
          <section className="card afsec">
            <h2>Pace</h2>
            <div className="fr">
              <label className="fl">New messages a day<input className="inp" type="number" min={1} max={50} value={c.daily_limit} onChange={(e) => set({ daily_limit: Number(e.target.value) })} /></label>
              <label className="fl">Days before the follow-up<input className="inp" type="number" min={1} max={14} value={c.followup_days} onChange={(e) => set({ followup_days: Number(e.target.value) })} /></label>
            </div>
            <span className="k">Replies to people who wrote back don't count towards the limit.</span>
          </section>
          <div className="card affoot">
            <Link className="btn" to="/marketing/whatsapp/campaigns">Cancel</Link>
            <button type="button" className="btn dark" disabled={busy || !c.name.trim() || !c.first} onClick={() => void save()}>{campaign ? "Save campaign" : "Create draft campaign"}</button>
          </div>
        </form>
        <aside className="card afrail" aria-label="Preview">
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
