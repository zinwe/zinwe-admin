import { useEffect, useState, type ReactElement } from "react";
import { Link } from "react-router-dom";
import {
  actOn, draftFor, fetchWaMedia, logReply, markSent, patchWaContact, waLink,
  type WaContact, type WaKind, type WaMedia, type WaSendKind, type WaToday, type WaTrack,
} from "../../../lib/whatsappApi";
import { useToast } from "../../../components/Toast";
import { Bubble, errText, initials, KIND_LABEL, mediaWord, MediaView, nameOf, sizeText, TRACK_LABEL } from "./shared";

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
function Attach({ media }: { media: WaMedia }): ReactElement {
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
function Draft({ c, kind, send, onDone }: { c: WaContact; kind: WaKind; send: WaSendKind; onDone: () => void }): ReactElement {
  const toast = useToast();
  const [text, setText] = useState("");
  const [by, setBy] = useState("");
  const [busy, setBusy] = useState(true);
  const [opened, setOpened] = useState(false);
  const [media, setMedia] = useState<WaMedia | null>(null);
  const [hints, setHints] = useState<{ creative: string; notes: string }>({ creative: "", notes: "" });
  const load = () => {
    setBusy(true);
    draftFor(c.id, kind)
      .then((d) => { setText(d.text); setMedia(d.media ?? null); setHints({ creative: d.creative ?? "", notes: d.notes ?? "" }); setBy(d.by === "claude" ? `Personalised by Claude from ${d.template}` : `From the template ${d.template}`); })
      .catch((err) => toast(errText(err, "Couldn't draft this message."), "bad"))
      .finally(() => setBusy(false));
  };
  useEffect(load, [c.id, kind, c.track]); // eslint-disable-line react-hooks/exhaustive-deps
  const sent = async () => {
    setBusy(true);
    try {
      await markSent(c.id, send, text);
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

function Reply({ c, onDone }: { c: WaContact; onDone: () => void }): ReactElement {
  const toast = useToast();
  const [kind, setKind] = useState<WaKind>(c.status === "interested" ? "interested" : "question");
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
      {kind === "interested" ? <TrackPicker c={c} onDone={onDone} /> : null}
      <Draft c={c} kind={kind} send="reply" onDone={onDone} />
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

export function TodayTab({ data, contacts, reload }: { data: WaToday; contacts: WaContact[]; reload: () => void }): ReactElement {
  const s = data.stats;
  const rate = s.messaged ? Math.round((s.replied / s.messaged) * 100) : 0;
  const talking = contacts.filter((c) => c.step > 0 && c.status !== "stop");
  return (
    <>
      <div className="tiles">
        {([[data.sent_today, "Sent today"], [data.queue.length, "Messages to send"], [data.replies.length, "Replies to answer"], [`${rate}%`, "Reply rate"], [s.stopped, "Asked to stop"]] as [string | number, string][]).map(([v, l]) => (
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
          {data.replies.length ? data.replies.map((c) => <Reply key={c.id} c={c} onDone={reload} />) : <span className="k">No replies waiting.</span>}
        </section>
        <section className="card editor">
          <div className="fighead"><h2>Messages to send</h2><span className="k">{data.queue.length} due: after-YES steps first, then live campaigns</span></div>
          {data.queue.length ? data.queue.map((q) => (
            <div key={`${q.kind}-${q.contact.id}`} className="wa-item">
              <Who c={q.contact} note={`${q.kind === "nurture" ? `After YES · ${q.template}` : KIND_LABEL[q.kind]}${q.contact.campaign_name ? ` · ${q.contact.campaign_name}` : ""}`} />
              {q.kind === "nurture" ? <TrackPicker c={q.contact} onDone={reload} /> : null}
              <Draft c={q.contact} kind={q.kind} send={q.kind} onDone={reload} />
            </div>
          )) : <span className="k">Nothing due. Start a campaign in <Link to="/marketing/whatsapp/campaigns">Campaigns</Link>, or add contacts to a live one.</span>}
        </section>
      </div>
      <LogReply contacts={talking} onDone={reload} />
    </>
  );
}
