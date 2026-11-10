import { useEffect, useState, type ReactElement } from "react";
import { Link } from "react-router-dom";
import {
  actOn, draftFor, fetchWaMedia, logReply, markSent, patchWaContact, waLink,
  type WaContact, type WaKind, type WaMedia, type WaQueueItem, type WaSendKind, type WaTemplate, type WaToday, type WaTrack,
} from "../../../lib/whatsappApi";
import { useToast } from "../../../components/Toast";
import { TrackSetter } from "./CampaignContact";
import { Bubble, CATEGORY_LABEL, errText, initials, KIND_LABEL, mediaWord, MediaView, nameOf, sizeText, TRACK_LABEL, trackName } from "./shared";

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

/** Which after-YES sequence they get: picked from what they said matters most. */
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

/** One draft: Claude's (or the template's) text, editable, with Open in WhatsApp and Mark as sent. */
function Draft({ c, kind, send, onDone, template }: { c: WaContact; kind: WaKind | "flow"; send: WaSendKind; onDone: () => void; template?: number | null }): ReactElement {
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
    <div className="wa-draft">
      <span className="wa-by">{busy && !text ? "Drafting…" : by}</span>
      <textarea className="inp" rows={7} aria-label={`Message to ${nameOf(c)}`} value={text} onChange={(e) => setText(e.target.value)} />
      {media ? <Attach media={media} /> : null}
      {hints.creative && !media ? <p className="k wa-hint"><b>Creative:</b> {hints.creative}</p> : null}
      {hints.notes ? (
        <details className="wa-hint">
          <summary className="k">Notes for replies (not sent)</summary>
          <p className="k">{hints.notes}</p>
        </details>
      ) : null}
      <div className="fr">
        <a className="btn sm wa-open" href={waLink(c.phone, text)} target="_blank" rel="noreferrer" onClick={() => setOpened(true)} aria-disabled={!text}>Open in WhatsApp</a>
        <button type="button" className={"btn sm" + (opened ? " dark" : "")} disabled={busy || !text.trim()} onClick={() => void sent()}>Mark as sent</button>
        <button type="button" className="btn sm" disabled={busy} onClick={load}>Draft again</button>
      </div>
    </div>
  );
}

function Who({ c, note }: { c: WaContact; note: string }): ReactElement {
  return (
    <div className="wa-who">
      <span className="wa-av" aria-hidden="true">{initials(nameOf(c))}</span>
      <div>
        <b>{nameOf(c)}</b>
        <span className="k">{[c.firm !== nameOf(c) ? c.firm : "", c.city, note].filter(Boolean).join(" · ")}</span>
      </div>
    </div>
  );
}

function Reply({ c, templates, onDone }: { c: WaContact; templates: WaTemplate[]; onDone: () => void }): ReactElement {
  const toast = useToast();
  const [kind, setKind] = useState<WaKind>(c.status === "interested" ? "interested" : "question");
  const ninety = c.plan === "ninety";
  const answers = templates.filter((t) => t.category && !t.archived && !t.draft && (t.category === "quick_reply" || !t.track || !c.track || t.track === c.track));
  const [answer, setAnswer] = useState(0);
  const theirs = (c.messages ?? []).filter((m) => m.kind === "theirs").slice(-2);
  const act = async (action: "interested" | "notnow" | "stop") => {
    try {
      await actOn(c.id, action);
      if (action === "stop") { toast("This number will never be messaged again."); onDone(); return; }
      setKind(action === "interested" ? "interested" : "notnow");
      toast(action === "interested" ? "Saved as interested." : "Saved as not now.");
    } catch (err) {
      toast(errText(err, "Couldn't save that."), "bad");
    }
  };
  return (
    <div className="wa-item">
      <Who c={c} note={c.campaign_name} />
      <span className="k">They wrote</span>
      {theirs.map((m) => <Bubble key={m.id} text={m.text} mine={false} />)}
      <div className="fr" role="group" aria-label="What did they say?">
        <button type="button" className={"chip" + (kind === "interested" ? " on" : "")} onClick={() => void act("interested")}>Interested</button>
        <button type="button" className={"chip" + (kind === "question" ? " on" : "")} onClick={() => setKind("question")}>Asked a question</button>
        <button type="button" className={"chip" + (kind === "notnow" ? " on" : "")} onClick={() => void act("notnow")}>Not now</button>
        <button type="button" className="chip wa-stop" onClick={() => void act("stop")}>Stop, never again</button>
      </div>
      {ninety && c.yes_date && !c.track ? <TrackSetter c={c} onDone={(_, done) => { toast(done); onDone(); }} /> : null}
      {kind === "interested" && !ninety ? <TrackPicker c={c} onDone={onDone} /> : null}
      {ninety ? (
        <label className="fl">Answer with <span className="k">A quick reply never moves their path; a campaign template does</span>
          <select className="inp" value={answer} onChange={(e) => setAnswer(Number(e.target.value))}>
            <option value={0}>{c.yes_date ? "The next message in their path" : `The reply template for “${kind === "interested" ? "interested" : kind === "notnow" ? "not now" : "a question"}”`}</option>
            {answers.map((t) => <option key={t.id} value={t.id}>{CATEGORY_LABEL[t.category as keyof typeof CATEGORY_LABEL]} · {t.name}</option>)}
          </select>
        </label>
      ) : null}
      <Draft c={c} kind={ninety && c.yes_date && !answer ? "flow" : kind} send="reply" template={answer || null} onDone={onDone} />
    </div>
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
    <section className="card editor">
      <h2>Someone replied on WhatsApp?</h2>
      <span className="k">Paste their message here so it's tracked and Claude can suggest an answer. STOP blocks the number.</span>
      <label className="fl">Who replied
        <select className="inp" value={id} onChange={(e) => setId(Number(e.target.value))}>
          <option value={0}>Choose a contact</option>
          {contacts.map((c) => <option key={c.id} value={c.id}>{c.firm} · {c.phone}</option>)}
        </select>
      </label>
      <label className="fl">What they wrote<textarea className="inp" rows={3} value={text} onChange={(e) => setText(e.target.value)} /></label>
      <button type="button" className="btn dark mk-start" disabled={!id || !text.trim()} onClick={() => void save()}>Save their reply</button>
    </section>
  );
}

function QueueItem({ q, reload }: { q: WaQueueItem; reload: () => void }): ReactElement {
  const toast = useToast();
  const c = q.contact;
  const where = c.campaign_name ? ` · ${c.campaign_name}` : "";
  if (q.kind !== "flow") {
    return (
      <div className="wa-item">
        <Who c={c} note={`${q.kind === "nurture" ? `After YES · ${q.template}` : KIND_LABEL[q.kind as WaKind]}${where}`} />
        {q.kind === "nurture" ? <TrackPicker c={c} onDone={reload} /> : null}
        <Draft c={c} kind={q.kind as WaKind} send={q.kind} onDone={reload} />
      </div>
    );
  }
  const track = c.track ? ` · Track ${trackName(c.track)}` : "";
  return (
    <div className="wa-item">
      <Who c={c} note={`${q.label || "Set the Track"}${c.day ? ` · their day ${c.day} of 90` : " · their first message"}${track}${where}`} />
      {q.note === "set_track" ? <TrackSetter c={c} onDone={(_, done) => { toast(done); reload(); }} />
        : q.draft ? <p className="k wa-hint">Due today, but <b>{q.label}</b> is still a draft. <Link to="/marketing/whatsapp/templates">Write its English and Hinglish in Templates</Link>; a draft is never sent.</p>
          : <Draft c={c} kind="flow" send="flow" template={q.template_id} onDone={reload} />}
    </div>
  );
}

export function TodayTab({ data, contacts, templates, reload }: { data: WaToday; contacts: WaContact[]; templates: WaTemplate[]; reload: () => void }): ReactElement {
  const s = data.stats;
  const camp = data.campaign;
  const rate = s.messaged ? Math.round((s.replied / s.messaged) * 100) : 0;
  const talking = contacts.filter((c) => c.step > 0 && c.status !== "stop");
  return (
    <>
      <div className="tiles">
        {([[data.sent_today, "Sent today"], [data.queue.length, "Messages to send"], [data.replies.length, "Replies to answer"], [`${rate}%`, "Reply rate"], [s.stopped, "Asked to stop"],
          ...(camp ? [[camp.track_to_set, "Tracks to set"], [`${camp.reviews_written} · ${camp.reviews_video}`, "Reviews: written · video"]] : [])] as [string | number, string][]).map(([v, l]) => (
          <div key={l} className="card tile"><b className="num">{v}</b><span className="k">{l}</span></div>
        ))}
      </div>
      <section className="check">
        <div>
          <h2>How a message goes out</h2>
          <span className="k">Open in WhatsApp fills in the chat on the Zinwe WhatsApp Business number. You press Send there, then Mark as sent here. Zinwe never sends WhatsApp messages by itself.</span>
        </div>
      </section>
      <div className="wa-grid">
        <section className="card editor">
          <div className="fighead"><h2>Replies to answer</h2><span className="k">Answer these first</span></div>
          {data.replies.length ? data.replies.map((c) => <Reply key={c.id} c={c} templates={templates} onDone={reload} />) : <span className="k">No replies waiting.</span>}
        </section>
        <section className="card editor">
          <div className="fighead"><h2>Messages to send</h2><span className="k">{data.queue.length} due: after-YES steps first, then live campaigns</span></div>
          {data.queue.length ? data.queue.map((q) => <QueueItem key={`${q.kind}-${q.contact.id}`} q={q} reload={reload} />)
            : <span className="k">Nothing due. Start a campaign in <Link to="/marketing/whatsapp/campaigns">Campaigns</Link>, or add contacts to a live one.</span>}
        </section>
      </div>
      <LogReply contacts={talking} onDone={reload} />
    </>
  );
}
