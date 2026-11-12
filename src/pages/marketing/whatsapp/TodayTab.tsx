/**
 * Marketing -> WhatsApp -> Today (wa4, 12 Nov 2026), as on the approved board (wa-proposals/today): a menu on the left
 * (Replies to answer first, then NOW · the current slot, LATER TODAY by slot, DONE), the page on the right, and one
 * WhatsApp card per contact in one column.
 *
 * Replies: Claude reads each reply and suggests what it means (YES, A question, Not now, STOP, or the Track for an
 * answer in the YES path). Staff confirm or change it; one line says what that does to their path. Nothing happens until
 * Mark as sent: then the choice is saved (act), and the answer is recorded (sent). Claude never sends anything: Open in
 * WhatsApp fills the chat, a person presses Send there.
 *
 * Sends: grouped by send slot. After-YES steps go any time, so they lead Due now; Intro messages go in their campaign's
 * slot. An older server without slots puts every send in Due now.
 */
import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  actOn, fetchWaMedia, logReply, markSent, patchWaContact, waLink,
  type WaContact, type WaKind, type WaMedia, type WaMessage, type WaSendKind, type WaTemplate, type WaTrack,
} from "../../../lib/whatsappApi";
import type { WaContactX } from "../../../lib/whatsappApi.tabs";
import {
  draftAnswer, localSlots, SLOT_KEYS, SLOT_LABEL, SORT_LABEL,
  type WaQueueRowX, type WaReplyX, type WaSlot, type WaSort, type WaTodayX,
} from "../../../lib/whatsappApi.today";
import { useToast } from "../../../components/Toast";
import { TrackSetter } from "./CampaignContact";
import {
  CATEGORY_LABEL, Count, errText, initials, KIND_LABEL, mediaWord, MediaView, nameOf, SideItem, sizeText, TRACK_LABEL, WtShell,
} from "./shared";
import "../../../styles/wa-today.css";

/** Clipboards take PNG only, so other pictures are redrawn as PNG first. */
async function asPng(blob: Blob): Promise<Blob> {
  if (blob.type === "image/png") return blob;
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("png"))), "image/png"));
}

/** The template's picture or video: wa.me links carry text only, so staff paste or attach it in the chat. */
export function Attach({ media }: { media: WaMedia }): ReactElement {
  const toast = useToast();
  const word = mediaWord(media.kind);
  const download = async () => {
    try {
      const url = URL.createObjectURL(await fetchWaMedia(media.url));
      const a = document.createElement("a");
      a.href = url;
      a.download = media.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) {
      toast(errText(err, "Couldn't download it."), "bad");
    }
  };
  const copy = async () => {
    try {
      const png = await asPng(await fetchWaMedia(media.url));
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
      toast("Picture copied. Click in the WhatsApp chat and press Ctrl+V.");
    } catch {
      toast("Your browser blocked the copy. Use Download instead.", "bad");
    }
  };
  return (
    <div className="wa-attach">
      <MediaView media={media} />
      <div>
        <b>Send this {word} too</b>
        <span className="k">WhatsApp links carry text only. After Open in WhatsApp, {media.kind === "image" ? "copy the picture and paste it into the chat" : "download the video and attach it in the chat"}, then press Send. {media.name} · {sizeText(media.size)}</span>
        <div className="fr">
          {media.kind === "image" ? <button type="button" className="btn sm" onClick={() => void copy()}>Copy picture</button> : null}
          <button type="button" className="btn sm" onClick={() => void download()}>Download {word}</button>
        </div>
      </div>
    </div>
  );
}

/** Which after-YES sequence they get (older three-touch campaigns): picked from what they said matters most. */
function TrackPicker({ c, onDone }: { c: WaContact; onDone: () => void }): ReactElement {
  const toast = useToast();
  const pick = async (track: WaTrack) => {
    try {
      await patchWaContact(c.id, { track });
      toast(track ? `${TRACK_LABEL[track]} sequence chosen.` : "Only the messages every YES gets.");
      onDone();
    } catch (err) {
      toast(errText(err, "Couldn't save that."), "bad");
    }
  };
  return (
    <label className="wtd-from">After-YES sequence
      <select value={c.track} aria-label="After-YES sequence" onChange={(e) => void pick(e.target.value as WaTrack)}>
        {(Object.keys(TRACK_LABEL) as WaTrack[]).map((t) => <option key={t} value={t}>{t ? TRACK_LABEL[t] : "Not chosen yet"}</option>)}
      </select>
    </label>
  );
}

// --- Small helpers -------------------------------------------------------------------------------------------------

const isToday = (iso: string | undefined | null): boolean => {
  if (!iso) return false;
  const d = new Date(iso);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
};
const hhmm = (iso: string): string => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
/** "09:06" today, "Wed 10:21" before. */
const stamp = (iso: string): string =>
  isToday(iso) ? hhmm(iso) : `${new Date(iso).toLocaleDateString("en-GB", { weekday: "short" })} ${hhmm(iso)}`;
const ago = (iso: string | undefined): string => {
  if (!iso) return "";
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  return mins < 60 ? `${mins} min` : mins < 1440 ? `${Math.floor(mins / 60)} h${mins % 60 ? ` ${mins % 60} min` : ""}` : `${Math.floor(mins / 1440)} d`;
};
const firstSentence = (s: string): string => (s.split(/(?<=\.)\s/)[0] ?? s);
const tplLabel = (t: WaTemplate | undefined): string =>
  !t ? "" : t.category ? [CATEGORY_LABEL[t.category as keyof typeof CATEGORY_LABEL], t.type_name || t.name].filter(Boolean).join(" · ") : t.name;
const sendable = (t: WaTemplate): boolean => !t.archived && !t.draft && !t.version_of;

/** Who the card is for, the facts after the name, and the step it is about. */
function Head({ c, step, tip }: { c: WaContactX; step: string; tip?: string }): ReactElement {
  const name = nameOf(c);
  const sub = [c.firm !== name ? c.firm : "", c.city, c.segment, c.campaign_name].filter(Boolean).join(" · ");
  return (
    <header className="wc-top">
      <span className="wc-av" aria-hidden="true">{initials(name)}</span>
      <div className="wc-tt"><b>{name}</b><span>{sub}</span></div>
      {step ? <span className="wtd-step" title={tip}><i aria-hidden="true" /><span>{step}</span></span> : null}
    </header>
  );
}
const trackTip = (c: WaContactX): string => [c.track ? `Track: ${TRACK_LABEL[c.track]}` : c.yes_date ? "Track: Unassigned" : "", c.campaign_name].filter(Boolean).join(" · ");

type Picked = { kind: WaKind | "flow"; template: number | null; track?: WaTrack };
type Option = { value: string; label: string };

/**
 * The answer or message: the draft (Claude's or the template's) in a box you can edit, the template it came from and
 * its language. `onText` hands the text and the template actually used to the card's buttons.
 */
function Answer({ c, picked, title, options, value, onPick, onText }: {
  c: WaContact; picked: Picked; title: (by: "claude" | "template", label: string) => string; options: Option[]; value: string;
  onPick?: (value: string) => void; onText: (text: string, template: number | null) => void;
}): ReactElement {
  const toast = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(true);
  const [by, setBy] = useState<"claude" | "template">("template");
  const [label, setLabel] = useState("");
  const [lang, setLang] = useState("");
  const [media, setMedia] = useState<WaMedia | null>(null);
  const [notes, setNotes] = useState("");
  const [tick, setTick] = useState(0);
  // The campaign template it came from (category rows), as the older Today passed it on Mark as sent.
  const [used, setUsed] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    setBusy(true);
    draftAnswer(c.id, picked.kind, picked.template, picked.track)
      .then((d) => {
        if (!alive) return;
        setText(d.text); setBy(d.by); setLabel(d.label || d.template); setLang(d.language === "hi" ? "Hinglish" : d.language === "en" ? "English" : "");
        setMedia(d.media ?? null); setNotes(d.notes ?? "");
        const tid = d.label ? d.template_id ?? null : null;
        setUsed(tid);
        onText(d.text, tid);
      })
      .catch((err) => { if (alive) { setText(""); onText("", null); toast(errText(err, "Couldn't draft this message."), "bad"); } })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [c.id, picked.kind, picked.template, picked.track, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const id = `wtd-ta-${c.id}`;
  return (
    <div className="wtd-ans">
      <label className="wtd-from" htmlFor={id}><span>{busy && !text ? "Drafting…" : title(by, label)}</span></label>
      <textarea id={id} value={text} placeholder={busy ? "Drafting…" : "Write the message"} onChange={(e) => { setText(e.target.value); onText(e.target.value, used); }} />
      <div className="wtd-from">
        <span>From the template</span>
        <select value={value} aria-label="Template" disabled={!onPick || options.length < 2} onChange={(e) => onPick?.(e.target.value)}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {lang ? <span>{lang}</span> : null}
        <button type="button" className="wt-btn is-ghost" style={{ minHeight: 26, padding: "0 6px", fontSize: 12 }} disabled={busy} onClick={() => setTick((n) => n + 1)}>Draft again</button>
      </div>
      {media ? <Attach media={media} /> : null}
      {notes ? <details className="wa-hint"><summary className="k">Notes for replies (not sent)</summary><p className="k">{notes}</p></details> : null}
    </div>
  );
}

// --- A reply ---------------------------------------------------------------------------------------------------------

const BASIC: WaSort[] = ["yes", "question", "notnow", "stop"];
const TRACK_SORTS: WaSort[] = ["privacy", "activity", "both"];
const isTrack = (s: WaSort): s is "privacy" | "activity" | "both" => TRACK_SORTS.includes(s);

function ReplyCard({ c, templates, onDone }: { c: WaReplyX; templates: WaTemplate[]; onDone: () => void }): ReactElement {
  const toast = useToast();
  const sorts: WaSort[] = c.sorts?.length ? c.sorts : BASIC;
  const s = c.suggest;
  const suggested: WaSort | null = s ? (s.kind === "track" ? (s.track || null) as WaSort | null : s.kind) : null;
  const [sort, setSort] = useState<WaSort>(suggested && sorts.includes(suggested) ? suggested : sorts.includes("question") ? "question" : sorts[0]);
  // Another Quick reply picked by hand (it never moves the path), else the choice's own answer.
  const [other, setOther] = useState<number | null>(null);
  const [out, setOut] = useState<{ text: string; template: number | null }>({ text: "", template: null });
  const [busy, setBusy] = useState(false);
  const name = nameOf(c);
  const byId = (id: number | null | undefined) => (id ? templates.find((t) => t.id === id) : undefined);
  const answerOf = (k: WaSort): number | null => c.answers?.[k] ?? null;
  const tpl = other ?? answerOf(sort);
  const kindOf = (k: WaSort): WaKind | "flow" =>
    isTrack(k) ? "flow" : k === "yes" ? (c.yes_date ? "flow" : "interested") : k === "notnow" ? "notnow" : "question";
  const picked: Picked = { kind: kindOf(sort), template: tpl, track: isTrack(sort) ? sort : undefined };
  const fallback: Record<WaSort, string> = {
    yes: c.yes_date ? "The next message in their path" : "Reply template · YES", question: "Reply template · A question",
    notnow: "Reply template · Not now", stop: "Reply template · STOP", privacy: "Demo video · Data Privacy", activity: "Demo video · Team Activity", both: "Demo video · Both Pack",
  };
  const options: Option[] = sorts.map((k) => ({ value: `s:${k}`, label: tplLabel(byId(answerOf(k))) || fallback[k] }));
  if (!isTrack(sort)) {
    const mine = new Set(sorts.map(answerOf).filter(Boolean));
    templates.filter((t) => t.category === "quick_reply" && sendable(t) && t.id && !mine.has(t.id))
      .forEach((t) => options.push({ value: `t:${t.id}`, label: tplLabel(t) }));
  }
  const pickOption = (v: string) => {
    if (v.startsWith("s:")) { setSort(v.slice(2) as WaSort); setOther(null); }
    else { setSort("question"); setOther(Number(v.slice(2))); }
  };
  const theirs = (c.messages ?? []).filter((m) => m.kind === "theirs");
  const lastIn = theirs[theirs.length - 1];
  const ours = [...(c.messages ?? [])].reverse().find((m) => m.kind !== "theirs" && (!lastIn || m.at < lastIn.at));
  const recent = theirs.filter((m) => !ours || m.at > ours.at).slice(-3);
  const shown: WaMessage[] = [...(ours ? [ours] : []), ...(recent.length ? recent : theirs.slice(-1))];
  const stop = sort === "stop";
  const effect = c.effect?.[sort] ?? "";

  const confirm = async () => {
    setBusy(true);
    try {
      if (stop) {
        if (out.text.trim()) await markSent(c.id, "reply", out.text, out.template).catch(() => null);
        await actOn(c.id, "stop");
        toast(`${name} is blocked in every campaign.`);
        onDone();
        return;
      }
      if (isTrack(sort)) await actOn(c.id, "track", sort);
      else if (sort === "yes" && !c.yes_date) await actOn(c.id, "interested");
      else if (sort === "notnow") await actOn(c.id, "notnow");
      await markSent(c.id, "reply", out.text, out.template);
      toast(`Marked as sent to ${name}.${effect ? ` ${firstSentence(effect)}` : ""}`);
      onDone();
    } catch (err) {
      toast(errText(err, "Couldn't save that."), "bad");
      setBusy(false);
    }
  };

  const readAs = suggested ? (isTrack(suggested) ? `Track: ${SORT_LABEL[suggested]}` : SORT_LABEL[suggested]) : "";
  return (
    <article className="wc-card wtd-card" aria-label={`Reply from ${name}`}>
      <Head c={c} step={c.step_label || (c.yes_date ? `YES path · ${c.track ? TRACK_LABEL[c.track] : "Track to set"}` : c.day ? `Intro · day ${c.day}` : "Intro")} tip={trackTip(c)} />
      <div className="wc-chat">
        <span className="wc-day">{lastIn && isToday(lastIn.at) ? "Today" : lastIn ? new Date(lastIn.at).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : "Their reply"}</span>
        {shown.length ? shown.map((m) => (
          <div key={m.id} className={m.kind === "theirs" ? "wtd-in" : "wtd-out"}>{m.text}<span className="wt-time">{stamp(m.at)}{m.kind !== "theirs" ? " ✓✓" : ""}</span></div>
        )) : <span className="wtd-none">Their message isn't saved here.</span>}
      </div>
      <div className="wtd-ai">
        {s ? (
          <div className="wtd-ail">
            <span className="wtd-sug">{s.source === "claude" ? "Claude" : "Suggested"}</span>
            <span>{readAs ? <>Reads this as <b>{readAs}</b> · {s.why}</> : s.why}</span>
          </div>
        ) : null}
        <div className="wtd-sort" role="group" aria-label={isTrack(sorts[0]) ? "Which Track" : "What they said"}>
          {sorts.map((k) => (
            <button key={k} type="button" className={k === "stop" ? "is-stop" : ""} aria-pressed={sort === k && !other}
              onClick={() => { setSort(k); setOther(null); }}>
              {SORT_LABEL[k]}{k === suggested ? " ✓" : ""}
            </button>
          ))}
        </div>
        {other ? <div className="wtd-move">A Quick reply never moves their path. {name} stays where they are.</div>
          : effect ? <div className="wtd-move">{effect}</div> : null}
        {sort === "yes" && c.plan !== "ninety" && c.engine !== "path" ? <TrackPicker c={c} onDone={onDone} /> : null}
      </div>
      <Answer c={c} picked={picked} options={options} value={other ? `t:${other}` : `s:${sort}`} onPick={pickOption}
        onText={(text, template) => setOut({ text, template })}
        title={(by) => (stop ? "The confirmation" : by === "claude" ? "Your answer · Claude drafted it, change anything" : "Your answer · from the template, change anything")} />
      <footer className="wtd-foot">
        <a className="wt-btn is-dark" href={waLink(c.phone, out.text)} target="_blank" rel="noreferrer" aria-disabled={!out.text.trim()}
          title="Opens the chat in WhatsApp Business with this message filled in">Open in WhatsApp</a>
        {stop
          ? <button type="button" className="wt-btn" disabled={busy} onClick={() => void confirm()}>Block the number</button>
          : <button type="button" className="wt-btn" disabled={busy || !out.text.trim()} onClick={() => void confirm()}>Mark as sent</button>}
        <span className="wtd-note">{lastIn ? `Waiting ${ago(lastIn.at)}` : ""}</span>
      </footer>
    </article>
  );
}

// --- A message to send -----------------------------------------------------------------------------------------------

/** What the step is called: the server's step_label (wa3), else the template label, else the older kind. */
const stepOf = (q: WaQueueRowX): string =>
  q.step_label || q.label || (q.kind === "nurture" ? `After YES · ${q.template}` : q.kind === "flow" ? "Set the Track" : KIND_LABEL[q.kind as WaKind] ?? q.template);

function SendCard({ q, later, slotLabel, reload }: { q: WaQueueRowX; later: boolean; slotLabel: string; reload: () => void }): ReactElement {
  const toast = useToast();
  const c = q.contact as WaContactX;
  const name = nameOf(c);
  const step = stepOf(q);
  const [out, setOut] = useState<{ text: string; template: number | null }>({ text: "", template: null });
  const [busy, setBusy] = useState(false);
  const ours = c.last && c.last.kind !== "theirs" ? c.last : null;
  const day = q.after_yes || !q.slot ? "Today" : later ? `Today · goes in the ${slotLabel} slot` : `Today · ${slotLabel} slot`;
  const sent = async () => {
    setBusy(true);
    try {
      await markSent(c.id, q.kind as WaSendKind, out.text, out.template);
      toast(`Marked as sent to ${name}.`);
      reload();
    } catch (err) {
      toast(errText(err, "Couldn't save that."), "bad");
      setBusy(false);
    }
  };
  let body: ReactNode;
  let canSend = true;
  if (q.note === "set_track") {
    canSend = false;
    body = <div className="wtd-body"><TrackSetter c={c} onDone={(_, done) => { toast(done); reload(); }} /></div>;
  } else if (q.kind === "flow" && q.draft) {
    canSend = false;
    body = <div className="wtd-body"><p className="k wa-hint">Due today, but <b>{q.label}</b> is still a draft. <Link to="/marketing/whatsapp/templates">Write its English and Hinglish in Templates</Link>; a draft is never sent.</p></div>;
  } else {
    const picked: Picked = q.kind === "flow" ? { kind: "flow", template: q.template_id ?? null } : { kind: q.kind as WaKind, template: null };
    body = (
      <>
        {q.kind === "nurture" ? <div className="wtd-body"><TrackPicker c={c} onDone={reload} /></div> : null}
        <Answer c={c} picked={picked} options={[{ value: "this", label: q.label || q.template || step }]} value="this"
          onText={(text, template) => setOut({ text, template: q.kind === "flow" ? template : null })}
          title={(by, label) => `The message · ${label || step}${by === "claude" ? " · personalised by Claude" : ""}`} />
      </>
    );
  }
  return (
    <article className={"wc-card wtd-card" + (later ? " is-later" : "")} aria-label={`${name}: ${step}`}>
      <Head c={c} step={step} tip={trackTip(c)} />
      <div className="wc-chat">
        <span className="wc-day">{day}</span>
        {ours ? <div className="wtd-out">{ours.text.length >= 160 ? `${ours.text}…` : ours.text}<span className="wt-time">{stamp(ours.at)} ✓✓</span></div>
          : <span className="wtd-none">{c.step ? "Their last message isn't saved here." : "Their first message from Zinwe."}</span>}
      </div>
      {body}
      <footer className="wtd-foot">
        {canSend ? (
          <>
            <a className="wt-btn is-dark" href={waLink(c.phone, out.text)} target="_blank" rel="noreferrer" aria-disabled={!out.text.trim()}
              title="Opens the chat in WhatsApp Business with this message filled in">Open in WhatsApp</a>
            <button type="button" className="wt-btn" disabled={busy || !out.text.trim()} onClick={() => void sent()}>Mark as sent</button>
          </>
        ) : null}
        <span className="wtd-note">{later ? "You can send it early" : q.draft ? "Waits until the template is written" : ""}</span>
      </footer>
    </article>
  );
}

// --- Log a reply, Sent today ---------------------------------------------------------------------------------------

function LogReply({ contacts, onDone }: { contacts: WaContact[]; onDone: () => void }): ReactElement {
  const toast = useToast();
  const [id, setId] = useState(0);
  const [text, setText] = useState("");
  const save = async () => {
    try {
      await logReply(id, text);
      toast("Reply saved. It's in Replies to answer.");
      setText("");
      setId(0);
      onDone();
    } catch (err) {
      toast(errText(err, "Couldn't save that."), "bad");
    }
  };
  return (
    <section className="wc-card wtx-card wtx-form" aria-labelledby="wtd-log-h">
      <div className="wtx-body">
        <h3 id="wtd-log-h">Someone replied on WhatsApp?</h3>
        <span className="k">Paste their message here so it's tracked and Claude can read it. STOP blocks the number.</span>
        <label className="fl">Who replied
          <select className="inp" value={id} onChange={(e) => setId(Number(e.target.value))}>
            <option value={0}>Choose a contact</option>
            {contacts.map((c) => <option key={c.id} value={c.id}>{c.firm} · {c.phone}</option>)}
          </select>
        </label>
        <label className="fl">What they wrote<textarea className="inp" rows={3} value={text} onChange={(e) => setText(e.target.value)} /></label>
        <div><button type="button" className="wt-btn is-dark" disabled={!id || !text.trim()} onClick={() => void save()}>Save their reply</button></div>
      </div>
    </section>
  );
}

function SentToday({ data, contacts }: { data: WaTodayX; contacts: WaContactX[] }): ReactElement {
  // The wa4 server lists every message; an older one only has each contact's last message.
  const rows = data.sent_list ?? contacts.filter((c) => c.last && c.last.kind !== "theirs" && isToday(c.last.at))
    .map((c) => ({ at: c.last!.at, contact: c.id, name: nameOf(c), what: c.step_label || "Message", replied_at: null, blocked: c.status === "stop" }))
    .sort((a, b) => b.at.localeCompare(a.at));
  if (!rows.length) return <div className="wtd-done"><b>Nothing sent yet today</b><span>What you mark as sent shows here, newest first.</span></div>;
  return (
    <div className="wtd-rows">
      {rows.map((r, i) => (
        <div key={`${r.contact}-${r.at}-${i}`} className="wtd-row">
          <span>{hhmm(r.at)}</span>
          <span><b>{r.name}</b> · {r.what}</span>
          <span className={"wt-pct " + (r.blocked ? "is-low" : r.replied_at ? "is-good" : "is-none")}>{r.blocked ? "Blocked" : r.replied_at ? `Replied ${hhmm(r.replied_at)}` : "Sent"}</span>
        </div>
      ))}
    </div>
  );
}

// --- The tab ---------------------------------------------------------------------------------------------------------

type View = "replies" | "due" | `s${WaSlot}` | "sent" | "log";

/** An older server sends no slot: after-YES steps by their kind and lane, everything else in Due now. */
const afterYes = (q: WaQueueRowX): boolean =>
  q.after_yes ?? (q.note === "set_track" || q.kind === "nurture" || (!!q.lane && q.lane !== "main") || (!!q.category && q.category !== "outreach"));

export function TodayTab({ data, contacts, templates, reload }: { data: WaTodayX; contacts: WaContact[]; templates: WaTemplate[]; reload: () => void }): ReactElement {
  const slots = data.slots ?? localSlots();
  const replies = data.replies as WaReplyX[];
  const queue = data.queue as WaQueueRowX[];
  const [view, setView] = useState<View>(replies.length ? "replies" : "due");
  const [q, setQ] = useState("");
  const match = (c: WaContact) => {
    const t = q.trim().toLowerCase();
    return !t || `${nameOf(c)} ${c.firm} ${c.city}`.toLowerCase().includes(t);
  };
  const liveReplies = replies.filter(match);
  const liveQueue = queue.filter((r) => match(r.contact));
  const nowStart = Number(slots.now);
  const slotOf = (r: WaQueueRowX): WaSlot | "" => (afterYes(r) ? "" : (r.slot as WaSlot) || "10");
  const due = useMemo(() => liveQueue.filter((r) => { const s = slotOf(r); return !s || Number(s) <= nowStart; })
    .sort((a, b) => Number(afterYes(b)) - Number(afterYes(a))), [liveQueue, nowStart]); // eslint-disable-line react-hooks/exhaustive-deps
  const laterSlots = SLOT_KEYS.filter((k) => Number(k) > nowStart);
  const bySlot = (k: WaSlot) => liveQueue.filter((r) => slotOf(r) === k);
  const sentRows = data.sent_list;
  const sentCount = sentRows ? sentRows.length : data.sent_today;
  const talking = contacts.filter((c) => c.step > 0 && c.status !== "stop");
  const day = data.day ?? { sent: data.sent_today, limit: 0, replies: replies.length, yes: 0 };
  const nextCount = slots.next ? bySlot(slots.next as WaSlot).length : 0;

  const titles: Record<string, [string, string]> = {
    replies: ["Replies to answer", "Answer these first. Claude reads each reply and suggests what it means; you confirm it, check the answer and send it."],
    due: [`Due now · ${slots.now_label}`, "The messages this slot owes. After-YES steps come first, then Intro messages by day."],
    sent: ["Sent today", "Every message you marked as sent today, newest first."],
    log: ["Log a reply", "Someone answered on WhatsApp? Paste it here so it is tracked and lands in Replies to answer."],
  };
  for (const k of SLOT_KEYS) {
    const start = slots.list.find((x) => x.key === k)?.start ?? `${k}:00`;
    titles[`s${k}`] = [`Later today · ${SLOT_LABEL[k]}`, k === slots.next ? "These go in the next slot. Send one early if you are free now."
      : k === "17" ? "The last slot of the day." : `These go after ${start}.`];
  }
  const [title, desc] = titles[view] ?? titles.due;

  let main: ReactElement;
  if (view === "replies") {
    main = (
      <>
        {liveReplies.length ? (
          <div className="wtd-list">{liveReplies.map((c) => <ReplyCard key={c.id} c={c} templates={templates} onDone={reload} />)}</div>
        ) : (
          <div className="wtd-done">
            <b>No replies waiting</b>
            <span>{due.length ? `${due.length} ${due.length === 1 ? "message is" : "messages are"} due in this slot. Open Due now.` : slots.next_at ? `You are done for this slot. The next one starts at ${slots.next_at}.` : "You are done for today."}</span>
          </div>
        )}
        <div className="wtd-log"><LogReply contacts={talking} onDone={reload} /></div>
      </>
    );
  } else if (view === "sent") main = <SentToday data={data} contacts={contacts as WaContactX[]} />;
  else if (view === "log") main = <div className="wtd-list"><LogReply contacts={talking} onDone={() => { reload(); setView("replies"); }} /></div>;
  else {
    const slot = view === "due" ? null : (view.slice(1) as WaSlot);
    const list = slot ? bySlot(slot) : due;
    main = list.length ? (
      <div className="wtd-list">
        {list.map((r) => {
          const s = slotOf(r);
          return <SendCard key={`${r.kind}-${r.contact.id}`} q={r} later={!!slot} slotLabel={s ? SLOT_LABEL[s] : slots.now_label} reload={reload} />;
        })}
      </div>
    ) : (
      <div className="wtd-done">
        <b>Nothing due here</b>
        <span>{queue.length || replies.length ? "Pick another slot on the left." : <>Start a campaign in <Link to="/marketing/whatsapp/campaigns">Campaigns</Link>, or add contacts to a live one.</>}</span>
      </div>
    );
  }

  const earliest = sentRows?.length ? sentRows[sentRows.length - 1].at : null;
  return (
    <WtShell label="What to do today" current={title} side={(close) => {
      const pick = (v: View) => () => { setView(v); close(); };
      return (
        <>
          <button type="button" className="wt-new" onClick={pick(replies.length ? "replies" : "due")}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" /></svg>
            Start sending
          </button>
          <label className="wt-search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a contact" aria-label="Search a contact" />
          </label>
          <div className="wt-sec">
            <SideItem on={view === "replies"} onPick={pick("replies")} label="Replies to answer" sub={liveReplies.length ? "Answer these first" : "All answered"} chip={<Count n={liveReplies.length} />} />
          </div>
          <div className="wt-sec">
            <div className="wt-sech"><span>NOW · {slots.now_label}</span></div>
            <SideItem on={view === "due"} onPick={pick("due")} label="Due now" sub={due.length ? "After-YES steps first" : "Nothing left in this slot"} chip={<Count n={due.length} />} />
          </div>
          {laterSlots.length ? (
            <div className="wt-sec">
              <div className="wt-sech"><span>LATER TODAY</span></div>
              {laterSlots.map((k) => {
                const list = bySlot(k);
                return <SideItem key={k} on={view === `s${k}`} onPick={pick(`s${k}`)} label={SLOT_LABEL[k]} sub={list.length ? stepOf(list[0]) : "Nothing due"} chip={<Count n={list.length} quiet />} />;
              })}
            </div>
          ) : null}
          <div className="wt-sec">
            <div className="wt-sech"><span>DONE</span></div>
            <SideItem on={view === "sent"} onPick={pick("sent")} label="Sent today" sub={earliest ? `Since ${hhmm(earliest)}` : "Nothing yet"}
              chip={<span className={"wt-pct " + (sentCount ? "is-good" : "is-none")}>{sentCount}</span>} />
          </div>
        </>
      );
    }}>
      <div className="wt-head">
        <div><h2>{title}</h2><p>{desc}</p></div>
        <div className="wt-tools">{view !== "log" ? <button type="button" className="wt-btn" onClick={() => setView("log")}>Log a reply</button> : null}</div>
      </div>
      <div className="wt-stats wtd-stats" aria-label="Today's numbers">
        <span title="Intro messages count towards the daily limit; replies and the YES path don't">Sent today <b>{day.sent}</b>{day.limit ? ` of ${day.limit}` : ""}</span><span>·</span>
        <span><b>{day.replies}</b> {day.replies === 1 ? "reply" : "replies"}</span><span>·</span>
        <span><b>{day.yes}</b> said YES</span><span>·</span>
        <span>{slots.sunday ? <b>Sunday: no sends today</b> : slots.open ? <>Now: <b>{slots.now_label}</b></> : <>Now: <b>outside the send window</b></>}</span>
        <span className="wtd-next">{slots.next ? `Next slot ${slots.next_at} · ${nextCount} ${nextCount === 1 ? "message" : "messages"}` : "Last slot of the day"}</span>
      </div>
      {main}
      <div className="wt-foot">Zinwe never sends a WhatsApp message by itself: Open in WhatsApp fills the chat on the Zinwe WhatsApp Business number, you press Send there, then Mark as sent here. Replies always come first and have no daily limit.</div>
    </WtShell>
  );
}
