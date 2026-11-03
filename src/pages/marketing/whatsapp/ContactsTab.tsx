import { Fragment, useRef, useState, type DragEvent, type ReactElement } from "react";
import { Modal } from "../../../components/Modal";
import { useToast } from "../../../components/Toast";
import {
  actOn, addWaFile, deleteWaContact, downloadWaTemplate, getWaContact, patchWaContact, reviewWaFile,
  type WaCampaign, type WaChoice, type WaContact, type WaFileRow, type WaStatus,
} from "../../../lib/whatsappApi";
import { Bubble, errText, nameOf, when, WaPill, WA_STATUS } from "./shared";

const RESULT: Record<WaFileRow["result"], string> = { ready: "good", warn: "warn", bad: "bad" };
const COLUMNS = ["Business Name", "Phone", "Segment", "Country", "City"];
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
    const segments = [...new Set(rows.map((r) => r.segment).filter(Boolean))];
    return (
      <section className="card editor">
        <div className="fighead"><h2>Check each row</h2><span className="k">{file?.name} · {keep} to add</span></div>
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
      </section>
    );
  }
  return (
    <section className="card editor">
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
        <span className="k">.xlsx or .csv. Phone with country code, or a 10-digit number for India or the USA. You check every row before anything is added. Numbers that asked to stop are always skipped.</span>
      </label>
      {problem ? <span className="aferr" role="alert">{problem}</span> : null}
    </section>
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
          <div className="fr"><WaPill s={c.status} />{c.paused_until ? <span className="pill">Paused until {when(c.paused_until)}</span> : null}</div>
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
  ["ready", "Ready", (c) => c.status === "ready"],
  ["talking", "In conversation", (c) => c.status === "messaged" || c.status === "replied"],
  ["won", "Interested or signed up", (c) => c.status === "interested" || c.status === "signed"],
  ["stop", "Do not message", (c) => c.status === "stop"],
];

export function ContactsTab({ contacts, campaigns, reload }: { contacts: WaContact[]; campaigns: WaCampaign[]; reload: () => void }): ReactElement {
  const [view, setView] = useState("all");
  const [seg, setSeg] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(0);
  const test = VIEWS.find((v) => v[0] === view)?.[2] ?? (() => true);
  const segments = [...new Set(contacts.map((c) => c.segment))].sort();
  const needle = q.trim().toLowerCase();
  const rows = contacts.filter((c) => test(c) && (!seg || c.segment === seg) && (!needle || `${c.firm} ${c.first_name} ${c.phone} ${c.city}`.toLowerCase().includes(needle)));
  return (
    <>
      <Upload campaigns={campaigns} onAdded={reload} />
      <section className="card finder" aria-label="Find contacts">
        <div className="fr">
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
                  <th scope="row"><button type="button" className="cobtn" onClick={(e) => { e.stopPropagation(); setOpen(c.id); }}>{c.firm}</button><span className="k" style={{ display: "block" }}>{c.first_name || "—"} · {c.city}</span></th>
                  <td className="num">{c.phone}</td>
                  <td>{c.segment}</td>
                  <td><WaPill s={c.status as WaStatus} /></td>
                  <td>{c.campaign_name || <span className="k">None</span>}</td>
                  <td className="k">{c.last ? `${c.last.kind === "theirs" ? "They wrote" : "Sent"} ${when(c.last.at)}` : WA_STATUS[c.status][0]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length ? null : <div className="empty">{contacts.length ? "No contacts match." : "No contacts yet. Upload a sheet above."}</div>}
      </section>
      {open ? <ContactDrawer id={open} campaigns={campaigns} onClose={() => setOpen(0)} onChanged={reload} /> : null}
    </>
  );
}
