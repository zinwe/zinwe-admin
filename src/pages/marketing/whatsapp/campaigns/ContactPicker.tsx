import { useState, type ReactElement } from "react";
import { Modal } from "../../../../components/Modal";
import { useToast } from "../../../../components/Toast";
import { addToWaCampaign, type WaCampaign, type WaContact } from "../../../../lib/whatsappApi";
import { errText } from "../shared";

/** Pick contacts to add to this campaign: unassigned first, or move ones from another campaign that haven't been messaged. */
export function ContactPicker({ campaign, contacts, onClose, onAdded }: { campaign: WaCampaign; contacts: WaContact[]; onClose: () => void; onAdded: () => void }): ReactElement {
  const toast = useToast();
  const [from, setFrom] = useState<"free" | "other">("free");
  const [seg, setSeg] = useState("");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const movable = (c: WaContact) => c.step === 0 && !c.yes_date && c.status !== "stop" && c.campaign !== campaign.id;
  const pool = contacts.filter((c) => movable(c) && (from === "free" ? !c.campaign : !!c.campaign));
  const segments = [...new Set(pool.map((c) => c.segment))].sort();
  const needle = q.trim().toLowerCase();
  const rows = pool.filter((c) => (!seg || c.segment === seg) && (!needle || `${c.firm} ${c.phone} ${c.city}`.toLowerCase().includes(needle)));
  const all = rows.length > 0 && rows.every((c) => picked.has(c.id));
  const toggle = (id: number) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const add = async () => {
    setBusy(true);
    try {
      const r = await addToWaCampaign(campaign.id as number, [...picked]);
      toast(`${r.added} contact${r.added === 1 ? "" : "s"} added${r.skipped ? `, ${r.skipped} skipped (already messaged or stopped)` : ""}. Nothing was sent.`);
      onAdded();
      onClose();
    } catch (err) {
      toast(errText(err, "Couldn't add them."), "bad");
      setBusy(false);
    }
  };
  return (
    <Modal title={`Add contacts to ${campaign.name}`} subtitle="Only contacts who haven’t had a message yet can join. Nothing is sent now." onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="button" className="btn dark" disabled={busy || !picked.size} onClick={() => void add()}>{picked.size ? `Add ${picked.size} contact${picked.size === 1 ? "" : "s"}` : "Pick contacts"}</button></>}>
      <div className="mk wa-picker">
        <div className="seg" role="tablist" aria-label="From">
          <button type="button" role="tab" aria-selected={from === "free"} className={from === "free" ? "on" : ""} onClick={() => { setFrom("free"); setPicked(new Set()); }}>Not in a campaign <span className="k">{contacts.filter((c) => movable(c) && !c.campaign).length}</span></button>
          <button type="button" role="tab" aria-selected={from === "other"} className={from === "other" ? "on" : ""} onClick={() => { setFrom("other"); setPicked(new Set()); }}>From other campaigns <span className="k">{contacts.filter((c) => movable(c) && !!c.campaign).length}</span></button>
        </div>
        <div className="fr">
          <select className={"inp" + (seg ? " set" : "")} aria-label="Segment" value={seg} onChange={(e) => setSeg(e.target.value)}>
            <option value="">All segments</option>
            {segments.map((x) => <option key={x}>{x}</option>)}
          </select>
          <input type="search" className="inp" aria-label="Search" placeholder="Search business, phone or city" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="scroll wa-picker__list">
          <table className="tbl">
            <thead><tr>
              <th scope="col"><input type="checkbox" aria-label="Pick all shown" checked={all} onChange={() => setPicked((p) => { const n = new Set(p); rows.forEach((c) => (all ? n.delete(c.id) : n.add(c.id))); return n; })} /></th>
              <th scope="col">Business</th><th scope="col">Segment</th><th scope="col">{from === "free" ? "City" : "Now in"}</th><th scope="col">Opt-in</th>
            </tr></thead>
            <tbody>
              {rows.slice(0, 300).map((c) => (
                <tr key={c.id} className="click" onClick={() => toggle(c.id)}>
                  <td><input type="checkbox" aria-label={`Pick ${c.firm}`} checked={picked.has(c.id)} onChange={() => toggle(c.id)} onClick={(e) => e.stopPropagation()} /></td>
                  <th scope="row">{c.short_name || c.firm}<span className="k" style={{ display: "block" }}>{c.phone}</span></th>
                  <td>{c.segment}</td>
                  <td className="k">{from === "free" ? c.city : c.campaign_name}</td>
                  <td>{c.opted_in ? <span className="pill good">Opted in</span> : <span className="pill">Not yet</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length ? null : <div className="empty">{pool.length ? "No contacts match." : from === "free" ? "Every contact is in a campaign. Try From other campaigns." : "No contacts to move."}</div>}
        </div>
        <span className="k">{rows.length > 300 ? `Showing 300 of ${rows.length}: search or pick a segment to narrow it. ` : ""}Contacts already messaged stay in their campaign, so nobody gets two first messages.</span>
      </div>
    </Modal>
  );
}
