/**
 * Contacts → Add contacts (owner's board, 12 Nov 2026): upload the sheet, check each row, add them; or add one person
 * by hand. Nothing is sent: new contacts wait until a live campaign picks them up. Same upload API as before
 * (POST /contacts/upload/ to check, again with `add` to add).
 */
import { useRef, useState, type DragEvent, type ReactElement } from "react";
import { useToast } from "../../../components/Toast";
import { ApiError } from "../../../lib/api";
import {
  addWaContact, addWaFile, downloadWaTemplate, reviewWaFile, type WaCampaign, type WaChoice, type WaFileRow, type WaNewContact,
} from "../../../lib/whatsappApi";
import { phoneText } from "./contactsModel";
import { errText } from "./shared";

const CHECK: Record<WaFileRow["result"], string> = { ready: "is-ok", warn: "is-warn", locked: "is-warn", bad: "is-warn" };

function Sheet({ campaigns, onAdded }: { campaigns: WaCampaign[]; onAdded: (added: number, locked: number) => void }): ReactElement {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<WaFileRow[] | null>(null);
  const [choices, setChoices] = useState<Record<string, WaChoice>>({});
  const [campaign, setCampaign] = useState<number | null>(null);
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
  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    void review(e.dataTransfer.files[0]);
  };

  if (rows && file) {
    const take = rows.filter((r) => r.result !== "bad" && choices[r.row]?.include);
    const locked = take.filter((r) => r.result === "locked").length;
    const bad = rows.filter((r) => r.result === "bad").length;
    const skipped = rows.length - bad - take.length;
    const segments = [...new Set(rows.map((r) => r.segment).filter(Boolean))];
    const add = async () => {
      setBusy(true);
      try {
        const all = Object.fromEntries(Object.entries(choices).map(([k, v]) => [k, { ...v, campaign }]));
        const r = await addWaFile(file, all);
        onAdded(r.added, locked);
      } catch (err) {
        setProblem(errText(err, "Couldn't add those."));
        setBusy(false);
      }
    };
    return (
      <>
        <div className="wt-head wcx-subhead">
          <div>
            <h2>Check each row · {file.name}</h2>
            <p>
              {rows.length} row{rows.length === 1 ? "" : "s"}: {take.length - locked} ready{locked ? `, ${locked} locked until they opt in` : ""}
              {bad ? `, ${bad} left out` : ""}{skipped ? `, ${skipped} you unticked` : ""}.
            </p>
          </div>
          <div className="wt-tools">
            <label className="wt-sel">Campaign
              <select value={campaign ?? 0} aria-label="Campaign for these contacts" onChange={(e) => setCampaign(Number(e.target.value) || null)}>
                <option value={0}>No campaign yet</option>
                {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <button type="button" className="wt-btn" disabled={busy} onClick={() => { setRows(null); setFile(null); }}>Choose another file</button>
          </div>
        </div>
        <div className="wcx-scroll">
          <table className="wcx-table wcx-check">
            <caption className="sr">Rows to check</caption>
            <thead><tr><th scope="col">ROW</th><th scope="col">BUSINESS AND NUMBER</th><th scope="col">SEGMENT</th><th scope="col" className="wcx-hide-s">OPTED IN</th><th scope="col" className="wcx-hide-s">CHECK</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const ch = choices[r.row];
                const out = r.result === "bad";
                return (
                  <tr key={r.row} className={out || !ch?.include ? "is-off" : ""}>
                    <td>
                      <label className="wcx-cell wcx-rowno">
                        <input type="checkbox" aria-label={`Add row ${r.row}`} checked={!out && !!ch?.include} disabled={out} onChange={(e) => set(r.row, { include: e.target.checked })} />
                        <span>{r.row}</span>
                      </label>
                    </td>
                    <td>
                      <div className="wcx-cell">
                        <span>{r.firm || "No business name"}</span>
                        <small>{r.phone ? phoneText(r.phone) : "No number"}{r.city ? ` · ${r.city}` : ""}</small>
                        <small className={"wcx-phoneonly wcx-chk " + CHECK[r.result]}>{r.result === "ready" ? "✓ Ready" : r.message}</small>
                      </div>
                    </td>
                    <td>
                      <div className="wcx-cell">
                        <input className="wcx-inp" list="wcx-segments" aria-label={`Segment for row ${r.row}`} value={ch?.segment ?? ""} disabled={out} onChange={(e) => set(r.row, { segment: e.target.value })} />
                      </div>
                    </td>
                    <td className="wcx-hide-s"><div className="wcx-cell"><span>{r.result === "locked" ? "No" : out ? "—" : "Yes"}</span></div></td>
                    <td className="wcx-hide-s"><div className="wcx-cell"><span className={"wcx-chk " + CHECK[r.result]}>{r.result === "ready" ? "✓ Ready" : r.message}</span></div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <datalist id="wcx-segments">{segments.map((s) => <option key={s} value={s} />)}</datalist>
        </div>
        {problem ? <p className="wcx-problem" role="alert">{problem}</p> : null}
        <div className="wcx-save">
          <button type="button" className="wt-btn is-dark" disabled={busy || !take.length} onClick={() => void add()}>
            {take.length ? `Add ${take.length} contact${take.length === 1 ? "" : "s"}` : "Nothing to add"}
          </button>
          <span>Rows with a problem are left out. Not opted in rows are added but locked until they agree.</span>
        </div>
      </>
    );
  }
  return (
    <>
      <label className={"wcx-upload" + (over ? " is-over" : "")} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={drop}>
        <input ref={input} className="sr" type="file" accept=".xlsx,.csv" aria-label="Choose the contact sheet" onChange={(e) => void review(e.target.files?.[0])} />
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></svg>
        <b>{busy ? "Reading the sheet" : "Drop the sheet here, or choose a file"}</b>
        <span>Columns: Business Name, Phone, Segment, Country, City, Opt-in (Y when they agreed). First Name, Source and Useful Info if you have them. The first row is the header.</span>
        <span className="wt-btn is-dark" aria-hidden="true">Choose a file</span>
      </label>
      {problem ? <p className="wcx-problem" role="alert">{problem}</p> : null}
      <p className="wcx-note">Excel (.xlsx) or CSV. A phone with its country code, or 10 digits for India or the USA. You check every row before anything is added. Numbers that said STOP before are always left out.</p>
    </>
  );
}

const EMPTY: WaNewContact = {
  firm: "", phone: "", segment: "", country: "India", city: "", first_name: "", source: "", campaign: null,
  opted_in: false, opt_in_note: "", notes: "",
};

/** One person by hand. Save and add next keeps segment, country, city, source, campaign and opt-in. */
function OnePerson({ campaigns, segments, onAdded }: { campaigns: WaCampaign[]; segments: string[]; onAdded: () => void }): ReactElement {
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
  const save = async () => {
    setBusy(true);
    try {
      const c = await addWaContact(f);
      onAdded();
      setAdded((a) => [c.firm, ...a]);
      toast(`${c.firm} added${c.opted_in ? "" : ", locked until they opt in"}. Nothing was sent.`);
      setF((x) => ({ ...x, firm: "", phone: "", first_name: "", notes: "" }));
      setErrors({});
      first.current?.focus();
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setErrors(err.fields);
      else toast(errText(err, "Couldn't add this contact."), "bad");
    }
    setBusy(false);
  };
  const field = (key: keyof WaNewContact, label: string, input: ReactElement, help?: string) => (
    <label className="wt-f">
      {label}
      {input}
      {errors[key] ? <small className="field-err" role="alert">{errors[key]}</small> : help ? <small>{help}</small> : null}
    </label>
  );
  const ready = f.firm.trim() && f.phone.trim() && f.segment.trim() && f.city.trim();
  return (
    <form className="wcx-one" noValidate onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <div className="wcx-grid">
        {field("firm", "Business name", <input ref={first} maxLength={160} value={f.firm} onChange={(e) => set({ firm: e.target.value })} />)}
        {field("phone", "WhatsApp number", <input inputMode="tel" maxLength={30} placeholder="+91 98100 00000" value={f.phone} onChange={(e) => set({ phone: e.target.value })} />, "Country code, or 10 digits for India or the USA")}
        {field("first_name", "First name", <input maxLength={80} value={f.first_name} onChange={(e) => set({ first_name: e.target.value })} />, "Only if you know the person’s name")}
        {field("segment", "Segment", <input list="wcx-add-segments" maxLength={120} placeholder="Example: CA firms" value={f.segment} onChange={(e) => set({ segment: e.target.value })} />)}
        {field("country", "Country", (
          <select value={f.country} onChange={(e) => set({ country: e.target.value as WaNewContact["country"] })}>
            <option>India</option>
            <option>USA</option>
          </select>
        ))}
        {field("city", "City", <input maxLength={80} value={f.city} onChange={(e) => set({ city: e.target.value })} />)}
        {field("source", "How we know them", <input maxLength={160} placeholder="Example: ICAI Jaipur list" value={f.source} onChange={(e) => set({ source: e.target.value })} />)}
        {field("campaign", "Campaign", (
          <select value={f.campaign ?? 0} onChange={(e) => set({ campaign: Number(e.target.value) || null })}>
            <option value={0}>No campaign yet</option>
            {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        ))}
      </div>
      {field("notes", "Notes for the first message", <input maxLength={500} placeholder="Example: just opened a second office in Pune" value={f.notes} onChange={(e) => set({ notes: e.target.value })} />, "Used for the personal first line. Only true things.")}
      <label className="wf-chk">
        <input type="checkbox" checked={f.opted_in} onChange={(e) => set({ opted_in: e.target.checked })} />
        <span><b>They agreed to hear from us on WhatsApp.</b> Replied to an email, said yes on a call, or were introduced.</span>
      </label>
      {f.opted_in ? field("opt_in_note", "How did they agree?", <input maxLength={200} placeholder="Example: said yes on the phone, 5 Nov" value={f.opt_in_note} onChange={(e) => set({ opt_in_note: e.target.value })} />)
        : <small className="wcx-note">Without it they are added locked: nothing is drafted for them until you mark them opted in.</small>}
      <datalist id="wcx-add-segments">{segments.map((s) => <option key={s} value={s} />)}</datalist>
      <div className="wcx-save wcx-save--in">
        <button type="submit" className="wt-btn is-dark" disabled={busy || !ready}>Add and start the next</button>
        <span>{added.length ? `${added.length} added: ${added.slice(0, 3).join(", ")}${added.length > 3 ? "…" : ""}` : "Nothing is sent when you add a contact."}</span>
      </div>
    </form>
  );
}

/** The Add contacts view in the main column. */
export function AddContacts({ campaigns, segments, onAdded, onClose }: {
  campaigns: WaCampaign[]; segments: string[]; onAdded: () => void; onClose: () => void;
}): ReactElement {
  const toast = useToast();
  const [how, setHow] = useState<"sheet" | "one">("sheet");
  return (
    <>
      <div className="wt-head">
        <div>
          <h2>Add contacts</h2>
          <p>Upload the contact sheet (Excel or CSV), or add one person by hand. Nothing is sent: new contacts wait until a live campaign picks them up.</p>
        </div>
        <div className="wt-tools">
          <div className="wt-tabs" role="group" aria-label="How to add">
            <button type="button" aria-pressed={how === "sheet"} onClick={() => setHow("sheet")}>A sheet</button>
            <button type="button" aria-pressed={how === "one"} onClick={() => setHow("one")}>One person</button>
          </div>
          {how === "sheet" ? <button type="button" className="wt-btn" onClick={() => void downloadWaTemplate().catch(() => toast("Couldn't download the sheet.", "bad"))}>Blank sheet</button> : null}
          <button type="button" className="wt-btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
      {how === "sheet"
        ? <Sheet campaigns={campaigns} onAdded={(added, locked) => {
            toast(`${added} contact${added === 1 ? "" : "s"} added${locked ? `; ${locked} wait${locked === 1 ? "s" : ""} for an opt-in` : ""}. Nothing was sent.`);
            onAdded();
            onClose();
          }} />
        : <OnePerson campaigns={campaigns} segments={segments} onAdded={onAdded} />}
    </>
  );
}
