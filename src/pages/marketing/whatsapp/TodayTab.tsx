/**
 * Marketing -> WhatsApp -> Today (wa3, 11 Nov 2026), in the Templates look: a menu with counts on the left (All of
 * today, Replies to answer, the send groups, Done today, Log a reply), the page on the right, and one WhatsApp card per
 * contact. The bubble on each card is the exact message, and you edit it in place.
 *
 * The journeys are the same as before: Open in WhatsApp, then Mark as sent; answer a reply (quick reply or the next
 * message); mark YES (Interested), set the Track, mark STOP. On a wa3 server a row also carries step_label and lane.
 */
import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  actOn, draftFor, fetchWaMedia, logReply, markSent, patchWaContact, waLink,
  type WaContact, type WaKind, type WaMedia, type WaSendKind, type WaTemplate, type WaToday, type WaTrack,
} from "../../../lib/whatsappApi";
import { LANE_LABEL, type WaContactX, type WaLane, type WaQueueItemX } from "../../../lib/whatsappApi.tabs";
import { useToast } from "../../../components/Toast";
import { TrackSetter } from "./CampaignContact";
import {
  Bubble, CATEGORY_LABEL, Count, errText, initials, KIND_LABEL, mediaWord, MediaView, nameOf, RateChip, SideItem, sizeText, TRACK_LABEL, trackName, when,
  WtShell,
} from "./shared";

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
    <label className="fl">After-YES sequence <span className="k">From what matters most to them</span>
      <select className="inp" value={c.track} onChange={(e) => void pick(e.target.value as WaTrack)}>
        {(Object.keys(TRACK_LABEL) as WaTrack[]).map((t) => <option key={t} value={t}>{t ? TRACK_LABEL[t] : "Not chosen yet"}</option>)}
      </select>
    </label>
  );
}

/**
 * One draft: Claude's (or the template's) text in a WhatsApp bubble you can edit, then Open in WhatsApp and Mark as
 * sent. `day` is the grey pill above the bubble ("Day 4 · Problem").
 */
function Draft({ c, kind, send, onDone, template, day }: { c: WaContact; kind: WaKind | "flow"; send: WaSendKind; onDone: () => void; template?: number | null; day?: string }): ReactElement {
  const toast = useToast();
  const [text, setText] = useState("");
  const [by, setBy] = useState("");
  const [busy, setBusy] = useState(true);
  const [opened, setOpened] = useState(false);
  const [media, setMedia] = useState<WaMedia | null>(null);
  const [hints, setHints] = useState<{ creative: string; notes: string }>({ creative: "", notes: "" });
  const [used, setUsed] = useState<number | null>(null);
  const load = () => {
    setBusy(true);
    draftFor(c.id, kind, template ?? undefined)
      .then((d) => {
        setText(d.text); setMedia(d.media ?? null); setHints({ creative: d.creative ?? "", notes: d.notes ?? "" });
        setUsed(d.label ? d.template_id ?? null : null);
        setBy(`${d.by === "claude" ? `Personalised by Claude from ${d.template}` : `From the template ${d.template}`}${d.language === "hi" ? " · Hinglish" : ""}`);
      })
      .catch((err) => toast(errText(err, "Couldn't draft this message."), "bad"))
      .finally(() => setBusy(false));
  };
  useEffect(load, [c.id, kind, c.track, template]); // eslint-disable-line react-hooks/exhaustive-deps
  const sent = async () => {
    setBusy(true);
    try {
      await markSent(c.id, send, text, used);
      toast("Marked as sent.");
      onDone();
    } catch (err) {
      toast(errText(err, "Couldn't save that."), "bad");
      setBusy(false);
    }
  };
  return (
    <div className="wtx-draft">
      <div className="wc-chat wtx-out">
        {day ? <span className="wc-day">{day}</span> : null}
        <span className="wtx-by">{busy && !text ? "Drafting…" : by}</span>
        <div className="wtx-bubble">
          <textarea className="wt-bubble wtx-edit" rows={4} aria-label={`Message to ${nameOf(c)}`} value={text} placeholder={busy ? "Drafting…" : "Write the message"} onChange={(e) => setText(e.target.value)} />
          <span className="wt-time">You can edit the text here · {text.length} characters</span>
        </div>
      </div>
      {media || (hints.creative && !media) || hints.notes ? (
        <div className="wtx-body">
          {media ? <Attach media={media} /> : null}
          {hints.creative && !media ? <p className="k wa-hint"><b>Creative:</b> {hints.creative}</p> : null}
          {hints.notes ? (
            <details className="wa-hint">
              <summary className="k">Notes for replies (not sent)</summary>
              <p className="k">{hints.notes}</p>
            </details>
          ) : null}
        </div>
      ) : null}
      <footer className="wc-foot">
        <a className="wt-btn wtx-wa" href={waLink(c.phone, text)} target="_blank" rel="noreferrer" onClick={() => setOpened(true)} aria-disabled={!text}>Open in WhatsApp</a>
        <button type="button" className={"wt-btn" + (opened ? " is-dark" : "")} disabled={busy || !text.trim()} onClick={() => void sent()}>Mark as sent</button>
        <button type="button" className="wt-btn is-ghost" disabled={busy} onClick={load}>Draft again</button>
      </footer>
    </div>
  );
}

/** The card's WhatsApp-style header: who, where, and the step the message is for. */
function Top({ c, sub, tag }: { c: WaContact; sub: string; tag?: ReactNode }): ReactElement {
  return (
    <header className="wc-top">
      <span className="wc-av" aria-hidden="true">{initials(nameOf(c))}</span>
      <div className="wc-tt"><b>{nameOf(c)}</b><span>{sub}</span></div>
      {tag}
    </header>
  );
}

/** The quiet facts under a card: Track, step, lane and campaign, as the server gives them. */
function Facts({ c, step }: { c: WaContactX; step?: string }): ReactElement | null {
  const lane = (c.lane || "") as WaLane | "";
  const rows: [string, ReactNode][] = [];
  if (c.plan === "ninety" || c.track) rows.push(["Track", <span key="t" className={"wt-pill" + (c.track ? "" : " is-draft")}>{trackName(c.track)}</span>]);
  if (step) rows.push(["Step", step]);
  if (lane) rows.push(["Lane", LANE_LABEL[lane] ?? lane]);
  if (c.campaign_name) rows.push(["Campaign", c.campaign_name]);
  if (!rows.length) return null;
  return <dl className="wc-facts">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;
}

const ago = (iso: string | undefined): string => {
  if (!iso) return "";
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  return mins < 60 ? `${mins} min` : mins < 1440 ? `${Math.floor(mins / 60)} h ${mins % 60 ? `${mins % 60} min` : ""}`.trim() : `${Math.floor(mins / 1440)} d`;
};

function Reply({ c: given, templates, onDone }: { c: WaContactX; templates: WaTemplate[]; onDone: () => void }): ReactElement {
  const toast = useToast();
  // The contact as the last action left it, so YES shows Set the Track at once (the act returns the contact).
  const [c, setC] = useState<WaContactX>(given);
  useEffect(() => setC(given), [given]);
  const [kind, setKind] = useState<WaKind>(given.status === "interested" ? "interested" : "question");
  const ninety = c.plan === "ninety";
  const answers = templates.filter((t) => t.category && !t.archived && !t.draft && (t.category === "quick_reply" || !t.track || !c.track || t.track === c.track));
  const [answer, setAnswer] = useState(0);
  const theirs = (c.messages ?? []).filter((m) => m.kind === "theirs").slice(-2);
  const act = async (action: "interested" | "notnow" | "stop") => {
    try {
      const next = await actOn(c.id, action);
      if (action === "stop") { toast("This number will never be messaged again."); onDone(); return; }
      if (next) setC((x) => ({ ...x, ...next, messages: x.messages }));
      setKind(action === "interested" ? "interested" : "notnow");
      toast(action === "interested" ? "Saved as interested." : "Saved as not now.");
    } catch (err) {
      toast(errText(err, "Couldn't save that."), "bad");
    }
  };
  const lastIn = [...(c.messages ?? [])].reverse().find((m) => m.kind === "theirs");
  return (
    <article className="wc-card wtx-card is-reply" aria-label={`Reply from ${nameOf(c)}`}>
      <Top c={c} sub={[c.firm !== nameOf(c) ? c.firm : "", c.city, c.campaign_name].filter(Boolean).join(" · ")}
        tag={lastIn ? <span className="wt-pct is-mid" title="Waiting for an answer">{ago(lastIn.at)}</span> : null} />
      <div className="wc-chat wtx-in">
        <span className="wc-day">They wrote{lastIn ? ` · ${when(lastIn.at)}` : ""}</span>
        {theirs.length ? theirs.map((m) => <Bubble key={m.id} text={m.text} mine={false} />) : <span className="k">Their message isn't saved here.</span>}
      </div>
      <div className="wtx-body">
        <div className="wtx-chips" role="group" aria-label="What did they say?">
          <button type="button" className={"wtx-chip" + (kind === "interested" ? " on" : "")} aria-pressed={kind === "interested"} title="Their YES: the YES path starts" onClick={() => void act("interested")}>Interested</button>
          <button type="button" className={"wtx-chip" + (kind === "question" ? " on" : "")} aria-pressed={kind === "question"} onClick={() => setKind("question")}>Asked a question</button>
          <button type="button" className={"wtx-chip" + (kind === "notnow" ? " on" : "")} aria-pressed={kind === "notnow"} onClick={() => void act("notnow")}>Not now</button>
          <button type="button" className="wtx-chip is-stop" title="STOP, band karo or mat bhejo: never again, in every campaign" onClick={() => void act("stop")}>Stop, never again</button>
        </div>
        {ninety && c.yes_date && !c.track ? <TrackSetter c={c} onDone={(next, done) => { setC((x) => ({ ...x, ...next, messages: x.messages })); toast(done); onDone(); }} /> : null}
        {kind === "interested" && !ninety ? <TrackPicker c={c} onDone={onDone} /> : null}
        {ninety ? (
          <label className="fl">Answer with <span className="k">A quick reply never moves their path; a campaign template does</span>
            <select className="inp" value={answer} onChange={(e) => setAnswer(Number(e.target.value))}>
              <option value={0}>{c.yes_date ? "The next message in their path" : `The reply template for “${kind === "interested" ? "interested" : kind === "notnow" ? "not now" : "a question"}”`}</option>
              {answers.map((t) => <option key={t.id} value={t.id}>{CATEGORY_LABEL[t.category as keyof typeof CATEGORY_LABEL]} · {t.name}</option>)}
            </select>
          </label>
        ) : null}
      </div>
      <Facts c={c} step={c.step_label} />
      <Draft c={c} kind={ninety && c.yes_date && !answer ? "flow" : kind} send="reply" template={answer || null} onDone={onDone} day="Your answer" />
    </article>
  );
}

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
    <section className="wc-card wtx-card wtx-form" aria-labelledby="wtx-log-h">
      <div className="wtx-body">
        <h3 id="wtx-log-h">Someone replied on WhatsApp?</h3>
        <span className="k">Paste their message here so it's tracked and Claude can suggest an answer. STOP blocks the number.</span>
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

type Group = "track" | "yes" | "intro" | "drafts";
const GROUPS: [Group, string, string][] = [
  ["track", "Set the Track", "From their Engage answer"],
  ["yes", "After YES", "Engage, Demo video, Setup, Offer"],
  ["intro", "Intro and follow-ups", "Cold messages due today"],
  ["drafts", "Drafts to write", "Due, but still a draft"],
];
function groupOf(q: WaQueueItemX): Group {
  if (q.note === "set_track") return "track";
  if (q.kind === "flow" && q.draft) return "drafts";
  if (q.kind === "nurture") return "yes";
  if (q.kind === "flow" && ((q.lane && q.lane !== "main") || (q.category && q.category !== "outreach"))) return "yes";
  return "intro";
}
/** What the step is called: the server's step_label (wa3), else the template label, else the older kind. */
const stepOf = (q: WaQueueItemX): string =>
  q.step_label || q.label || (q.kind === "nurture" ? `After YES · ${q.template}` : q.kind === "flow" ? "Set the Track" : KIND_LABEL[q.kind as WaKind] ?? q.template);

function QueueItem({ q, reload }: { q: WaQueueItemX; reload: () => void }): ReactElement {
  const toast = useToast();
  const c = q.contact as WaContactX;
  const step = stepOf(q);
  const place = [c.firm !== nameOf(c) ? c.firm : "", c.city].filter(Boolean).join(" · ");
  const dayLine = q.kind === "flow" ? (c.day ? `Their day ${c.day} of 90` : "Their first message") : "";
  const sub = [place, dayLine].filter(Boolean).join(" · ");
  const tag = q.draft ? <span className="wt-pill is-draft">Draft</span> : q.note === "set_track" ? <span className="wt-pill is-cond">Track to set</span> : null;
  let body: ReactElement;
  if (q.kind !== "flow") {
    body = (
      <>
        {q.kind === "nurture" ? <div className="wtx-body"><TrackPicker c={c} onDone={reload} /></div> : null}
        <Draft c={c} kind={q.kind as WaKind} send={q.kind} onDone={reload} day={step} />
      </>
    );
  } else if (q.note === "set_track") {
    body = <div className="wtx-body"><TrackSetter c={c} onDone={(_, done) => { toast(done); reload(); }} /></div>;
  } else if (q.draft) {
    body = <div className="wtx-body"><p className="k wa-hint">Due today, but <b>{q.label}</b> is still a draft. <Link to="/marketing/whatsapp/templates">Write its English and Hinglish in Templates</Link>; a draft is never sent.</p></div>;
  } else {
    body = <Draft c={c} kind="flow" send="flow" template={q.template_id} onDone={reload} day={step} />;
  }
  return (
    <article className="wc-card wtx-card" aria-label={`${nameOf(c)}: ${step}`}>
      <Top c={c} sub={sub} tag={tag} />
      <Facts c={c} step={step} />
      {body}
    </article>
  );
}

/** Sent today, from each contact's last message (the server keeps it). */
function DoneCard({ c }: { c: WaContactX }): ReactElement {
  const at = c.last ? new Date(c.last.at) : null;
  return (
    <article className="wc-card wtx-card" aria-label={`Sent to ${nameOf(c)}`}>
      <Top c={c} sub={[c.firm !== nameOf(c) ? c.firm : "", c.campaign_name].filter(Boolean).join(" · ")} tag={<span className="wt-pct is-good">Sent</span>} />
      <div className="wc-chat">
        <div className="wc-msg"><div className="wt-bubble">{c.last?.text}<span className="wt-time">{at ? at.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : ""} ✓</span></div></div>
      </div>
      <Facts c={c} step={c.step_label} />
    </article>
  );
}

const isToday = (iso: string | undefined): boolean => {
  if (!iso) return false;
  const d = new Date(iso);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
};

const SLOTS: [string, number, number][] = [["10–12", 10, 12], ["12–14", 12, 14], ["14–17", 14, 17], ["17–19", 17, 19]];
/** The send window (Mon–Sat 10:00–19:00) with the slot we are in now. */
function Window(): ReactElement {
  const now = new Date();
  const h = now.getHours() + now.getMinutes() / 60;
  const sunday = now.getDay() === 0;
  const open = !sunday && h >= 10 && h < 19;
  return (
    <span className="wtx-window" title="One message per contact per day, 10:00–19:00, Monday to Saturday">
      <span>{sunday ? "Sunday: no sends today" : open ? "Send window open" : "Outside the send window"}</span>
      {SLOTS.map(([l, a, b]) => <span key={l} className={"wtx-slot" + (open && h >= a && h < b ? " is-now" : "")}>{l}</span>)}
    </span>
  );
}

type View = "all" | "replies" | Group | "done" | "log";
const HEAD: Record<View, [string, string]> = {
  all: ["Today", "Answer the replies first, then send what is due. Zinwe drafts each message; you send it yourself from WhatsApp, then Mark as sent here."],
  replies: ["Replies to answer", "Answer these before any send. Interested is their YES. STOP, band karo or mat bhejo: Stop, never again, and the number never shows here again."],
  track: ["Set the Track", "Their Engage answer decides which Demo videos they get. While the Track is Unassigned they get Engage questions, never a Demo video."],
  yes: ["After YES", "The next step for people who said YES: Engage, the Demo videos of their Track, Setup, Offer and Testimonial."],
  intro: ["Intro and follow-ups", "Cold messages due today. One message per contact per day."],
  drafts: ["Drafts to write", "Due today, but the template is still a draft. A draft is never sent: write its English and Hinglish in Templates."],
  done: ["Done today", "Messages marked as sent today. Nothing goes out unless a person presses Send in WhatsApp."],
  log: ["Log a reply", "Someone answered on WhatsApp? Paste it here so it is tracked and lands in Replies to answer."],
};

export function TodayTab({ data, contacts, templates, reload }: { data: WaToday; contacts: WaContact[]; templates: WaTemplate[]; reload: () => void }): ReactElement {
  const [view, setView] = useState<View>("all");
  const s = data.stats;
  const camp = data.campaign;
  const queue = data.queue as WaQueueItemX[];
  const replies = data.replies as WaContactX[];
  const talking = contacts.filter((c) => c.step > 0 && c.status !== "stop");
  const done = (contacts as WaContactX[]).filter((c) => c.last && c.last.kind !== "theirs" && isToday(c.last.at))
    .sort((a, b) => (b.last?.at ?? "").localeCompare(a.last?.at ?? ""));
  const byGroup = (g: Group) => queue.filter((q) => groupOf(q) === g);
  const sends = queue.filter((q) => groupOf(q) !== "drafts").length;
  const [title, desc] = HEAD[view];

  const repliesList = replies.length
    ? <div className="wc-grid">{replies.map((c) => <Reply key={c.id} c={c} templates={templates} onDone={reload} />)}</div>
    : <div className="wt-empty">No replies waiting.</div>;
  const queueList = (list: WaQueueItemX[]) => (list.length
    ? <div className="wc-grid">{list.map((q) => <QueueItem key={`${q.kind}-${q.contact.id}`} q={q} reload={reload} />)}</div>
    : <div className="wt-empty">Nothing due here. Start a campaign in <Link to="/marketing/whatsapp/campaigns">Campaigns</Link>, or add contacts to a live one.</div>);

  let main: ReactElement;
  if (view === "all") {
    main = (
      <>
        <section aria-labelledby="wtx-replies-h">
          <div className="wtx-subh"><h3 id="wtx-replies-h">Replies to answer</h3><span>{replies.length ? `${replies.length} waiting · answer these first` : "None waiting"}</span></div>
          {repliesList}
        </section>
        <section aria-labelledby="wtx-queue-h">
          <div className="wtx-subh"><h3 id="wtx-queue-h">Messages to send</h3><span>{queue.length} due: after-YES steps first, then live campaigns</span></div>
          {queue.length ? <div className="wc-grid">{queue.map((q) => <QueueItem key={`${q.kind}-${q.contact.id}`} q={q} reload={reload} />)}</div>
            : <div className="wt-empty">Nothing due. Start a campaign in <Link to="/marketing/whatsapp/campaigns">Campaigns</Link>, or add contacts to a live one.</div>}
        </section>
        <div className="wtx-pad"><LogReply contacts={talking} onDone={reload} /></div>
      </>
    );
  } else if (view === "replies") main = <section aria-label="Replies to answer">{repliesList}</section>;
  else if (view === "done") {
    main = done.length ? <div className="wc-grid">{done.map((c) => <DoneCard key={c.id} c={c} />)}</div>
      : <div className="wt-empty">{data.sent_today ? `${data.sent_today} marked as sent today.` : "Nothing sent yet today."}</div>;
  } else if (view === "log") main = <div className="wtx-pad"><LogReply contacts={talking} onDone={() => { reload(); setView("replies"); }} /></div>;
  else main = queueList(byGroup(view));

  return (
    <WtShell label="Today" current={title} side={(close) => {
      const pick = (v: View) => () => { setView(v); close(); };
      return (
        <>
          <button type="button" className="wt-new" onClick={pick("log")}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
            Log a reply
          </button>
          <div className="wt-sec">
            <SideItem on={view === "all"} onPick={pick("all")} label="All of today" sub={`${replies.length} replies · ${sends} sends`} chip={<Count n={replies.length + queue.length} />} />
          </div>
          <div className="wt-sec">
            <div className="wt-sech"><span>ANSWER FIRST</span></div>
            <SideItem on={view === "replies"} onPick={pick("replies")} label="Replies to answer" sub="Before any send" chip={<Count n={replies.length} />} />
          </div>
          <div className="wt-sec">
            <div className="wt-sech"><span>SEND TODAY</span></div>
            {GROUPS.map(([g, label, sub]) => {
              const n = byGroup(g).length;
              return n || g !== "drafts" ? <SideItem key={g} on={view === g} onPick={pick(g)} label={label} sub={sub} chip={<Count n={n} />} /> : null;
            })}
          </div>
          <div className="wt-sec">
            <div className="wt-sech"><span>DONE</span></div>
            <SideItem on={view === "done"} onPick={pick("done")} label="Done today" sub="Marked as sent" chip={<span className={"wt-pct " + (data.sent_today ? "is-good" : "is-none")}>{data.sent_today}</span>} />
          </div>
        </>
      );
    }}>
      <div className="wt-head">
        <div><h2>{title}</h2><p>{desc}</p></div>
        <div className="wt-tools">
          <Window />
          {view !== "log" ? <button type="button" className="wt-btn" onClick={() => setView("log")}>Log a reply</button> : null}
        </div>
      </div>
      <div className="wt-stats" aria-label="Today's numbers">
        <span><b>{data.sent_today}</b> sent today</span><span>·</span>
        <span><b>{queue.length}</b> messages to send</span><span>·</span>
        <span><b>{replies.length}</b> replies to answer</span><span>·</span>
        <span>reply rate</span><RateChip replied={s.replied} sent={s.messaged} /><span>·</span>
        <span><b>{s.stopped}</b> asked to stop</span>
        {camp ? <><span>·</span><span><b>{camp.track_to_set}</b> Tracks to set</span><span>·</span><span>reviews <b>{camp.reviews_written} · {camp.reviews_video}</b> written · video</span></> : null}
      </div>
      {main}
      <div className="wt-foot">Open in WhatsApp fills in the chat on the Zinwe WhatsApp Business number. You press Send there, then Mark as sent here. Zinwe never sends WhatsApp messages by itself. One message per contact per day, 10:00–19:00, Monday to Saturday.</div>
    </WtShell>
  );
}
