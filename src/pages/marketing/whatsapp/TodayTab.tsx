import { useEffect, useState, type ReactElement } from "react";
import { Link } from "react-router-dom";
import { actOn, draftFor, logReply, markSent, waLink, type WaContact, type WaKind, type WaToday } from "../../../lib/whatsappApi";
import { useToast } from "../../../components/Toast";
import { Bubble, errText, initials, nameOf } from "./shared";

/** One draft: Claude's (or the template's) text, editable, with Open in WhatsApp and Mark as sent. */
function Draft({ c, kind, send, onDone }: { c: WaContact; kind: WaKind; send: "first" | "followup" | "reply"; onDone: () => void }): ReactElement {
  const toast = useToast();
  const [text, setText] = useState("");
  const [by, setBy] = useState("");
  const [busy, setBusy] = useState(true);
  const [opened, setOpened] = useState(false);
  const load = () => {
    setBusy(true);
    draftFor(c.id, kind)
      .then((d) => { setText(d.text); setBy(d.by === "claude" ? `Personalised by Claude from ${d.template}` : `From the template ${d.template}`); })
      .catch((err) => toast(errText(err, "Couldn't draft this message."), "bad"))
      .finally(() => setBusy(false));
  };
  useEffect(load, [c.id, kind]); // eslint-disable-line react-hooks/exhaustive-deps
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
          <div className="fighead"><h2>Messages to send</h2><span className="k">{data.queue.length} due in live campaigns</span></div>
          {data.queue.length ? data.queue.map((q) => (
            <div key={q.contact.id} className="wa-item">
              <Who c={q.contact} note={q.kind === "followup" ? "Follow-up" : "First message"} />
              <Draft c={q.contact} kind={q.kind} send={q.kind} onDone={reload} />
            </div>
          )) : <span className="k">Nothing due. Start a campaign in <Link to="/marketing/whatsapp/campaigns">Campaigns</Link>, or add contacts to a live one.</span>}
        </section>
      </div>
      <LogReply contacts={talking} onDone={reload} />
    </>
  );
}
