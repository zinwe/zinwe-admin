import { useRef, useState, type DragEvent, type ReactElement } from "react";
import { ApiError } from "../../lib/api";
import { actOnContact, addContactFile, downloadContactTemplate, importContacts, reviewContactFile, type Contact, type FileRow, type ImportResult } from "../../lib/marketingApi";
import { Modal } from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { ApproveBar, isDue, nice, Pill, STATUS, type Ctx } from "./campaignShared";

const RESULT: Record<FileRow["result"], string> = { ready: "good", good: "", warn: "warn", bad: "bad" };

function UploadFile({ id, onAdded }: { id: number; onAdded: () => void }): ReactElement {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<FileRow[] | null>(null);
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);

  const review = async (picked: File | undefined) => {
    if (!picked) return;
    setBusy(true);
    setProblem("");
    try {
      const r = await reviewContactFile(id, picked);
      setFile(picked);
      setRows(r.rows);
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : "Couldn't read that file.");
    }
    setBusy(false);
    if (input.current) input.current.value = "";
  };
  const add = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const r = await addContactFile(id, file);
      toast(`${r.added} contact${r.added === 1 ? "" : "s"} added. No email has gone out.`);
      onAdded();
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : "Couldn't add those.");
      setBusy(false);
    }
  };
  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    void review(e.dataTransfer.files[0]);
  };

  if (rows) {
    const ready = rows.filter((r) => r.result === "ready").length;
    return (
      <div className="mk mk-imp">
        <div className="rvsum">
          <span><b>{ready}</b> <span className="k">ready to add</span></span>
          <span><b>{rows.length - ready}</b> <span className="k">will be skipped</span></span>
          <span className="k">{file?.name}</span>
        </div>
        <div className="rvlist">
          <table className="tbl">
            <caption className="sr">What happens to each row</caption>
            <thead><tr><th scope="col">Row</th><th scope="col">Contact</th><th scope="col">Email</th><th scope="col">What happens</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.row}>
                  <td className="num">{r.row}</td>
                  <th scope="row">{r.first_name || "—"}<span className="k" style={{ display: "block" }}>{r.firm || "—"}</span></th>
                  <td>{r.email || "—"}</td>
                  <td><span className={"pill " + RESULT[r.result]}>{r.message}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {problem ? <span className="aferr" role="alert">{problem}</span> : null}
        <div className="fr between">
          <button type="button" className="btn" disabled={busy} onClick={() => { setRows(null); setFile(null); }}>Choose another file</button>
          <button type="button" className="btn dark" disabled={busy || !ready} onClick={() => void add()}>{ready ? `Add ${ready} contact${ready === 1 ? "" : "s"}` : "Nothing to add"}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mk mk-imp">
      <div className="fmt" aria-label="File format">
        <span>First name</span><span>Firm</span><span>Email</span><span>City <em>optional</em></span>
      </div>
      <div className="fr between">
        <span className="k">Put these headers in the first row, one person per row.</span>
        <button type="button" className="btn sm" onClick={() => void downloadContactTemplate().catch(() => toast("Couldn't download the template.", "bad"))}>Download template</button>
      </div>
      <label className={"dropz" + (over ? " over" : "")} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={drop}>
        <input ref={input} className="sr" type="file" accept=".xlsx,.csv" aria-label="Choose a contact file" onChange={(e) => void review(e.target.files?.[0])} />
        <b>{busy ? "Reading your file" : "Drop your Excel file here, or click to choose"}</b>
        <span className="k">.xlsx or .csv, up to 2 MB and 2,000 rows. You review every row before anything is added.</span>
      </label>
      {problem ? <span className="aferr" role="alert">{problem}</span> : null}
    </div>
  );
}

function TypeContacts({ id }: { id: number }): ReactElement {
  const toast = useToast();
  const [text, setText] = useState("");
  const [results, setResults] = useState<ImportResult[]>([]);
  const [busy, setBusy] = useState(false);
  const check = async () => {
    setBusy(true);
    try {
      const r = await importContacts(id, text);
      setResults(r.results);
      setText("");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't add those.", "bad");
    }
    setBusy(false);
  };
  return (
    <div className="mk mk-imp">
      <span className="k">One per line: first name, firm, email, city.</span>
      <textarea rows={6} aria-label="Contacts" placeholder="Ella, Prairie Wind CPAs, ella@prairiewind.com, Dallas" value={text} onChange={(e) => setText(e.target.value)} />
      {results.map((r, i) => <div key={i}><span className={"pill " + r.result}>{r.message}</span> {r.line}</div>)}
      <button type="button" className="btn dark mk-start" disabled={busy || !text.trim()} onClick={() => void check()}>Check and add</button>
    </div>
  );
}

function AddContacts({ id, onClose }: { id: number; onClose: () => void }): ReactElement {
  const [mode, setMode] = useState<"file" | "type">("file");
  return (
    <Modal title="Add contacts" subtitle="Named work addresses only, one person per firm, filtered and checked. Never a bought list. Blocked addresses are skipped." onClose={onClose} footer={<button type="button" className="btn" onClick={onClose}>Close</button>}>
      <div className="mk mk-imp">
        <div className="seg" role="group" aria-label="How to add">
          <button type="button" className={mode === "file" ? "on" : ""} onClick={() => setMode("file")}>Upload a file</button>
          <button type="button" className={mode === "type" ? "on" : ""} onClick={() => setMode("type")}>Type them in</button>
        </div>
        {mode === "file" ? <UploadFile id={id} onAdded={onClose} /> : <TypeContacts id={id} />}
      </div>
    </Modal>
  );
}

export function ContactsTab({ c, sender, contacts, run, go, openContact, show }: Ctx & { show: string }): ReactElement {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [adding, setAdding] = useState(false);
  const views: [string, string, (x: Contact) => boolean][] = [
    ["all", "All", () => true], ["due", "Due now", isDue], ["you", "Needs you", (x) => x.status === "paused" || x.status === "waiting"],
    ["opted", "Opted in", (x) => x.status === "opted" || x.status === "signed"], ["blocked", "Do not email", (x) => x.status === "suppressed"],
  ];
  const test = views.find((x) => x[0] === show)?.[2] ?? (() => true);
  const list = contacts.filter((x) => test(x) && (!status || x.status === status) && (!q || `${x.first_name} ${x.firm} ${x.email} ${x.city}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <>
      <ApproveBar c={c} run={run} onShow={() => go("contacts", "due")} />
      {show === "you" ? <p className="mk-note">Replies arrive in the {sender.reply_to} inbox. Read them there, then open the contact and record what they said so the flow moves on.</p> : null}
      <section className="card finder" aria-label="Find contacts">
        <div className="fr">
          <div className="search"><input type="search" className="inp" aria-label="Search contacts" placeholder="Search name, firm, email or city" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <select className={"inp" + (status ? " set" : "")} aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Any status</option>
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v[0]}</option>)}
          </select>
          <button type="button" className="btn dark" onClick={() => setAdding(true)}>Add contacts</button>
        </div>
        <div className="fr" role="group" aria-label="Show">
          {views.map(([k, label, f]) => (
            <button key={k} type="button" className={"chip" + (show === k ? " on" : "")} aria-pressed={show === k} onClick={() => go("contacts", k === "all" ? undefined : k)}>{label}<span>{contacts.filter(f).length}</span></button>
          ))}
        </div>
      </section>
      <section className="card tablebox" aria-label="Contacts">
        {list.length ? (
          <div className="scroll">
            <table className="tbl">
              <caption className="sr">Contacts</caption>
              <thead><tr><th scope="col">Contact</th><th scope="col">City</th><th scope="col">Status</th><th scope="col">Last email</th><th scope="col">Next email</th><th scope="col">Send on</th><th scope="col">Installed</th></tr></thead>
              <tbody>
                {list.map((x) => (
                  <tr key={x.id} className="click" onClick={() => openContact(x)}>
                    <th scope="row"><button type="button" className="cobtn">{x.first_name}</button><span className="k">{x.firm}</span></th>
                    <td>{x.city}</td><td><Pill s={x.status} /></td>
                    <td>{x.last_email ? `Email ${x.last_email}` : "—"}</td>
                    <td>{x.next_email ? `Email ${x.next_email}` : "—"}</td>
                    <td>{nice(x.next_date)}</td><td>{x.installed ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : contacts.length ? <div className="empty">No contacts match these filters.</div> : (
          <div className="empty">
            <b>No contacts yet</b>
            <span>Upload your Excel file to fill this campaign.</span>
            <button type="button" className="btn dark" onClick={() => setAdding(true)}>Add contacts</button>
          </div>
        )}
      </section>
      {adding ? <AddContacts id={c.id} onClose={() => { setAdding(false); void run(async () => undefined); }} /> : null}
    </>
  );
}

export function ContactDrawer({ x, onClose, onActed }: { x: Contact; onClose: () => void; onActed: () => void }): ReactElement {
  const toast = useToast();
  const act = async (action: string, note = "") => {
    try {
      await actOnContact(x.id, action, note);
      toast("Updated.");
      onActed();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't update that.", "bad");
    }
  };
  const locked = x.status === "suppressed";
  return (
    <Modal title={x.first_name} subtitle={x.firm} size="drawer" className="mk-drawer" onClose={onClose}>
      <div className="mk-sec">
        <dl>
          <dt>Email</dt><dd>{x.email}</dd>
          <dt>City</dt><dd>{x.city || "—"}</dd>
          <dt>Status</dt><dd><Pill s={x.status} /></dd>
          <dt>Next email</dt><dd>{x.next_email ? `Email ${x.next_email}, ${nice(x.next_date)}` : "—"}</dd>
          {x.proof ? <><dt>Proof of yes</dt><dd>{x.proof}</dd></> : null}
          {x.reason ? <><dt>Reason</dt><dd>{x.reason}</dd></> : null}
        </dl>
      </div>
      {locked ? <p className="mk-note">This address is on Do not email and stays blocked.</p> : (
        <div className="mk-sec">
          <h3>What did they do?</h3>
          <div className="mk-acts">
            <button type="button" className="btn sm" onClick={() => void act("yes")}>Said yes</button>
            <button type="button" className="btn sm" onClick={() => void act("signed")}>Signed up</button>
            <button type="button" className="btn sm" onClick={() => void act("installed")}>Installed</button>
            <button type="button" className="btn sm" onClick={() => void act("notnow")}>Not now</button>
            {x.status === "paused" ? <button type="button" className="btn sm" onClick={() => void act("resume")}>I replied, resume</button> : <button type="button" className="btn sm" onClick={() => void act("question")}>Has a question</button>}
            <button type="button" className="btn sm" onClick={() => void act("noreply")}>No reply, close</button>
            <button type="button" className="btn sm danger" onClick={() => void act("no")}>No or unsubscribe</button>
            <button type="button" className="btn sm danger" onClick={() => void act("bounce")}>Hard bounce</button>
            <button type="button" className="btn sm danger" onClick={() => void act("complaint")}>Spam complaint</button>
          </div>
        </div>
      )}
      <div className="mk-sec">
        <h3>History</h3>
        <ul className="log">{x.events.map((e, i) => <li key={i}>{nice(e.at)}: {e.text}</li>)}</ul>
      </div>
    </Modal>
  );
}
