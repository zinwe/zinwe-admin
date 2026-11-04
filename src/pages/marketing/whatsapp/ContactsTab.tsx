import { Fragment, useRef, useState, type DragEvent, type ReactElement } from "react";
import { Modal } from "../../../components/Modal";
import { useToast } from "../../../components/Toast";
import { ApiError } from "../../../lib/api";
import {
  actOn, addWaContact, addWaFile, deleteWaContact, downloadWaTemplate, getWaContact, patchWaContact, reviewWaFile,
  type WaCampaign, type WaChoice, type WaContact, type WaFileRow, type WaNewContact, type WaStatus, type WaTrack,
} from "../../../lib/whatsappApi";
import { Bubble, errText, nameOf, TRACK_LABEL, when, WaPill, WA_STATUS } from "./shared";

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
      <span className="k">Messages open with <b>Hi {c.greet_as},</b>{c.first_name && !c.greet_as.endsWith(" team") ? "" : c.first_name ? " because this doesn’t look like a person’s name." : ""}</span>
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
          <label className="fl">After-YES sequence {c.yes_date ? <span className="k">YES on {when(c.yes_date)}</span> : null}
            <select className="inp" value={c.track} onChange={(e) => void run(() => patchWaContact(c.id, { track: e.target.value as WaTrack }), "Sequence changed.")}>
              {(Object.keys(TRACK_LABEL) as WaTrack[]).map((t) => <option key={t} value={t}>{t ? TRACK_LABEL[t] : "Not chosen yet"}</option>)}
            </select>
          </label>
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
              {(c.messages ?? []).length ? (c.messages ?? []).map((m) => <Bubble key={m.id} text={m.text} mine={m.kind !== "theirs"} meta={`${when(m.at)}${m.by && m.kind !== "theirs" ? ` · ${m.by}` : ""}`} />) : <span className="k">Nothing sent yet.</span>}
            </div>
          </div>
        </div>
      ) : <span className="k">Loading…</span>}
    </Modal>
  );
}

const VIEWS: [string, string, (c: WaContact) => boolean][] = [
  ["all", "All", () => true],
  ["locked", "Not opted in", (c) => !c.opted_in],
  ["ready", "Ready", (c) => c.status === "ready" && c.opted_in],
  ["talking", "In conversation", (c) => c.status === "messaged" || c.status === "replied"],
  ["won", "Interested or signed up", (c) => c.status === "interested" || c.status === "signed"],
  ["stop", "Do not message", (c) => c.status === "stop"],
];

export function ContactsTab({ contacts, campaigns, reload }: { contacts: WaContact[]; campaigns: WaCampaign[]; reload: () => void }): ReactElement {
  const [view, setView] = useState("all");
  const [seg, setSeg] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(0);
  const [adding, setAdding] = useState(false);
  const test = VIEWS.find((v) => v[0] === view)?.[2] ?? (() => true);
  const segments = [...new Set(contacts.map((c) => c.segment))].sort();
  const needle = q.trim().toLowerCase();
  const rows = contacts.filter((c) => test(c) && (!seg || c.segment === seg) && (!needle || `${c.firm} ${c.first_name} ${c.phone} ${c.city}`.toLowerCase().includes(needle)));
  return (
    <>
      <section className="card finder" aria-label="Find contacts">
        <div className="fr">
          <button type="button" className="btn dark" onClick={() => setAdding(true)}>Add contacts</button>
          <div className="search"><input type="search" className="inp" aria-label="Search contacts" placeholder="Search business, name, phone or city" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <select className={"inp" + (seg ? " set" : "")} aria-label="Segment" value={seg} onChange={(e) => setSeg(e.target.value)}>
            <option value="">All segments</option>
            {segments.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="fr" role="group" aria-label="Show">
          {VIEWS.map(([k, label, f]) => <button key={k} type="button" className={"chip" + (view === k ? " on" : "")} aria-pressed={view === k} onClick={() => setView(k)}>{label} <span className="k">{contacts.filter(f).length}</span></button>)}
        </div>
      </section>
      <section className="card tablebox" aria-label="WhatsApp contacts">
        <div className="scroll">
          <table className="tbl">
            <caption className="sr">WhatsApp contacts</caption>
            <thead><tr><th scope="col">Business</th><th scope="col">Phone</th><th scope="col">Segment</th><th scope="col">Status</th><th scope="col">Campaign</th><th scope="col">Latest</th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="click" onClick={() => setOpen(c.id)}>
                  <th scope="row"><button type="button" className="cobtn" onClick={(e) => { e.stopPropagation(); setOpen(c.id); }}>{c.short_name || c.firm}</button><span className="k" style={{ display: "block" }}>Hi {c.greet_as} · {c.city}</span></th>
                  <td className="num">{c.phone}</td>
                  <td>{c.segment}</td>
                  <td>{c.opted_in ? <WaPill s={c.status as WaStatus} /> : <span className="pill" title="Locked until they opt in">Not opted in</span>}</td>
                  <td>{c.campaign_name || <span className="k">None</span>}</td>
                  <td className="k">{c.last ? `${c.last.kind === "theirs" ? "They wrote" : "Sent"} ${when(c.last.at)}` : WA_STATUS[c.status][0]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length ? null : <div className="empty">{contacts.length ? "No contacts match." : "No contacts yet. Use Add contacts to type one in or upload a sheet."}</div>}
      </section>
      {adding ? <AddContacts campaigns={campaigns} segments={segments} onAdded={reload} onClose={() => setAdding(false)} /> : null}
      {open ? <ContactDrawer id={open} campaigns={campaigns} onClose={() => setOpen(0)} onChanged={reload} /> : null}
    </>
  );
}
