/**
 * Contacts → one contact (owner's board, 12 Nov 2026): a panel on the right with the facts, what needs you, the Track,
 * their path (done, now, next), the conversation, Send a message now, and Pause / They said STOP. Every change saves
 * as it is made, through the actions the rest of WhatsApp uses (/act/, /draft/, /sent/, PATCH).
 */
import { useEffect, useState, type ReactElement } from "react";
import { useToast } from "../../../components/Toast";
import {
  actOn, deleteWaContact, draftFor, getWaContact, markSent, patchWaContact, waLink,
  type WaAction, type WaCampaign, type WaMedia, type WaPack, type WaSendKind, type WaTemplate, type WaTrack,
} from "../../../lib/whatsappApi";
import { getWaContactPath, type WaContactC, type WaContactPath, type WaPathRow } from "../../../lib/whatsappApi.contacts";
import type { WaCampaignX } from "../../../lib/whatsappApi.tabs";
import { avatarOf, dayWord, displayName, langOf, needOf, nextOf, phoneText, whenSaid, whereOf } from "./contactsModel";
import { Bubble, CATEGORY_LABEL, errText, KIND_LABEL, LANG_LABEL, suggestTrack, TRACK_LABEL, TRACKED, TRACKS } from "./shared";
import { Attach } from "./TodayTab";

const NEED_BOX: Record<"reply" | "track" | "optin", [string, string]> = {
  track: ["Set the Track", "They said YES. Pick the Track from their answers, then the first Demo video goes."],
  reply: ["A reply to answer", "Sort it and answer it on Today, or send a message below."],
  optin: ["Not opted in", "Ask them on a call or by email first. Mark them opted in only when they agree."],
};

/** A long run of sent messages folds into one line: the first, "N more messages", the last two. Events stay. */
function fold(rows: WaPathRow[]): WaPathRow[] {
  const out: WaPathRow[] = [];
  let run: WaPathRow[] = [];
  const flush = () => {
    if (run.length > 4) {
      const mid = run.slice(1, -2);
      const a = mid.find((r) => r.date)?.date;
      const b = [...mid].reverse().find((r) => r.date)?.date;
      out.push(run[0], { state: "done", label: `${mid.length} more messages`, date: null, note: a && b ? `${dayWord(a)} – ${dayWord(b, false)}` : "", kind: "message" }, ...run.slice(-2));
    } else out.push(...run);
    run = [];
  };
  for (const r of rows) {
    if (r.state === "done" && (r.kind ?? "message") === "message") run.push(r);
    else { flush(); out.push(r); }
  }
  flush();
  return out;
}

function PathList({ path }: { path: WaContactPath }): ReactElement {
  const rows = fold(path.steps);
  return (
    <div className="wcx-path" role="list">
      {rows.map((r, i) => (
        <div key={i} role="listitem" className={"wcx-ps" + (r.state === "done" ? " is-done" : r.state === "now" ? " is-now" : "")}>
          <i aria-hidden="true" />
          <span>{r.label}{r.note && r.date ? <small className="wcx-psn">{r.note}</small> : null}</span>
          <small>{r.date ? (r.state === "done" ? dayWord(r.date) : dayWord(r.date, false) === "today" ? "today" : dayWord(r.date)) : r.note}</small>
        </div>
      ))}
      {path.more ? (
        <div role="listitem" className="wcx-ps">
          <i aria-hidden="true" />
          <span>{path.more.count} more{path.more.last_day ? ` until day ${path.more.last_day}` : ""}</span>
          <small>{path.more.last_date ? dayWord(path.more.last_date) : ""}</small>
        </div>
      ) : null}
    </div>
  );
}

type Pick = "" | "next" | "custom" | `t${number}`;

/** Send a message now: the next step on their path, a quick reply, any template, or your own words. */
function SendNow({ c, templates, onSent }: { c: WaContactC; templates: WaTemplate[]; onSent: (who: string) => void }): ReactElement {
  const toast = useToast();
  const next = nextOf(c);
  const [pick, setPick] = useState<Pick>("");
  const [text, setText] = useState("");
  const [by, setBy] = useState("");
  const [kind, setKind] = useState<WaSendKind>("custom");
  const [tpl, setTpl] = useState<number | null>(null);
  const [media, setMedia] = useState<WaMedia | null>(null);
  const [busy, setBusy] = useState(false);
  const [opened, setOpened] = useState(false);
  const live = templates.filter((t) => !t.archived && !t.version_of);
  const quick = live.filter((t) => t.category === "quick_reply" && !t.draft);
  const cats = [...new Set(live.filter((t) => t.category && t.category !== "quick_reply" && !t.draft).map((t) => t.category))];
  const older = live.filter((t) => !t.category);
  const kinds = [...new Set(older.map((t) => t.kind))];
  const nextReady = next.state === "due" && !!next.send_kind;
  const greeting = `${c.salutation ?? `Hi ${c.greet_as}`}, `;

  const choose = async (v: Pick) => {
    setPick(v);
    setOpened(false);
    setMedia(null);
    if (!v) return;
    if (v === "custom") {
      setText(greeting);
      setBy("Your own words. A one-off: their path doesn’t move.");
      setKind("custom");
      setTpl(null);
      return;
    }
    setBusy(true);
    try {
      if (v === "next") {
        const sk = next.send_kind || "flow";
        const d = await draftFor(c.id, sk);
        setText(d.text);
        setMedia(d.media ?? null);
        setKind(sk);
        setTpl(sk === "flow" ? d.template_id ?? null : null);
        setBy(`${d.by === "claude" ? "Personalised by Claude from" : "From"} ${d.label || d.template}. Sending it moves their path on.`);
      } else {
        const id = Number(v.slice(1));
        const t = live.find((x) => x.id === id);
        const d = await draftFor(c.id, t?.category ? "flow" : t?.kind ?? "first", id);
        setText(d.text);
        setMedia(d.media ?? null);
        const k: WaSendKind = t?.category ? "flow" : t?.kind === "first" && c.step === 0 ? "first" : "custom";
        setKind(k);
        setTpl(t?.category ? id : null);
        setBy(t?.category === "quick_reply" ? "A quick reply never moves their path." : t?.category ? "A campaign template: sending it moves their path." : k === "first" ? "Sending it starts their messages." : "A one-off: their path doesn’t move.");
      }
    } catch (err) {
      toast(errText(err, "Couldn't draft this message."), "bad");
      setPick("");
    }
    setBusy(false);
  };
  const sent = async () => {
    setBusy(true);
    try {
      await markSent(c.id, kind, text, tpl);
      setPick("");
      onSent(`Marked as sent. It shows in Today under Sent.`);
    } catch (err) {
      toast(errText(err, "Couldn't save that."), "bad");
    }
    setBusy(false);
  };
  return (
    <div className="wcx-send">
      <label className="wt-f">Send a message now
        <select value={pick} disabled={busy} onChange={(e) => void choose(e.target.value as Pick)}>
          <option value="">Choose a message</option>
          {nextReady ? <option value="next">The next step on their path · {next.label}</option> : null}
          {quick.length ? (
            <optgroup label="Quick reply">
              {quick.map((t) => <option key={t.id} value={`t${t.id}`}>{t.type_name || t.name}</option>)}
            </optgroup>
          ) : null}
          {cats.map((k) => (
            <optgroup key={k} label={CATEGORY_LABEL[k as keyof typeof CATEGORY_LABEL] ?? k}>
              {live.filter((t) => t.category === k && !t.draft).map((t) => (
                <option key={t.id} value={`t${t.id}`} disabled={TRACKED.includes(t.category ?? "") && !!c.track && t.track !== c.track}>{t.name}</option>
              ))}
            </optgroup>
          ))}
          {kinds.map((k) => (
            <optgroup key={k} label={KIND_LABEL[k]}>
              {older.filter((t) => t.kind === k).map((t) => <option key={t.id} value={`t${t.id}`}>{t.name}</option>)}
            </optgroup>
          ))}
          <option value="custom">Write my own</option>
        </select>
        <small>{busy ? "Drafting…" : pick ? by : "A quick reply never moves their path; the next step does."}</small>
      </label>
      {pick ? (
        <>
          <div className="wa-chat wcx-draft">
            <textarea className="wcx-bub" rows={6} maxLength={2000} aria-label={`Message to ${displayName(c).name}`} value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          {media ? <Attach media={media} /> : null}
          <div className="wcx-acts">
            <a className={"wt-btn" + (opened ? "" : " is-dark")} href={waLink(c.phone, text)} target="_blank" rel="noreferrer" aria-disabled={!text.trim()} onClick={() => setOpened(true)}>Open in WhatsApp</a>
            <button type="button" className={"wt-btn" + (opened ? " is-dark" : "")} disabled={busy || !text.trim()} onClick={() => void sent()}>Mark as sent</button>
          </div>
        </>
      ) : null}
    </div>
  );
}

/** The rarer things: first name, campaign, pack, the 90-day steps staff record, remove. */
function More({ c, campaigns, act, run, onRemoved }: {
  c: WaContactC; campaigns: WaCampaign[]; act: (a: WaAction, done: string, note?: string) => void;
  run: (work: () => Promise<unknown>, done: string) => void; onRemoved: () => void;
}): ReactElement {
  const [first, setFirst] = useState(c.first_name);
  const ninety = c.plan === "ninety" || c.engine === "path";
  return (
    <details className="wcx-more">
      <summary>More for this contact</summary>
      <div className="wcx-morein">
        <label className="wt-f">First name
          <input maxLength={80} value={first} onChange={(e) => setFirst(e.target.value)}
            onBlur={() => { if (first.trim() !== c.first_name) run(() => patchWaContact(c.id, { first_name: first.trim() }), "First name saved."); }} />
          <small>Messages open with {c.salutation ?? `Hi ${c.greet_as}`}. Leave it empty if you don’t know their name.</small>
        </label>
        <label className="wt-f">Campaign
          <select value={c.campaign ?? 0} onChange={(e) => run(() => patchWaContact(c.id, { campaign: Number(e.target.value) || null }), "Campaign changed.")}>
            <option value={0}>No campaign</option>
            {campaigns.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </label>
        {ninety ? (
          <label className="wt-f">Pack for the offer
            <select value={c.pack ?? ""} onChange={(e) => run(() => patchWaContact(c.id, { pack: e.target.value as WaPack }), "Pack saved.")}>
              <option value="">From team size</option>
              <option value="startup">Startup pack</option>
              <option value="team">Team pack</option>
            </select>
          </label>
        ) : null}
        <div className="wcx-acts">
          {c.status !== "interested" && c.status !== "signed" ? <button type="button" className="wt-btn" onClick={() => act("interested", "Marked as YES.")}>They said YES</button> : null}
          {c.status !== "signed" ? <button type="button" className="wt-btn" onClick={() => act("signed", "Marked as signed up.")}>Signed up</button> : null}
          {c.status !== "notnow" ? <button type="button" className="wt-btn" onClick={() => act("notnow", "Saved as not now.")}>Not now</button> : null}
          {ninety ? (
            <>
              {c.setup_error
                ? <button type="button" className="wt-btn" onClick={() => act("setup_ok", "Setup error cleared.")}>Setup error fixed</button>
                : <button type="button" className="wt-btn" onClick={() => act("setup_error", "Saved: the Demo call goes next.")}>Setup hit an error</button>}
              <button type="button" className="wt-btn" disabled={!!c.using_since} onClick={() => act("using", "First PC set up: the testimonial request goes in 14 days.")}>First PC set up</button>
              <button type="button" className="wt-btn" disabled={c.campaign_status === "paid"} onClick={() => act("paid", "Marked as paid.")}>Paid</button>
              <button type="button" className="wt-btn" disabled={c.testimonial === "written" || c.testimonial === "video"} onClick={() => act("review_written", "Written testimonial saved.")}>Got a written testimonial</button>
              <button type="button" className="wt-btn" disabled={c.testimonial === "video"} onClick={() => act("review_video", "Video testimonial saved.")}>Got a video testimonial</button>
            </>
          ) : null}
          <button type="button" className="wt-btn wcx-red" disabled={!!c.last} title={c.last ? "Contacts with messages stay, for the record" : undefined}
            onClick={() => run(async () => { await deleteWaContact(c.id); onRemoved(); }, "Contact removed.")}>Remove contact</button>
        </div>
      </div>
    </details>
  );
}

export function ContactPanel({ id, campaigns, templates, onClose, onChanged }: {
  id: number; campaigns: WaCampaign[]; templates: WaTemplate[]; onClose: () => void; onChanged: () => void;
}): ReactElement {
  const toast = useToast();
  const [c, setC] = useState<WaContactC | null>(null);
  const [path, setPath] = useState<WaContactPath | null>(null);
  const [all, setAll] = useState(false);
  const [optNote, setOptNote] = useState("");
  const [tick, setTick] = useState(0);
  const camps = new Map((campaigns as WaCampaignX[]).filter((x) => x.id).map((x) => [x.id as number, x]));

  useEffect(() => {
    let alive = true;
    getWaContact(id).then((x) => { if (alive) setC(x as WaContactC); }).catch((err) => toast(errText(err, "Couldn't load this contact."), "bad"));
    getWaContactPath(id).then((p) => { if (alive) setPath(p); }).catch(() => { if (alive) setPath(null); });
    return () => { alive = false; };
  }, [id, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setAll(false);
    setOptNote("");
  }, [id]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const refresh = () => { setTick((t) => t + 1); onChanged(); };
  const run = (work: () => Promise<unknown>, done: string) => {
    void work().then(() => { toast(done); refresh(); }).catch((err) => toast(errText(err, "Couldn't save that."), "bad"));
  };
  const act = (a: WaAction, done: string, note = "") => run(() => actOn(id, a, note), done);

  if (!c) {
    return (
      <aside className="wf-drawer wcx-panel" role="dialog" aria-label="Contact">
        <div className="wf-drawin"><div className="wf-dh"><span className="wf-note">Loading…</span><button type="button" className="wf-x" aria-label="Close" onClick={onClose}>×</button></div></div>
      </aside>
    );
  }
  const { name, person } = displayName(c);
  const where = whereOf(c);
  const need = needOf(c);
  const stop = where.key === "stop";
  const locked = !c.opted_in && !stop;
  const camp = c.campaign ? camps.get(c.campaign) : undefined;
  const lang = langOf(c, camps);
  const msgs = c.messages ?? [];
  const shown = all ? msgs : msgs.slice(-6);
  const theirLast = [...msgs].reverse().find((m) => m.kind === "theirs")?.text ?? "";
  const hint = !c.track ? suggestTrack(theirLast) : "";
  const showTrack = where.key === "yes" || where.key === "paid";
  const day = path?.day ?? c.day ?? 0;
  const campLine = camp
    ? `${camp.name}${camp.status === "paused" ? " · paused" : camp.status === "draft" ? " · draft" : day ? ` · day ${day} of 90` : ""}`
    : "None yet";
  const facts: [string, string][] = [
    ["Number", phoneText(c.phone)],
    ["Segment", c.segment || "—"],
    ["Campaign", campLine],
    ["Language", lang ? LANG_LABEL[lang] : "—"],
    ["Opted in", c.opted_in ? c.opt_in_note || "Before opt-in was recorded" : "Not yet"],
    ["How we know", c.how_we_know || c.source || "—"],
  ];
  if (c.paused_until) facts.push(["Paused", `Until ${dayWord(c.paused_until, false)}`]);
  const setTrack = (t: WaTrack) => {
    if (!t) return run(() => patchWaContact(c.id, { track: "" }), "Track cleared.");
    if (!c.track) return act("track", `Track set to ${TRACK_LABEL[t]}. The first Demo video is due on Today.`, t);
    return run(() => patchWaContact(c.id, { track: t }), `Track changed to ${TRACK_LABEL[t]}.`);
  };

  return (
    <aside className="wf-drawer wcx-panel" role="dialog" aria-label={name}>
      <div className="wf-drawin">
        <div className="wf-dh">
          <div className="wcx-dhw">
            <span className="wcx-av" aria-hidden="true">{avatarOf(name)}</span>
            <div>
              <small>{[person ? (c.short_name || c.firm) : "", c.city].filter(Boolean).join(" · ").toUpperCase()}</small>
              <h3>{name}</h3>
            </div>
          </div>
          <button type="button" className="wf-x" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <div className="wf-db">
          {need ? <div className="wf-box is-warn"><b>{NEED_BOX[need][0]}</b>{NEED_BOX[need][1]}</div> : null}
          <div className="wf-tl">
            {facts.map(([k, v]) => <div key={k}><span>{k}</span><span>{v}</span></div>)}
          </div>
          {locked ? (
            <div className="wcx-optin">
              <label className="wt-f">How did they agree?
                <input maxLength={200} value={optNote} placeholder="Example: said yes on the phone, 12 Nov" onChange={(e) => setOptNote(e.target.value)} />
                <small>Nothing is drafted for them until you mark them opted in.</small>
              </label>
              <button type="button" className="wt-btn is-dark" disabled={!optNote.trim()} onClick={() => act("optin", `${name} is opted in. Nothing is sent until a live campaign picks them up.`, optNote.trim())}>Mark as opted in</button>
            </div>
          ) : null}
          {showTrack ? (
            <label className="wt-f">Track
              <select value={c.track} onChange={(e) => setTrack(e.target.value as WaTrack)}>
                <option value="">Not set yet</option>
                {TRACKS.map((t) => <option key={t} value={t}>{TRACK_LABEL[t]}</option>)}
              </select>
              <small>{hint && !c.track ? `Their words point to ${TRACK_LABEL[hint]}. ` : ""}It decides which Demo videos and which offer they get.</small>
            </label>
          ) : null}
          {path ? (
            <div className="wcx-blk">
              <span className="wf-lbl">Their path · {path.campaign_name || "no campaign yet"}</span>
              <PathList path={path} />
            </div>
          ) : null}
          <div className="wcx-blk">
            <span className="wf-lbl">Conversation</span>
            {msgs.length ? (
              <div className="wa-chat wcx-chat">
                {msgs.length > shown.length ? <button type="button" className="wcx-older" onClick={() => setAll(true)}>Show {msgs.length - shown.length} older</button> : null}
                {shown.map((m) => (
                  <Bubble key={m.id} text={m.text} mine={m.kind !== "theirs"} meta={`${whenSaid(m.at)}${m.label ? ` · ${m.label}` : ""}`} />
                ))}
              </div>
            ) : <span className="wcx-note">No messages yet.</span>}
          </div>
          {!stop && !locked ? <SendNow key={`${c.id}-${tick}`} c={c} templates={templates} onSent={(t) => { toast(t); refresh(); }} /> : null}
          {!stop ? <More key={`m${c.id}-${tick}`} c={c} campaigns={campaigns} act={act} run={run} onRemoved={onClose} /> : null}
        </div>
        <div className="wf-df">
          {stop ? <span className="wcx-note">Said STOP. This number is never messaged again, in any campaign.</span> : (
            <>
              {c.paused_until
                ? <button type="button" className="wt-btn" onClick={() => act("resume", `Resumed for ${name}. Their path goes on.`)}>Resume</button>
                : <button type="button" className="wt-btn" disabled={locked} onClick={() => act("pause", `Paused for ${name} for 30 days. Their path waits where it is.`)}>Pause for this contact</button>}
              <button type="button" className="wf-danger" onClick={() => act("stop", `${name} is blocked in every campaign.`)}>They said STOP</button>
              <span className="wf-note">Changes save as you make them.</span>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}

