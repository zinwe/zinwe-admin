import { Fragment, useRef, useState, type DragEvent, type ReactElement } from "react";
import { Modal } from "../../../components/Modal";
import { useToast } from "../../../components/Toast";
import { ApiError } from "../../../lib/api";
import {
  draftFor, markSent, waLink, type WaMedia, type WaTemplate,
  actOn, addWaContact, addWaFile, deleteWaContact, downloadWaTemplate, getWaContact, patchWaContact, reviewWaFile,
  type WaCampaign, type WaChoice, type WaContact, type WaFileRow, type WaNewContact, type WaStatus, type WaTrack,
} from "../../../lib/whatsappApi";
import type { WaCampaignX, WaContactX } from "../../../lib/whatsappApi.tabs";
import { CampaignSection } from "./CampaignContact";
import {
  Bubble, CampaignPill, CATEGORY_LABEL, Count, errText, KIND_LABEL, LANG_LABEL, nameOf, RateChip, SideItem, TRACK_LABEL, TRACKED, TRACKS, trackName, when,
  WaPill, WA_STATUS, WtShell,
} from "./shared";
import { Attach } from "./TodayTab";

/**
 * Send WhatsApp from the contact list: start from any template (filled for this business, the greeting included) or a
 * blank custom message, edit it, Open in WhatsApp, then Mark as sent. A one-off: it never moves their sequence, except
 * a first message to someone who hasn't had one yet, which starts it.
 */
function SendModal({ c, templates, onClose, onSent }: { c: WaContact; templates: WaTemplate[]; onClose: () => void; onSent: () => void }): ReactElement {
  const toast = useToast();
  const [pick, setPick] = useState(0); // 0 = custom message
  const [text, setText] = useState(`${c.salutation ?? `Hi ${c.greet_as}`}, `);
  const [by, setBy] = useState("Custom message");
  const [media, setMedia] = useState<WaMedia | null>(null);
  const [hints, setHints] = useState({ creative: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [opened, setOpened] = useState(false);
  const chosen = templates.find((t) => t.id === pick);
  const older = templates.filter((t) => !t.category && !t.archived);
  const campaignRows = templates.filter((t) => t.category && !t.archived && !t.draft);
  const kinds = [...new Set(older.map((t) => t.kind))];
  const cats = [...new Set(campaignRows.map((t) => t.category))];
  const choose = async (id: number) => {
    setPick(id);
    setOpened(false);
    if (!id) {
      setText(`${c.salutation ?? `Hi ${c.greet_as}`}, `);
      setBy("Custom message");
      setMedia(null);
      setHints({ creative: "", notes: "" });
      return;
    }
    const t = templates.find((x) => x.id === id);
    setBusy(true);
    try {
      const d = await draftFor(c.id, t?.category ? "flow" : t?.kind ?? "first", id);
      setText(d.text);
      setMedia(d.media ?? null);
      setHints({ creative: d.creative ?? "", notes: d.notes ?? "" });
      setBy(d.by === "claude" ? `Personalised by Claude from ${d.template}` : `From the template ${d.template}`);
    } catch (err) {
      toast(errText(err, "Couldn't draft this message."), "bad");
    }
    setBusy(false);
  };
  // A first-message template to someone who hasn't had one starts their sequence; anything else is a one-off.
  // A campaign template (any category) moves the 90-day path: Track checks, steps and status.
  const sendKind = chosen?.category ? "flow" : chosen?.kind === "first" && c.step === 0 ? "first" : "custom";
  const sent = async () => {
    setBusy(true);
    try {
      await markSent(c.id, sendKind, text, chosen?.category ? chosen.id : null);
      toast(sendKind === "first" ? "Marked as sent. Their sequence has started." : sendKind === "flow" ? "Marked as sent. Their campaign path moved on." : "Marked as sent.");
      onSent();
      onClose();
    } catch (err) {
      toast(errText(err, "Couldn't save that."), "bad");
      setBusy(false);
    }
  };
  return (
    <Modal title={`Send WhatsApp to ${nameOf(c)}`} subtitle={`${c.firm} · ${c.phone}`} onClose={onClose}
      footer={<>
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <a className={"btn wa-open" + (opened ? "" : " dark")} href={waLink(c.phone, text)} target="_blank" rel="noreferrer" onClick={() => setOpened(true)} aria-disabled={!text.trim()}>Open in WhatsApp</a>
        <button type="button" className={"btn" + (opened ? " dark" : "")} disabled={busy || !text.trim()} onClick={() => void sent()}>Mark as sent</button>
      </>}>
      <div className="mk wa-send">
        <label className="fl">Start from
          <select className="inp" value={pick} disabled={busy} onChange={(e) => void choose(Number(e.target.value))}>
            <option value={0}>Custom message</option>
            {cats.map((k) => (
              <optgroup key={k} label={`90-day campaign · ${CATEGORY_LABEL[k as keyof typeof CATEGORY_LABEL]}`}>
                {campaignRows.filter((t) => t.category === k).map((t) => (
                  <option key={t.id} value={t.id} disabled={TRACKED.includes(t.category ?? "") && !!c.track && t.track !== c.track}>{t.name}</option>
                ))}
              </optgroup>
            ))}
            {kinds.map((k) => (
              <optgroup key={k} label={KIND_LABEL[k]}>
                {older.filter((t) => t.kind === k).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        <span className="wa-by">{busy ? "Drafting…" : by}</span>
        <textarea className="inp" rows={9} maxLength={2000} aria-label={`Message to ${nameOf(c)}`} value={text} onChange={(e) => setText(e.target.value)} />
        <span className="k">{text.length} characters · {sendKind === "first" ? "Sending this starts their sequence: the follow-up comes on schedule." : sendKind === "flow" ? "A campaign template: sending it moves their 90-day path." : "A one-off: their sequence doesn’t move."}</span>
        {media ? <Attach media={media} /> : null}
        {hints.creative && !media ? <p className="k wa-hint"><b>Creative:</b> {hints.creative}</p> : null}
        {hints.notes ? <details className="wa-hint"><summary className="k">Notes for replies (not sent)</summary><p className="k">{hints.notes}</p></details> : null}
        <span className="k">Open in WhatsApp fills the chat on the Zinwe WhatsApp Business number. Press Send there, then Mark as sent here.</span>
      </div>
    </Modal>
  );
}

const RESULT: Record<WaFileRow["result"], string> = { ready: "good", warn: "warn", locked: "", bad: "bad" };
const COLUMNS = ["Business Name", "Phone", "Segment", "Country", "City", "Opt-in (Y or blank)"];
const OPTIONAL = ["First Name", "Source", "Useful Info"];

function Upload({ campaigns, onAdded }: { campaigns: WaCampaign[]; onAdded: () => void }): ReactElement {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<WaFileRow[] | null>(null);
  const [choices, setChoices] = useState<Record<string, WaChoice>>({});
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);

  const review = async (picked: File | undefined) => {
    if (!picked) return;
    setBusy(true);
    setProblem("");
    try {
      const r = await reviewWaFile(picked);
      setFile(picked);
      setRows(r.rows);
      setChoices(Object.fromEntries(r.rows.map((x) => [String(x.row), { include: x.result !== "bad", segment: x.segment, campaign: null }])));
    } catch (err) {
      setProblem(errText(err, "Couldn't read that file."));
    }
    setBusy(false);
    if (input.current) input.current.value = "";
  };
  const set = (row: number, patch: Partial<WaChoice>) => setChoices((c) => ({ ...c, [row]: { ...c[row], ...patch } }));
  const add = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const r = await addWaFile(file, choices);
      toast(`${r.added} contact${r.added === 1 ? "" : "s"} added. Nothing was sent.`);
      setRows(null);
      setFile(null);
      onAdded();
    } catch (err) {
      setProblem(errText(err, "Couldn't add those."));
    }
    setBusy(false);
  };
  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    void review(e.dataTransfer.files[0]);
  };

  if (rows) {
    const keep = rows.filter((r) => r.result !== "bad" && choices[r.row]?.include).length;
    const locked = rows.filter((r) => r.result === "locked" && choices[r.row]?.include).length;
    const segments = [...new Set(rows.map((r) => r.segment).filter(Boolean))];
    return (
      <div className="editor">
        <div className="fighead"><h2>Check each row</h2><span className="k">{file?.name} · {keep} to add{locked ? `, ${locked} of them locked until they opt in` : ""}</span></div>
        <div className="scroll">
          <table className="tbl">
            <caption className="sr">Rows to review</caption>
            <thead><tr><th scope="col">Row</th><th scope="col">Business and number</th><th scope="col">Check</th><th scope="col">Segment</th><th scope="col">Campaign</th><th scope="col">Add</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const ch = choices[r.row];
                const bad = r.result === "bad";
                return (
                  <tr key={r.row}>
                    <td className="num">{r.row}</td>
                    <th scope="row">{r.firm || "—"}<span className="k" style={{ display: "block" }}>{r.phone || "No number"} · {r.city || "—"}</span></th>
                    <td><span className={"pill " + RESULT[r.result]}>{r.message}</span></td>
                    <td>
                      <input className="inp" list="wa-segments" aria-label={`Segment for row ${r.row}`} value={ch?.segment ?? ""} disabled={bad} onChange={(e) => set(r.row, { segment: e.target.value })} />
                    </td>
                    <td>
                      <select className="inp" aria-label={`Campaign for row ${r.row}`} value={ch?.campaign ?? 0} disabled={bad} onChange={(e) => set(r.row, { campaign: Number(e.target.value) || null })}>
                        <option value={0}>No campaign yet</option>
                        {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </td>
                    <td><input type="checkbox" aria-label={`Add row ${r.row}`} checked={!bad && !!ch?.include} disabled={bad} onChange={(e) => set(r.row, { include: e.target.checked })} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <datalist id="wa-segments">{segments.map((s) => <option key={s} value={s} />)}</datalist>
        </div>
        {problem ? <span className="aferr" role="alert">{problem}</span> : null}
        <div className="fr between">
          <button type="button" className="btn" disabled={busy} onClick={() => { setRows(null); setFile(null); }}>Choose another file</button>
          <button type="button" className="btn dark" disabled={busy || !keep} onClick={() => void add()}>{keep ? `Add ${keep} contact${keep === 1 ? "" : "s"}` : "Nothing to add"}</button>
        </div>
      </div>
    );
  }
  return (
    <div className="editor">
      <div className="fighead">
        <h2>Upload a contact sheet</h2>
        <button type="button" className="btn sm" onClick={() => void downloadWaTemplate().catch(() => toast("Couldn't download the template.", "bad"))}>Download template</button>
      </div>
      <div className="fmt" aria-label="Columns">
        {COLUMNS.map((c) => <span key={c}>{c}</span>)}
        {OPTIONAL.map((c) => <span key={c}>{c} <em>optional</em></span>)}
      </div>
      <label className={"dropz" + (over ? " over" : "")} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={drop}>
        <input ref={input} className="sr" type="file" accept=".xlsx,.csv" aria-label="Choose a contact file" onChange={(e) => void review(e.target.files?.[0])} />
        <b>{busy ? "Reading your file" : "Drop your Excel file here, or click to choose"}</b>
        <span className="k">.xlsx or .csv. Phone with country code, or a 10-digit number for India or the USA. You check every row before anything is added. Rows without opt-in are added locked: Zinwe drafts nothing for them until you mark them opted in. Numbers that asked to stop are always skipped.</span>
      </label>
      {problem ? <span className="aferr" role="alert">{problem}</span> : null}
    </div>
  );
}

const EMPTY: WaNewContact = {
  firm: "", phone: "", segment: "", country: "India", city: "", first_name: "", source: "", campaign: null,
  opted_in: false, opt_in_note: "", notes: "",
};

/**
 * One contact by hand. "Save and add next" keeps segment, country, city, source, campaign and opt-in, so a run of
 * businesses from one list goes in fast; only the business, phone, first name and notes clear.
 */
function AddOne({ campaigns, segments, onAdded, onClose }: { campaigns: WaCampaign[]; segments: string[]; onAdded: () => void; onClose: () => void }): ReactElement {
  const toast = useToast();
  const first = useRef<HTMLInputElement>(null);
  const [f, setF] = useState<WaNewContact>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState<string[]>([]);
  const set = (patch: Partial<WaNewContact>) => {
    setF((x) => ({ ...x, ...patch }));
    setErrors((e) => {
      const next = { ...e };
      for (const k of Object.keys(patch)) delete next[k];
      return next;
    });
  };
  const save = async (next: boolean) => {
    setBusy(true);
    try {
      const c = await addWaContact(f);
      onAdded();
      setAdded((a) => [c.firm, ...a]);
      toast(`${c.firm} added${c.opted_in ? "" : ", locked until they opt in"}. Nothing was sent.`);
      if (next) {
        setF((x) => ({ ...x, firm: "", phone: "", first_name: "", notes: "" }));
        setErrors({});
        first.current?.focus();
      } else onClose();
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setErrors(err.fields);
      else toast(errText(err, "Couldn't add this contact."), "bad");
    }
    setBusy(false);
  };
  const field = (key: keyof WaNewContact, label: string, input: ReactElement, help?: string) => (
    <label className={"fl" + (errors[key] ? " has-err" : "")}>
      {label}
      {input}
      {errors[key] ? <span className="aferr" role="alert">{errors[key]}</span> : help ? <span className="k">{help}</span> : null}
    </label>
  );
  const ready = f.firm.trim() && f.phone.trim() && f.segment.trim() && f.city.trim();
  return (
    <form className="editor wa-addone" noValidate onSubmit={(e) => { e.preventDefault(); void save(true); }}>
      <div className="wa-addone__grid">
        {field("firm", "Business name *", <input ref={first} className="inp" maxLength={160} autoFocus value={f.firm} onChange={(e) => set({ firm: e.target.value })} />)}
        {field("phone", "WhatsApp number *", <input className="inp" inputMode="tel" maxLength={30} placeholder="+91 98100 00000" value={f.phone} onChange={(e) => set({ phone: e.target.value })} />, "Country code, or 10 digits for India or the USA")}
        {field("first_name", "First name", <input className="inp" maxLength={80} value={f.first_name} onChange={(e) => set({ first_name: e.target.value })} />, "Only if you know the person’s name")}
        {field("segment", "Segment *", <input className="inp" list="wa-add-segments" maxLength={120} placeholder="Example: Digital marketing agency" value={f.segment} onChange={(e) => set({ segment: e.target.value })} />)}
        {field("country", "Country *", (
          <select className="inp" value={f.country} onChange={(e) => set({ country: e.target.value as WaNewContact["country"] })}>
            <option>India</option>
            <option>USA</option>
          </select>
        ))}
        {field("city", "City *", <input className="inp" maxLength={80} value={f.city} onChange={(e) => set({ city: e.target.value })} />)}
        {field("source", "Where you found them", <input className="inp" maxLength={160} placeholder="Example: LinkedIn, referral from Amit" value={f.source} onChange={(e) => set({ source: e.target.value })} />)}
        {field("campaign", "Campaign", (
          <select className="inp" value={f.campaign ?? 0} onChange={(e) => set({ campaign: Number(e.target.value) || null })}>
            <option value={0}>No campaign yet</option>
            {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        ))}
      </div>
      {field("notes", "Notes for the first message", <textarea className="inp" rows={2} maxLength={500} placeholder="Example: just opened a second office in Pune" value={f.notes} onChange={(e) => set({ notes: e.target.value })} />, "Used for the personal first line. Only true things.")}
      <div className="wa-addone__optin">
        <label className="wa-check">
          <input type="checkbox" checked={f.opted_in} onChange={(e) => set({ opted_in: e.target.checked })} />
          <span><b>They agreed to hear from us on WhatsApp</b> <span className="k">Replied to an email, said yes on LinkedIn, or were introduced</span></span>
        </label>
        {f.opted_in ? field("opt_in_note", "How did they agree?", <input className="inp" maxLength={200} placeholder="Example: said yes by email on 5 Nov" value={f.opt_in_note} onChange={(e) => set({ opt_in_note: e.target.value })} />)
          : <span className="k">Without this they’re added locked: Zinwe drafts nothing for them until you mark them opted in.</span>}
      </div>
      <datalist id="wa-add-segments">{segments.map((s) => <option key={s} value={s} />)}</datalist>
      <div className="fr between">
        <span className="k">{added.length ? `${added.length} added: ${added.slice(0, 3).join(", ")}${added.length > 3 ? "…" : ""}` : "Nothing is sent when you add a contact."}</span>
        <div className="fr">
          <button type="button" className="btn" disabled={busy || !ready} onClick={() => void save(false)}>Save and close</button>
          <button type="submit" className="btn dark" disabled={busy || !ready}>Save and add next</button>
        </div>
      </div>
    </form>
  );
}

/** One dialog for both ways in: one contact by hand, or a whole sheet. */
function AddContacts({ campaigns, segments, onAdded, onClose }: { campaigns: WaCampaign[]; segments: string[]; onAdded: () => void; onClose: () => void }): ReactElement {
  const [tab, setTab] = useState<"one" | "sheet">("one");
  return (
    <Modal title="Add contacts" subtitle="Nothing is sent. Contacts wait in the list until a campaign is live." onClose={onClose}>
      <div className="mk wa-addbox">
        <div className="seg" role="tablist" aria-label="How to add">
          <button type="button" role="tab" aria-selected={tab === "one"} className={tab === "one" ? "on" : ""} onClick={() => setTab("one")}>Add one</button>
          <button type="button" role="tab" aria-selected={tab === "sheet"} className={tab === "sheet" ? "on" : ""} onClick={() => setTab("sheet")}>Upload a sheet</button>
        </div>
        {tab === "one"
          ? <AddOne campaigns={campaigns} segments={segments} onAdded={onAdded} onClose={onClose} />
          : <Upload campaigns={campaigns} onAdded={() => { onAdded(); onClose(); }} />}
      </div>
    </Modal>
  );
}

/** A locked contact: nobody messages them until someone records how they agreed. */
function OptIn({ c, run }: { c: WaContact; run: (work: () => Promise<WaContact | null>, done: string) => Promise<void> }): ReactElement {
  const [note, setNote] = useState("");
  if (c.opted_in) return <p className="k">Opted in: {c.opt_in_note || "before opt-in was recorded"}</p>;
  return (
    <div className="mk-sec wa-locked">
      <h3>Not opted in yet</h3>
      <span className="k">Zinwe won’t draft or queue a WhatsApp message for this business until they agree, for example after a yes by email or LinkedIn, or an introduction.</span>
      <label className="fl">How did they agree?<input className="inp" maxLength={200} value={note} placeholder="Example: said yes by email on 5 Nov" onChange={(e) => setNote(e.target.value)} /></label>
      <button type="button" className="btn sm dark mk-start" disabled={!note.trim()} onClick={() => void run(() => actOn(c.id, "optin", note), "Marked as opted in.")}>Mark as opted in</button>
    </div>
  );
}

/** Most sheet "first names" are scraps of the business name, so drafts only use one that clearly is a person's. */
function FirstName({ c, run }: { c: WaContact; run: (work: () => Promise<WaContact | null>, done: string) => Promise<void> }): ReactElement {
  const [value, setValue] = useState(c.first_name);
  const save = () => {
    if (value.trim() !== c.first_name) void run(() => patchWaContact(c.id, { first_name: value.trim() }), "First name saved.");
  };
  return (
    <div className="mk-sec">
      <label className="fl">First name <span className="k">Leave empty if you don’t know their name</span>
        <input className="inp" maxLength={80} value={value} onChange={(e) => setValue(e.target.value)} onBlur={save} onKeyDown={(e) => { if (e.key === "Enter") save(); }} />
      </label>
      <span className="k">Messages open with <b>{c.salutation ?? `Hi ${c.greet_as}`},</b>{c.first_name && !c.greet_as.endsWith(" team") ? "" : c.first_name ? " because this doesn’t look like a person’s name." : ""}</span>
    </div>
  );
}

function ContactDrawer({ id, campaigns, onClose, onChanged }: { id: number; campaigns: WaCampaign[]; onClose: () => void; onChanged: () => void }): ReactElement {
  const toast = useToast();
  const [c, setC] = useState<WaContact | null>(null);
  const [loaded, setLoaded] = useState(0);
  if (loaded !== id) {
    setLoaded(id);
    void getWaContact(id).then(setC).catch((err) => toast(errText(err, "Couldn't load this contact."), "bad"));
  }
  const run = async (work: () => Promise<WaContact | null>, done: string) => {
    try {
      const next = await work();
      if (next) setC(next);
      toast(done);
      onChanged();
    } catch (err) {
      toast(errText(err, "Couldn't save that."), "bad");
    }
  };
  const info = c ? Object.entries(c.info ?? {}) : [];
  return (
    <Modal title={c ? nameOf(c) : "Contact"} subtitle={c ? `${c.firm} · ${c.phone}` : undefined} size="drawer" onClose={onClose}
      footer={<button type="button" className="btn" onClick={onClose}>Close</button>}>
      {c ? (
        <div className="mk mk-drawer">
          <div className="fr"><WaPill s={c.status} />{c.opted_in ? null : <span className="pill">Not opted in</span>}{c.paused_until ? <span className="pill">Paused until {when(c.paused_until)}</span> : null}</div>
          <OptIn c={c} run={run} />
          <FirstName c={c} run={run} />
          <dl>
            <dt>Segment</dt><dd>{c.segment}</dd>
            <dt>City</dt><dd>{c.city}, {c.country}</dd>
            <dt>Source</dt><dd>{c.source}</dd>
            {info.map(([k, v]) => <Fragment key={k}><dt>{k.replace(/_/g, " ")}</dt><dd>{v}</dd></Fragment>)}
          </dl>
          <label className="fl">Campaign
            <select className="inp" value={c.campaign ?? 0} onChange={(e) => void run(() => patchWaContact(c.id, { campaign: Number(e.target.value) || null }), "Campaign changed.")}>
              <option value={0}>No campaign</option>
              {campaigns.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
          {c.plan === "ninety" ? <CampaignSection c={c} run={run} /> : (
            <label className="fl">After-YES sequence {c.yes_date ? <span className="k">YES on {when(c.yes_date)}</span> : null}
              <select className="inp" value={c.track} onChange={(e) => void run(() => patchWaContact(c.id, { track: e.target.value as WaTrack }), "Sequence changed.")}>
                {(Object.keys(TRACK_LABEL) as WaTrack[]).map((t) => <option key={t} value={t}>{t ? TRACK_LABEL[t] : "Not chosen yet"}</option>)}
              </select>
            </label>
          )}
          <div className="mk-sec">
            <h3>Options for this contact</h3>
            <div className="mk-acts">
              <button type="button" className="btn sm" onClick={() => void run(() => actOn(c.id, "interested"), "Marked as interested.")}>Mark interested</button>
              <button type="button" className="btn sm" onClick={() => void run(() => actOn(c.id, "signed"), "Marked as signed up.")}>Mark signed up</button>
              {c.paused_until
                ? <button type="button" className="btn sm" onClick={() => void run(() => actOn(c.id, "resume"), "Resumed.")}>Resume</button>
                : <button type="button" className="btn sm" onClick={() => void run(() => actOn(c.id, "pause"), "Paused for 30 days.")}>Pause 30 days</button>}
              <button type="button" className="btn sm" onClick={() => void run(() => actOn(c.id, "notnow"), "Saved as not now.")}>Not now</button>
              <button type="button" className="btn sm danger" disabled={c.status === "stop"} onClick={() => void run(() => actOn(c.id, "stop"), "This number will never be messaged again.")}>Do not message</button>
              <button type="button" className="btn sm danger" disabled={(c.messages ?? []).length > 0} onClick={() => void run(async () => { await deleteWaContact(c.id); onClose(); return null; }, "Contact removed.")}>Remove contact</button>
            </div>
          </div>
          <div className="mk-sec">
            <h3>Conversation</h3>
            <div className="wa-chat">
              {(c.messages ?? []).length ? (c.messages ?? []).map((m) => <Bubble key={m.id} text={m.text} mine={m.kind !== "theirs"} meta={`${when(m.at)}${m.label ? ` · ${m.label}` : ""}${m.by && m.kind !== "theirs" ? ` · ${m.by}` : ""}`} />) : <span className="k">Nothing sent yet.</span>}
            </div>
          </div>
        </div>
      ) : <span className="k">Loading…</span>}
    </Modal>
  );
}

const VIEWS: [string, string, (c: WaContact) => boolean][] = [
  ["all", "All contacts", () => true],
  ["locked", "Not opted in", (c) => !c.opted_in],
  ["ready", "Ready", (c) => c.status === "ready" && c.opted_in],
  ["talking", "In conversation", (c) => c.status === "messaged" || c.status === "replied"],
  ["won", "Interested or signed up", (c) => c.status === "interested" || c.status === "signed"],
  ["track", "Track to set", (c) => c.plan === "ninety" && !!c.yes_date && !c.track && c.campaign_status !== "paid" && c.campaign_status !== "opted_out"],
  ["stop", "Do not message", (c) => c.status === "stop"],
];
const VIEW_SUB: Record<string, string> = {
  all: "Everyone you may message", locked: "Locked until they agree", ready: "Opted in, not messaged yet", talking: "Messaged or replied",
  won: "Their YES, or a signup", track: "YES, Track still Unassigned", stop: "Never again, any campaign",
};
type TrackKey = Exclude<WaTrack, ""> | "unassigned";
const trackKey = (c: WaContact): TrackKey | null => (c.track ? (c.track as TrackKey) : c.plan === "ninety" ? "unassigned" : null);
/** The contact's language: their first message's (wa3 `lang`), else the campaign's when it has one language. */
const langOf = (c: WaContactX, camps: Map<number, WaCampaignX>): "en" | "hi" | "" => {
  if (c.lang === "en" || c.lang === "hi") return c.lang;
  const l = c.campaign ? camps.get(c.campaign)?.language : undefined;
  return l === "en" || l === "hi" ? l : "";
};
const SEG_SHOWN = 8;

export function ContactsTab({ contacts: all, campaigns, templates, reload }: { contacts: WaContact[]; campaigns: WaCampaign[]; templates: WaTemplate[]; reload: () => void }): ReactElement {
  const contacts = all as WaContactX[];
  const [view, setView] = useState("all");
  const [camp, setCamp] = useState<number | "none" | null>(null);
  const [track, setTrack] = useState<TrackKey | null>(null);
  const [seg, setSeg] = useState("");
  const [lang, setLang] = useState<"en" | "hi" | null>(null);
  const [allSegs, setAllSegs] = useState(false);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(0);
  const [adding, setAdding] = useState(false);
  const [sending, setSending] = useState<WaContact | null>(null);
  const camps = new Map((campaigns as WaCampaignX[]).filter((c) => c.id).map((c) => [c.id as number, c]));
  const test = VIEWS.find((v) => v[0] === view)?.[2] ?? (() => true);
  const segCount = new Map<string, number>();
  contacts.forEach((c) => segCount.set(c.segment, (segCount.get(c.segment) ?? 0) + 1));
  const segments = [...segCount.keys()].sort();
  const segRank = [...segCount.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const needle = q.trim().toLowerCase();
  const rows = contacts.filter((c) => test(c)
    && (camp === null || (camp === "none" ? !c.campaign : c.campaign === camp))
    && (!track || trackKey(c) === track)
    && (!seg || c.segment === seg)
    && (!lang || langOf(c, camps) === lang)
    && (!needle || `${c.firm} ${c.first_name} ${c.phone} ${c.city}`.toLowerCase().includes(needle)));
  const tracked = contacts.some((c) => trackKey(c));
  const langCount = { en: contacts.filter((c) => langOf(c, camps) === "en").length, hi: contacts.filter((c) => langOf(c, camps) === "hi").length };
  const filters = [
    camp !== null ? (camp === "none" ? "No campaign" : camps.get(camp)?.name ?? "Campaign") : "",
    track ? (track === "unassigned" ? "Track Unassigned" : TRACK_LABEL[track]) : "", seg, lang ? LANG_LABEL[lang] : "",
  ].filter(Boolean);
  const viewLabel = VIEWS.find((v) => v[0] === view)?.[1] ?? "All contacts";
  const title = view === "all" && filters.length === 1 ? filters[0] : viewLabel;
  const clear = () => { setView("all"); setCamp(null); setTrack(null); setSeg(""); setLang(null); setQ(""); };
  const optedIn = rows.filter((c) => c.opted_in && c.status !== "stop").length;
  const messaged = rows.filter((c) => c.step > 0).length;
  const replied = rows.filter((c) => ["replied", "interested", "signed", "notnow"].includes(c.status)).length;
  const lead = filters.length && !(view === "all" && filters.length === 1) ? `${filters.join(" · ")}. ` : "";
  const desc = view === "all" && !filters.length ? "Everyone you may message on WhatsApp. Click a business to open it; Send WhatsApp sends a one-off." : view === "all" ? "" : `${VIEW_SUB[view]}.`;

  return (
    <>
      <WtShell label="Contact filters" current={title} side={(close) => {
        const after = (f: () => void) => () => { f(); close(); };
        return (
          <>
            <button type="button" className="wt-new" onClick={after(() => setAdding(true))}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
              Add contacts
            </button>
            <label className="wt-search">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
              <input type="search" aria-label="Search contacts" placeholder="Search business, name, phone or city" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
            <div className="wt-sec" role="group" aria-label="Show">
              {VIEWS.map(([k, label, f]) => (
                <SideItem key={k} on={view === k} onPick={after(() => setView(k))} label={label} sub={VIEW_SUB[k]}
                  chip={<Count n={contacts.filter(f).length} quiet={k === "all" || k === "ready" || k === "stop"} />} />
              ))}
            </div>
            {campaigns.length ? (
              <div className="wt-sec" role="group" aria-label="Campaign">
                <div className="wt-sech"><span>CAMPAIGN</span></div>
                {(campaigns as WaCampaignX[]).map((x) => {
                  const n = contacts.filter((c) => c.campaign === x.id).length;
                  const st = x.stats;
                  const state = x.status === "live" ? " · Live" : x.status === "paused" ? " · Paused" : x.status ? " · Draft" : "";
                  return (
                    <SideItem key={x.id} on={camp === x.id} onPick={after(() => setCamp(camp === x.id ? null : x.id as number))} label={x.name}
                      sub={`${n} contact${n === 1 ? "" : "s"}${state}`}
                      chip={<RateChip replied={x.replies ?? st?.replied ?? 0} sent={x.sent ?? st?.messaged ?? 0} />} />
                  );
                })}
                <SideItem on={camp === "none"} onPick={after(() => setCamp(camp === "none" ? null : "none"))} label="No campaign" sub="Waiting for one" chip={<Count n={contacts.filter((c) => !c.campaign).length} quiet />} />
              </div>
            ) : null}
            {tracked ? (
              <div className="wt-sec" role="group" aria-label="Track">
                <div className="wt-sech"><span>TRACK</span></div>
                {([...TRACKS, "unassigned"] as TrackKey[]).map((t) => (
                  <SideItem key={t} on={track === t} onPick={after(() => setTrack(track === t ? null : t))} label={t === "unassigned" ? "Unassigned" : TRACK_LABEL[t]}
                    sub={t === "unassigned" ? "100 Reviews, no Track yet" : "From their Engage answer"} chip={<Count n={contacts.filter((c) => trackKey(c) === t).length} quiet={t !== "unassigned"} />} />
                ))}
              </div>
            ) : null}
            {segments.length ? (
              <div className="wt-sec" role="group" aria-label="Segment">
                <div className="wt-sech"><span>SEGMENT</span>{segRank.length > SEG_SHOWN ? <button type="button" aria-expanded={allSegs} onClick={() => setAllSegs((o) => !o)}>{allSegs ? "Fewer" : `All ${segRank.length}`}</button> : null}</div>
                {(allSegs ? segRank : segRank.slice(0, SEG_SHOWN)).map(([s, n]) => (
                  <SideItem key={s} on={seg === s} onPick={after(() => setSeg(seg === s ? "" : s))} label={s || "No segment"} chip={<Count n={n} quiet />} />
                ))}
                {seg && !allSegs && !segRank.slice(0, SEG_SHOWN).some(([s]) => s === seg) ? <SideItem on onPick={after(() => setSeg(""))} label={seg} chip={<Count n={segCount.get(seg) ?? 0} quiet />} /> : null}
              </div>
            ) : null}
            {langCount.en || langCount.hi ? (
              <div className="wt-sec" role="group" aria-label="Language">
                <div className="wt-sech"><span>LANGUAGE</span></div>
                {(["en", "hi"] as const).map((l) => (
                  <SideItem key={l} on={lang === l} onPick={after(() => setLang(lang === l ? null : l))} label={LANG_LABEL[l]} sub="First message, or the campaign" chip={<Count n={langCount[l]} quiet />} />
                ))}
              </div>
            ) : null}
          </>
        );
      }}>
        <div className="wt-head">
          <div><h2>{title}</h2><p>{lead}{desc}</p></div>
          <div className="wt-tools">
            {filters.length || view !== "all" || needle ? <button type="button" className="wt-btn is-ghost" onClick={clear}>Clear filters</button> : null}
            <button type="button" className="wt-btn is-dark" onClick={() => setAdding(true)}>Add contacts</button>
          </div>
        </div>
        <div className="wt-stats" aria-label="These contacts">
          <span><b>{rows.length}</b> of {contacts.length} contacts</span><span>·</span>
          <span><b>{optedIn}</b> can be messaged</span><span>·</span>
          <span><b>{messaged}</b> messaged</span><span>·</span>
          <span>replied</span><RateChip replied={replied} sent={messaged} />
        </div>
        <div className="wtx-tablebox" aria-label="WhatsApp contacts">
          <table className="tbl wtx-ctable">
            <caption className="sr">WhatsApp contacts</caption>
            <thead><tr><th scope="col">Business</th><th scope="col" className="c-opt c-wide">Phone</th><th scope="col" className="c-opt c-wide">Segment</th><th scope="col" className="c-trk">Track</th><th scope="col">Status</th><th scope="col" className="c-opt">Day · step</th><th scope="col" className="c-opt">Campaign</th><th scope="col" className="c-opt c-wide">Latest</th><th scope="col"><span className="sr">Send</span></th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="click" onClick={() => setOpen(c.id)}>
                  <th scope="row"><button type="button" className="cobtn wtx-ell" title={c.firm} onClick={(e) => { e.stopPropagation(); setOpen(c.id); }}>{c.short_name || c.firm}</button><span className="k wtx-ell">{c.salutation ?? `Hi ${c.greet_as}`} · {c.city}</span></th>
                  <td className="num c-opt c-wide">{c.phone}</td>
                  <td className="c-opt c-wide"><span className="wtx-ell" title={c.segment}>{c.segment}</span></td>
                  <td className="c-trk">{c.plan === "ninety" || c.track ? <span className={"pill wtx-trk" + (c.track ? "" : " wa-todo")} title={trackName(c.track)}>{trackName(c.track)}</span> : <span className="k">—</span>}</td>
                  <td>{!c.opted_in ? <span className="pill" title="Locked until they opt in">Not opted in</span> : c.plan === "ninety" ? <CampaignPill s={c.campaign_status} /> : <WaPill s={c.status as WaStatus} />}</td>
                  <td className="c-opt">{c.step_label ? <span className="wtx-ell" title={`${c.step_label}${c.next_due ? ` · next due ${when(c.next_due)}` : ""}`}>{c.step_label}</span> : c.day ? <span className="num">{c.day} · S{c.stage}</span> : <span className="k">—</span>}</td>
                  <td className="c-opt">{c.campaign_name ? <span className="wtx-ell" title={c.campaign_name}>{c.campaign_name}</span> : <span className="k">None</span>}</td>
                  <td className="k c-opt c-wide">{c.last ? `${c.last.kind === "theirs" ? "They wrote" : "Sent"} ${when(c.last.at)}` : WA_STATUS[c.status][0]}</td>
                  <td className="wa-sendcell">
                    <button type="button" className="wt-btn" aria-label="Send WhatsApp" disabled={!c.opted_in || c.status === "stop"}
                      title={c.status === "stop" ? "Asked to stop: never message them" : !c.opted_in ? "Not opted in yet: mark them opted in first" : undefined}
                      onClick={(e) => { e.stopPropagation(); setSending(c); }}>Send</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length ? null : <div className="wt-empty">{contacts.length ? "No contacts match." : "No contacts yet. Use Add contacts to type one in or upload a sheet."}</div>}
        </div>
        <div className="wt-foot">Segment is the business type, set when they are added. Track is what they want, set from their Engage answer. Every send and reply updates Status, Day and Latest.</div>
      </WtShell>
      {sending ? <SendModal c={sending} templates={templates} onClose={() => setSending(null)} onSent={reload} /> : null}
      {adding ? <AddContacts campaigns={campaigns} segments={segments} onAdded={reload} onClose={() => setAdding(false)} /> : null}
      {open ? <ContactDrawer id={open} campaigns={campaigns} onClose={() => setOpen(0)} onChanged={reload} /> : null}
    </>
  );
}
